# Agent Context

Manufacturing Quote App: a Tauri 2 + React 19 desktop tool for importing STEP files, inspecting CAD bodies, grouping identical bodies into quote parts, and producing manufacturing quotations.

## Read Only When Needed

- Domain terms/product rules: `CONTEXT.md`
- Architecture/code boundaries: `docs/architecture.md`
- UI/design guidance: `docs/design-system.md`
- Agent workflow: `docs/agents/`
- Architectural decisions: `docs/adr/`

Do not eagerly read every doc. Open the smallest relevant file for the task.

## Commands

- `npm run dev`: Vite-only UI dev
- `npm run tauri:dev`: full desktop app dev
- `npm run build`: typecheck + Vite build
- `npm run lint`: ESLint
- `npm run db:generate`: Drizzle migration generation
- `npm run db:studio`: Drizzle Studio

## Code Rules

- Put geometry, CAD handoff, quote math, storage, and export logic in `src/utils/`.
- Put reusable UI in `src/components/`; route screens in `src/pages/`.
- Keep DB schema in `src/db/schema/` and query helpers in `src/db/queries/`.
- Keep Rust in `src-tauri/` limited to shell, OS, window, and plugin concerns.
- Prefer existing React/CSS patterns before adding abstractions.

## Protected Code

Do not touch the explode algorithm in `src/components/CadViewer.tsx` without explicit user approval.

This includes the `ExplodePart` block covering principal-axis detection, rank-based linear slots, size-scaled radial scatter, and angular fan-out fallback.

## Design Short Version

Operational quoting workstation, not a marketing site. Keep UI dense, calm, document-grade, and consistent with `src/styles/index.css`. Use lucide icons where available. Avoid decorative gradients/orbs and nested cards.

## Verification

Run the narrowest meaningful check for code changes. For common changes, prefer `npm run build` and/or `npm run lint`. If a check cannot run, say so.

For browser tests that need to upload local files, use the project `playwright-core` dependency and `locator('input[type="file"]').setInputFiles(...)`. This is the preferred path for Viewer CAD import testing because browser plugin surfaces may not support native file-picker upload.

## Logic Index

