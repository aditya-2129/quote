# Issues — Path to Enterprise-Grade CAD Intelligence

Local issue tracker for the roadmap in `plans/enterprise-cad-roadmap.md`.

44 vertical-slice issues, ordered by dependency. Each file is one issue.

**Scope reminder:** this is a single-user, locally-installed Tauri desktop app. No web build, no SaaS, no multi-user server, no shared backend. Every issue must run inside one user's Tauri process with local SQLite + local filesystem only. Anything implying a remote service, multi-tenant model, or browser deployment is out of scope by default.

AI work is tracked in a separate plan (`plans/ai-roadmap.md`, to be written) and is intentionally out of scope here — the moat is deterministic geometric intelligence first.

## Phase index

| Phase | Range | Theme |
|---|---|---|
| 0 | 001–010 | Foundation hygiene: tests, fixtures, edgeCount fix, viewer split, observability |
| 1 | 011–014 | Async (Web Worker) + geometry caching |
| 2 | 015–020 | Rust BREP topology layer (single highest-leverage upgrade) |
| 3 | 021–030 | Feature recognition + accessibility + feature-based costing |
| 4 | 031–035 | Manufacturing intelligence: machines, tools, process planner, cycle time, DFM |
| 5 | 036–038 | PMI / tolerance / surface finish extraction and costing |
| 6 | 039–041 | Historical job data + similarity index + calibration dashboard |
| 7 | 042–044 | Multi-format CAD support |

## HITL vs AFK summary

**HITL (7):** 002, 015, 031, 032, 033, 034, 044
**AFK (37):** everything else

## Completed

| Issue | Commit | Notes |
|---|---|---|
| 001 | c9d116b | Vitest setup, alias sanity tests, lint baseline cleaned |
| 002 | daa209c | STEP fixture suite with 25 curated fixtures, expected metadata, provenance, and visual review |
| 003 | 8d3658f | meshFingerprint golden tests against the full fixture suite + node-friendly OCCT loader helper |
| 004 | 8a2db7e | shapeAnalysis golden tests across 16 single-body fixtures; added self_hex_standoff and self_filleted_cylinder fixtures; locked in self_hex_bar→box as documented tessellation limitation |
| 005 | 0a71c94 | quoteCosting golden tests — 103 tests covering all 20 public functions; one LIMITATION comment locking in hardcoded finishingCost=0 in calculateQuoteRollup |
| 006 | 532cbaa | Dropped fabricated edgeCount field from types, schema, serialization, and 7 call sites; added migration 0010_drop_edge_count.sql |
| 007 | 456237e | Split CadViewer into focused submodules, preserved public API/protected explode logic, and visually verified all 6 local STEP fixtures |
| 008 | cad5a50 | Added app root ErrorBoundary with reload, copy diagnostics, and plugin-log best-effort logging |
| 009 | f5d005c | Added local-only crash diagnostics for renderer crashes, global renderer errors, and Rust panic reports |
| 010 | f577d0d | Configured tauri-plugin-log on disk with size rotation (10MB/5 files), UseLocal timezone, noise filtering, and a settings page Open Logs action |
| 011 | 35bb520 | Offloaded STEP file parsing to Web Worker via Comlink with Transferable zero-copy ArrayBuffers and AbortSignal cancellation |
| 012 | fd3c4d9 | Extended part_geometry SQLite schema and Drizzle types with fingerprint, triangle_count, shape_kind/params, face_colors, and mesh_blob_path |
| 013 | c958d83 | SHA-256 + OCCT-options-digest keyed binary geometry cache that skips the worker on hit; surfaced via Settings -> Diagnostics with hit/miss/clear controls |
| 014 | 8a8e534 | Large CAD source binary blobs (>5 MB) offloaded from SQLite to local file-based store with automatic deduplication, startup migration, and orphan cleanup |
| 015 | 51522db | Windows OCCT binding spike rejected direct opencascade-rs/occt-wasm adoption and chose a narrow custom OCCT C++ shim for Phase 2 |
| 016 | ba15c66 | Native OCCT topology extraction via narrow C++ shim (vcpkg); `extract_topology` Tauri command returning faces/edges/adjacency/wire loops with stable IDs |
| 017 | 59c8bf5 | Analytic surface classification (plane/cylinder/cone/sphere/torus/b-spline) with exact params attached to each face via `BRepAdaptor_Surface` |
| 018 | 46252c9 | Versioned topology envelope (`{version, topology}`) with serde + JSON schema, `topology_payload_schema` command, JS parse/serialize helpers |
| 019 | 7d564ef | JS `TopologyGraph`, `FaceClass`/`EdgeClass` discriminated unions, `findFacesByClass`/`neighborsOf`/`wireLoopsOf` helpers with graceful undefined handling |
| 020 | d70223f | `analyzeShape()` prefers topology when available (exact cylinder + hex dimensions), falls back to mesh heuristic; path logged via `console.debug` |
| 021 | 7215ab4 | `detectHoles(graph)` in `src/utils/features/holes.ts` classifies coaxial cylinder/cone groups into through/blind/counterbore/countersink with chain merging; 10/10 unit tests; 50-hole perf well under 100 ms |
| 022 | d30666f | `detectPockets(graph)` in `src/utils/features/pockets.ts` classifies planar-floor concave regions as open/closed via AABB ray cast; perpendicularity tolerance rejects chamfered edges; 6/6 unit tests |
| 023 | 0d229de | `detectSlots(graph)` in `src/utils/features/slots.ts` detects rounded (paired parallel cylinders + walls) and rectangular (aspect>2) slots with shared-face dedup; 7/7 unit tests |
| 024 | db3f1f7 | `detectFillets(graph)` in `src/utils/features/fillets.ts` classifies partial-span cylinder/cone/torus faces with convex/concave via signed-distance to adjacent plane normals; 7/7 unit tests |
| 025 | b4e644b | `detectChamfers(graph)` in `src/utils/features/chamfers.ts` detects narrow planar strips between two adjacent planes (30°–60° tilt, width/length < 0.2); 5/5 unit tests |
| 026 | 5e349e4 | `detectThreads(graph)` in `src/utils/features/threads.ts` matches cylinder diameters to standard M3–M12 + UNC/UNF table (±0.2 mm), internal/external via concavity, returns `unknown` for non-standard pitches; 7/7 unit tests |
| 027 | 79b57a3 | `detectBosses(graph)` in `src/utils/features/bosses.ts` detects round and rectangular protrusions from a base face; coexists with concentric holes; 6/6 unit tests |

## Suggested execution order

Phase 0 fully before Phase 1.
Phase 1 fully before Phase 2.
Phase 2 spike (#015) before any other Phase 2 work.
Phases 3 and 5 can partially parallelize after Phase 2 lands.
Phase 4 needs domain expert availability (HITL-heavy).
AI is tracked in a separate plan and never enters before the deterministic intelligence in Phases 0–7 lands.

## Total estimated effort

15–24 months solo, 6–12 months with one CAD/manufacturing engineer hire.
