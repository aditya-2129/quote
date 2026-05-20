# Roadmap: Path to Enterprise-Grade CAD Intelligence

## Context

**Scope reminder:** This is a single-user, locally-installed Tauri desktop app. No web build, no SaaS, no multi-user server, no shared backend. Every feature in this roadmap must run inside one user's Tauri process with local SQLite + local filesystem only. Anything implying a remote service, multi-tenant data model, or browser deployment is out of scope by default and must be re-justified before entering the plan.

The app is currently a strong prototype of a desktop quoting tool: Tauri 2 + React 19, `occt-import-js` for STEP tessellation, mesh-based duplicate grouping, heuristic shape classification, deterministic quote costing. The current geometry layer is unusually solid for a solo build (the radial-signature fingerprinting in `src/utils/meshFingerprint.ts` is genuinely good engineering).

But the system has a hard ceiling: **it operates on triangles, not BREP topology**. Without analytic surface/face access, the app cannot reliably do feature recognition, accessibility analysis, tolerance-aware costing, or any of the things that separate a quoting prototype from an enterprise manufacturing intelligence platform.

This document is the long-term roadmap to close that gap, ordered by dependency. The moat is deterministic geometric intelligence; AI on top of that is multiplicative, AI without it is a demo — so AI work is tracked in a separate plan (`plans/ai-roadmap.md`, to be written) and is intentionally out of scope here.

Current realistic position: ~15–25% toward enterprise-grade. The architecture direction is correct; the missing pieces are scope, not redesign.

---

## Confirmed Infrastructure Gaps (from audit)

