# Agent Context

Manufacturing Quote App: a Tauri 2 + React 19 desktop tool for importing STEP files, inspecting CAD bodies, grouping identical bodies into quote parts, and producing manufacturing quotations.

## Read Only When Needed

- Domain terms/product rules: `CONTEXT.md`
- Architecture/code boundaries: `docs/architecture.md`
- UI/design guidance: `docs/design-system.md`
- Agent workflow: `docs/agents/`
- Architectural decisions: `docs/adr/`
- Long-term CAD intelligence roadmap: `plans/enterprise-cad-roadmap.md`
- Local roadmap issue index: `issues/README.md`

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

## Logic Index

- Quote costing: `src/utils/quoteCosting.ts`, `src/context/QuoteStateContext.tsx`
- Quote workspace: `src/pages/QuoteDetailPage.tsx` (layout orchestrator), `src/pages/QuoteDetail/` (sub-components)
- PDF export: `src/utils/export.ts` (renderer), `src/utils/pdfAssembly.ts` (data assembly), `src/utils/fileSave.ts` (platform save)
- CAD import: `src/utils/cad.ts`, `src/utils/cadWorker.ts`, `src/workers/occt.worker.ts`, `src/utils/occtOptions.ts` (shared options constant), `src/utils/geometryCache.ts` (SHA-256 + options-digest binary cache, hit skips the worker), `src/context/CadContext.tsx`, `src/components/ViewerWorkspace.tsx`
- BREP topology: `src-tauri/src/cad/topology.rs` + `mod.rs` + `surfaces.rs` + `serialize.rs`, `src-tauri/cpp/topo_shim.{cpp,h}` (narrow OCCT C ABI via vcpkg), `extract_topology` / `topology_payload_schema` Tauri commands, versioned envelope `{version: 1, topology}`. JS side: `src/types/topology.ts` (payload types), `src/utils/topology.ts` (`TopologyGraph`, `FaceClass`/`EdgeClass`, `findFacesByClass`/`neighborsOf`/`wireLoopsOf`). `analyzeShape()` in `src/utils/shapeAnalysis.ts` prefers topology when supplied, falls back to mesh heuristic.
- CAD source storage: `src/utils/cadSourceStore.ts` (5 MB threshold; <=5 MB inline base64, >5 MB on disk under `${appDataDir}/cad-sources/<sha256>` with cross-quote dedup and orphan cleanup), `src/db/schema/quote_cad_sources.ts`
- CAD handoff: `src/utils/cadHandoff.ts`, `src/pages/QuoteDetailPage.tsx`
- Persistence: `src/db/quoteWorkflowService.ts`, `src/context/QuoteStateContext.tsx`, `src/db/schema/`, `src/db/queries/`
- Geometry: `src/utils/geometry.ts`, `src/utils/meshFingerprint.ts`, `src/utils/cad.ts`
- Reference data: `src/context/CatalogContext.tsx`, `src/db/schema/materials.ts`, `src/db/schema/machines.ts`, `src/db/schema/bop_catalog.ts`, `src/utils/storage.ts`
- Formatting: `src/utils/format.ts` (currency, minutes), `src/utils/stock.ts` (shape constants, stock dims)