- Quote costing: `src/utils/quoteCosting.ts`, `src/utils/costing/featureCost.ts` (per-feature cycle-time contributions with named mm³/min and mm/min rate constants; added on top of operation cycle time; parts without features behave identically to legacy), `src/context/QuoteStateContext.tsx`
- Quote workspace: `src/pages/QuoteDetailPage.tsx` (layout orchestrator), `src/pages/QuoteDetail/` (sub-components)
- PDF export: `src/utils/export.ts` (renderer), `src/utils/pdfAssembly.ts` (data assembly), `src/utils/fileSave.ts` (platform save)
- CAD import: `src/utils/cad.ts`, `src/utils/cadWorker.ts`, `src/workers/occt.worker.ts`, `src/utils/occtOptions.ts` (shared options constant), `src/utils/geometryCache.ts` (SHA-256 + options-digest binary cache, hit skips the worker), `src/context/CadContext.tsx`, `src/components/ViewerWorkspace.tsx`
- BREP topology: `src-tauri/src/cad/topology.rs` + `mod.rs` + `surfaces.rs` + `serialize.rs`, `src-tauri/cpp/topo_shim.{cpp,h}` (narrow OCCT C ABI via vcpkg), `extract_topology` / `topology_payload_schema` Tauri commands, versioned envelope `{version: 1, topology}`. JS side: `src/types/topology.ts` (payload types), `src/utils/topology.ts` (`TopologyGraph`, `FaceClass`/`EdgeClass`, `findFacesByClass`/`neighborsOf`/`wireLoopsOf`). `analyzeShape()` in `src/utils/shapeAnalysis.ts` is the finished-body classifier (cylinder/hex/box/complex); it prefers topology when supplied, falls back to mesh heuristic. `analyzeCadBody()` returns `{envelope, rawStock, finishedBody}` where `rawStock` (round/hex/rect/unknown blank with confidence) is inferred from the envelope independently of finished-body complexity — quote handoff (`cadHandoff.ts`) and the Viewer Inspector use `rawStock`, not `finishedBody`.
- Feature recognition (Phase 3): `src/utils/features/` — `holes.ts` (through/blind/counterbore/countersink with axial chain merging), `pockets.ts` (open/closed pockets via planar-floor + perpendicular wall detection and AABB ray cast for openness), `slots.ts` (rounded + rectangular slots filtered by aspect>2), `fillets.ts` (partial-span cylinder/cone/torus with convex vs concave via signed-distance to adjacent plane normals), `chamfers.ts` (narrow tilted planar strips between two adjacent planes), `threads.ts` (cylinder-diameter match against a hardcoded standard M3–M12 + UNC/UNF table; internal/external via concavity), `bosses.ts` (round and rectangular protrusions from a base face; coexists with concentric holes). Each detector takes a `TopologyGraph` and returns a typed feature array. `src/utils/features/index.ts` is the aggregation layer: `detectCadFeatures(graph)` runs every detector and normalizes results into the UI-friendly `DetectedCadFeature` union (type/label/primary/secondary/groupKey/faceIds), and `summarizeCadFeatures()` produces per-type counts. Whole-file BREP topology is extracted during `importStepBytes` (desktop-only `extract_topology` Tauri command) and stored as `CadImportResult.topology` (also cached in `geometryCache`). The payload carries per-body grouping — each `TopoFace` has a `body` index and the payload has a `bodies` array (per-solid/shell bbox), emitted by `topo_shim.cpp`. The Viewer Inspector runs feature detection per selected part: single-body files detect on the whole topology; multi-body files map topology bodies to mesh bodies by bounding box via `mapTopologyBodiesToMeshes()` (`src/utils/topology.ts`), slice the payload with `filterTopologyToBody()`, and resolve state through `resolveBodyFeatureState()` (`src/utils/features/featureState.ts`). A body that cannot be mapped shows an honest "Could not map BREP topology to this selected body." state instead of features.
- Feature persistence: `src/db/schema/part_features.ts` + `src/db/queries/part_features.ts` — one row per detected feature on a part with discriminated `PartFeatureData` union (hole/pocket/slot/fillet/chamfer/thread/boss). Migration `0013_part_features.sql` registered as version 13 in `src-tauri/src/lib.rs`. `replaceFeaturesForPart` runs in a transaction. Wiring into `quoteWorkflowService` save/load is currently TODO.
- Manufacturing accessibility: `src/utils/manufacturing/accessibility.ts` — `analyzeAccessibility(features)` runs greedy set-cover over each feature's approach directions to derive `setupCount`, classifies `maxAxisRequirement` (lathe / 3-axis / 4-axis / 5-axis / mill-turn / not-machinable), and surfaces inaccessible features with reasons.
- CAD source storage: `src/utils/cadSourceStore.ts` (5 MB threshold; <=5 MB inline base64, >5 MB on disk under `${appDataDir}/cad-sources/<sha256>` with cross-quote dedup and orphan cleanup), `src/db/schema/quote_cad_sources.ts`
- CAD handoff: `src/utils/cadHandoff.ts`, `src/pages/QuoteDetailPage.tsx`
- Persistence: `src/db/quoteWorkflowService.ts`, `src/context/QuoteStateContext.tsx`, `src/db/schema/`, `src/db/queries/`
- Geometry: `src/utils/geometry.ts`, `src/utils/meshFingerprint.ts`, `src/utils/cad.ts`
- Reference data: `src/context/CatalogContext.tsx`, `src/db/schema/materials.ts`, `src/db/schema/machines.ts`, `src/db/schema/bop_catalog.ts`, `src/utils/storage.ts`
- Formatting: `src/utils/format.ts` (currency, minutes), `src/utils/stock.ts` (shape constants, stock dims)