| Area | Current state | File |
|------|---------------|------|
| Rust side | Pure plugin shell, zero CAD logic | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` |
| Test framework | None | (absent) |
| Test fixtures | None | (absent) |
| Web Workers | None — `occt-import-js` blocks main thread | `src/utils/cad.ts:340` |
| Geometry cache | Source bytes + bbox/volume only; no fingerprint/topology cache | `src/db/schema/quote_cad_sources.ts`, `src/db/schema/part_geometry.ts` |
| Error tracking | No Sentry, no ErrorBoundary | (absent) |
| Edge count | Fabricated `faceCount * 1.5` | `src/utils/cad.ts:278` |
| BREP access | None — only triangulated mesh | `src/utils/cad.ts:340-409` |
| Feature recognition | None | (absent) |
| Tolerance/PMI extraction | None | (absent) |

---

## Phase 0 — Foundation Hygiene (1–2 weeks)

Before deeper investment, close the holes that will compound debt later.

### 0.1 Test infrastructure
- Add `vitest` + `@testing-library/react` to devDependencies
- Create `tests/fixtures/step/` with 15–25 real STEP files covering: simple machined parts, hex bar, threaded holes, brackets, assemblies, mirrored instances, near-duplicates, pathological cases
- Write golden tests for `src/utils/meshFingerprint.ts` (duplicate grouping must not regress)
- Write golden tests for `src/utils/shapeAnalysis.ts` (cylinder/hex/box classification per fixture)
- Write tests for `src/utils/quoteCosting.ts` invariants

### 0.2 Fix known bugs
- Remove fabricated `edgeCount: faceCount * 1.5` in `src/utils/cad.ts:278`. Either compute real edge count from triangle adjacency OR drop the field entirely if no downstream consumer needs it (audit `quoteCosting.ts` and `pdfAssembly.ts` first)
- Audit `src/components/CadViewer.tsx` (833 lines) — split into scene/explode/measure/clipping sub-modules. Respect protected explode algorithm per `AGENTS.MD`

### 0.3 Crash observability
- Add React `ErrorBoundary` at app root in `src/App.tsx`
- Add Sentry (or self-hosted GlitchTip) for desktop crash reporting via `@sentry/electron`-equivalent for Tauri, or manual Tauri command bridging crash reports
- Wire `tauri-plugin-log` to disk with rotation

### 0.4 Verify suspicious dependencies
- `typescript ~6.0.2`, `lucide-react ^1.14.0`, `eslint ^10.3.0` are confirmed real (audit verified). No action.

---

## Phase 1 — Async + Caching (2–4 weeks)

### 1.1 Web Worker for STEP import
- Move `occt-import-js` invocation off main thread to a dedicated worker
- Wrap with `comlink` for ergonomic async API
- Critical: `src/utils/cad.ts:340` (`importStepBytes`) currently blocks UI for multi-second imports on large assemblies
- Worker returns serializable mesh data; main thread reconstructs `THREE.BufferGeometry`

### 1.2 Persistent geometry cache
- Extend `src/db/schema/part_geometry.ts` to cache:
  - Mesh fingerprint hash (radial signature digest)
  - Triangle/vertex counts
  - Shape classification result (`ShapeAnalysis` from `src/utils/shapeAnalysis.ts`)
  - Per-mesh face color array
- Key by STEP file SHA-256 + occt-import options digest
- On re-import: skip tessellation entirely if hash hit

### 1.3 Mesh data offloading
- Currently `quote_cad_sources` stores base64 STEP bytes in SQLite — fine for now, but plan migration to file-based blob store under Tauri's app-data dir for files >5 MB

---

## Phase 2 — BREP Topology Access (2–3 months)

**This is the single highest-leverage upgrade.** Without it, every phase after is capped.

### 2.1 Choose integration path

Recommendation: **Rust + `opencascade-rs` bindings in a sidecar Tauri command**.

Rationale:
- Keeps existing Tauri architecture
- Native performance vs WASM
- Full OCCT topology API (faces, edges, wires, surfaces)
- Avoids Python sidecar deployment complexity

Fallback if `opencascade-rs` bindings are insufficient: bundle a small C++ shim using OCCT directly, expose via FFI from Rust.

### 2.2 New Rust module
Create `src-tauri/src/cad/` with:
- `mod.rs` — Tauri command registrations
- `topology.rs` — face/edge/wire extraction
- `surfaces.rs` — analytic surface classification (plane, cylinder, cone, sphere, torus, B-spline)
- `serialize.rs` — JSON-serializable topology payload for JS side

Expose:
```rust
#[tauri::command]
async fn extract_topology(step_bytes: Vec<u8>) -> Result<TopologyPayload, String>
```

### 2.3 JS-side topology model
Create `src/utils/topology.ts`:
- `TopologyGraph` type — face nodes + edge adjacency
- `FaceClass` discriminated union: `Plane | Cylinder | Cone | Sphere | Torus | Spline`
- Each face: exact surface params (plane normal, cylinder axis+radius, etc.), area, bounding box
- Edge classification: `Linear | Circular | Spline`, connecting face IDs

### 2.4 Migrate `shapeAnalysis.ts` to topology
- Replace heuristic triangle-based cylinder/hex detection with exact analytic surface queries
- Keep mesh-based path as fallback for tessellation-only inputs
- Now `analyzeShape()` returns deterministic, exact dimensions instead of histogram-estimated ones

---

## Phase 3 — Feature Recognition Engine (3–4 months)

Built on Phase 2's topology graph. None of this is possible without BREP access.

### 3.1 Hole detection (`src/utils/features/holes.ts`)
- Identify cylindrical face chains
- Classify: through-hole, blind-hole, counterbore, countersink, threaded (heuristic: pitch matches standard thread, or read from PMI in Phase 6)
- Output: hole diameter, depth, axis, hole type

### 3.2 Pocket detection (`src/utils/features/pockets.ts`)
- Find concave region groups (faces with inward-pointing normals forming closed boundary)
- Classify open vs closed pocket
- Depth, footprint, accessibility direction

### 3.3 Other features
- `src/utils/features/slots.ts`
- `src/utils/features/fillets.ts` (cylindrical surface between two faces, tangent edges)
- `src/utils/features/chamfers.ts` (planar face between two faces, linear edges)
- `src/utils/features/bosses.ts`
- `src/utils/features/threads.ts`

### 3.4 Feature graph
- Output is a structured `FeatureList` attached to each `Part`
- New DB table `part_features` keyed by part ID
- Costing engine consumes feature counts/dimensions instead of guessing from bounding box

### 3.5 Accessibility analysis (`src/utils/manufacturing/accessibility.ts`)
- For each feature, determine tool approach directions
- Classify: 3-axis reachable / 4-axis needed / 5-axis needed / lathe-suitable / not machinable
- Detect undercuts, deep narrow pockets, impossible tool reach

---

## Phase 4 — Manufacturing Intelligence (2–3 months)

### 4.1 Machine capability DB
Extend `src/db/schema/machines.ts`:
- Travel limits (X/Y/Z mm)
- Spindle limits (RPM, power)
- Achievable tolerance classes
- Tool magazine capacity
- Material compatibility list

### 4.2 Tooling DB
New `src/db/schema/tools.ts`:
- End mills, drills, taps, inserts
- Diameter, length, flutes, material
- Feeds/speeds matrix per material

### 4.3 Process planner (`src/utils/manufacturing/processPlanner.ts`)
- Input: `FeatureList` + machine list + material
- Output: ordered operation list (`Op10: saw, Op20: face mill, Op30: drill…`)
- Deterministic rules engine, no ML

### 4.4 Cycle time estimator (`src/utils/manufacturing/cycleTime.ts`)
- Material removal volume per operation
- Feed/speed lookup from tooling DB
- Tool change overhead
- Setup time per fixture

### 4.5 DFM engine extension
- Thin wall detection (face pairs with small offset)
- Deep pocket detection (depth-to-width ratio)
- Tool reach violations
- Tolerance feasibility check

---

## Phase 5 — PMI / Drawing Intelligence (2–3 months)

Without this, tolerance-driven costing is impossible — and tolerance is often the single biggest cost driver.

### 5.1 STEP PMI extraction
- OCCT supports STEP AP242 PMI parsing
- Extend Phase 2 Rust module to surface PMI annotations
- Extract: GD&T (flatness, perpendicularity, position), dimensional tolerances, surface finish callouts, thread specs

### 5.2 PDF drawing OCR (optional, lower priority)
- Many shops still send 2D PDFs alongside STEP
- OCR + LLM extraction is one of the few places early AI is justified
- Defer until PMI from STEP proves insufficient

### 5.3 Tolerance-aware costing
- Update `src/utils/quoteCosting.ts` to consume tolerance grades
- Tight tolerances → process upgrade (mill → grind, or +inspection time)

---

## Phase 6 — Historical Intelligence (1–2 months)

### 6.1 Historical quote DB
- New schema: `job_history` with actual runtime, actual margin, actual scrap, actual tooling cost per shipped job
- Manual entry initially; later integrate with shop ERP

### 6.2 Geometry similarity index
- Compute embedding from feature graph + dimensions + material
- Local vector index (sqlite-vss or hnswlib via Rust)
- "Find me past jobs similar to this part"

### 6.3 Estimator calibration
- Compare predicted vs actual on shipped jobs
- Surface systematic biases (e.g., "we underestimate aluminum pocket time by 18%")
- No ML yet — just statistical adjustment

---

## Phase 7 — Multi-Format CAD Robustness (1 month)

Currently STEP-only. Enterprise customers send anything.

- Add Parasolid (`.x_t`) — needs Parasolid SDK license OR OCCT's import
- Add IGES via OCCT
- Add SolidWorks / CATIA via OCCT (limited support) or commercial converter
- Validate every format against the same fixture suite from Phase 0

---

## Critical Files to Modify (master reference)

### Phase 0
- `package.json` (devDeps + scripts)
- `src/utils/cad.ts:278` (edgeCount fix)
- `src/components/CadViewer.tsx` (split into sub-modules)
- `src/App.tsx` (ErrorBoundary)
- new: `tests/fixtures/step/*.step`, `tests/**/*.test.ts`, `vitest.config.ts`

### Phase 1
- `src/utils/cad.ts` (worker offload)
- `src/db/schema/part_geometry.ts` (cache extension)
- new: `src/utils/cadWorker.ts`, `src/workers/occt.worker.ts`

### Phase 2
- `src-tauri/Cargo.toml` (add `opencascade-rs` or equivalent)
- new: `src-tauri/src/cad/{mod,topology,surfaces,serialize}.rs`
- new: `src/utils/topology.ts`
- `src/utils/shapeAnalysis.ts` (migrate to topology, keep mesh fallback)
- `src/utils/cadHandoff.ts` (consume topology graph)

### Phase 3
- new: `src/utils/features/*.ts`
- new: `src/utils/manufacturing/accessibility.ts`
- new: `src/db/schema/part_features.ts`

### Phase 4
- `src/db/schema/machines.ts` (extend)
- new: `src/db/schema/tools.ts`
- new: `src/utils/manufacturing/{processPlanner,cycleTime}.ts`
- `src/utils/quoteCosting.ts` (consume feature graph)

### Phase 5
- `src-tauri/src/cad/pmi.rs`
- new: `src/utils/pmi.ts`
- `src/utils/quoteCosting.ts` (tolerance-aware)

### Phase 6
- new: `src/db/schema/job_history.ts`
- new: `src/utils/similarity.ts`

### Phase 7
- `src-tauri/src/cad/import.rs` (multi-format)

---

## Verification Strategy

Each phase gets its own verification gate. Do not advance to phase N+1 until phase N verifies.

### Phase 0 verification
- `npm run test` — all golden tests pass on fixture suite
- `npm run lint` clean
- `npm run build` clean
- Manually crash the app → Sentry receives report → ErrorBoundary shows fallback UI

### Phase 1 verification
- Import a 50 MB STEP file → UI remains responsive (frame time <50ms) during import
- Re-import same file → completes in <500ms from cache
- Cache hit rate logged and visible in dev UI

### Phase 2 verification
- For 10 reference STEP files, extracted topology matches manual inspection in OCCT viewer
- `analyzeShape()` returns exact cylinder dia (no histogram error) on shaft fixtures
- Topology graph round-trips through DB cache without drift

### Phase 3 verification
- Hole count per fixture matches ground truth ±0 (not ±1)
- Pocket detection: visual overlay in CadViewer shows correct face groups
- Accessibility classification matches CAM software output on 5 reference parts

### Phase 4 verification
- Process planner output reviewed by domain expert (shop floor input required)
- Cycle time estimator: ±20% of actual on 10 historical jobs
- DFM warnings match human reviewer ≥80%

### Phase 5 verification
- PMI extraction: tolerance callouts match drawing on 10 PMI-annotated STEP files
- Cost delta for ±0.01 vs ±0.1 reflects in final quote correctly

### Phase 6 verification
- Similarity search retrieves expected past jobs on 20 hand-curated queries (top-5 precision ≥0.7)

### Phase 7 verification
- Same fixture suite runs across all supported formats with consistent feature output

---

## Honest Caveats

- **Phase 2 is the riskiest.** `opencascade-rs` maturity must be validated with a 1-week spike before committing.
- **Phase 4 needs domain expertise the codebase doesn't currently have.** A manufacturing engineer must validate the process planner output, or it will be wrong in ways the developer can't detect.
- **Phase 5 PMI quality varies wildly across CAD authoring tools.** Real customer files needed for testing, not just OCCT samples.
- **Total wall-clock estimate: 15–24 months solo, 6–12 months with one specialist hire (CAD/manufacturing engineer).**
- This document is intentionally aggressive on scope. Cut ruthlessly if commercial validation suggests a narrower product.
