# Architecture Notes

## Runtime Shape

The app is a local-first Tauri desktop application. React owns the product UI and quote logic. Tauri provides the native shell, file/system plugins, and SQLite access through `@tauri-apps/plugin-sql`.

## Main Route Tree

- `src/App.tsx` defines a `HashRouter`.
- `CadProvider` wraps the whole layout so the viewer and quote pages can share imported CAD.
- `QuoteStateProvider` wraps `/quotes/:id` so each quote route gets isolated in-memory quote state.
- Primary pages live in `src/pages/`.

## CAD Flow

- `src/context/CadContext.tsx` owns the imported `CadImportResult`, import status, and handoff flag.
- `src/utils/cad.ts` orchestrates STEP/IGES/BREP import and builds Three.js geometry plus metadata. The heavy `occt-import-js` WASM call runs in `src/workers/occt.worker.ts` via Comlink; `src/utils/cadWorker.ts` is the main-thread wrapper and owns worker lifecycle (spawn-per-import, terminate on completion or AbortSignal). OCCT options live in `src/utils/occtOptions.ts` and are shared by the worker and the cache so digests can't drift.
- `src-tauri/src/cad/topology.rs` exposes the native `extract_topology` Tauri command for BREP topology extraction. It calls the narrow C ABI in `src-tauri/cpp/topo_shim.cpp`, which uses local OCCT from vcpkg to read STEP bytes and return JSON-serializable faces, edges, face-edge adjacency, and wire loops. This is local/native only; there is no backend service. Developer setup requires `vcpkg install opencascade:x64-windows` or an equivalent `VCPKG_ROOT`; normal app users should receive the compiled app plus required OCCT DLLs.
- `src/utils/geometryCache.ts` keys imports by `sha256(bytes) + digest(occtOptions)` and stores each entry as a single binary file under `${appDataDir}/geometry_cache/<key>.bin` (length-prefixed JSON header + raw Float32/Uint32 mesh arrays). A hit skips the worker entirely; `importStepBytes(..., { forceReimport: true })` bypasses the lookup. In-memory hit/miss counters are surfaced via Settings → Diagnostics.
- `src/utils/cadSourceStore.ts` routes the original STEP bytes for a quote: ≤5 MB stored inline as base64 in `quote_cad_sources.file_bytes_base64`, >5 MB written to `${appDataDir}/cad-sources/<sha256>` and pointed at by `file_path`. Files are deduplicated across quotes by SHA-256; orphan cleanup runs on quote delete; a one-shot startup migration moves any pre-existing inline >5 MB blobs to disk and VACUUMs.
- `src/components/CadViewer/` renders the full viewer and must be treated carefully because it contains tuned interaction and explode behavior. The protected explode algorithm lives in `src/components/CadViewer/explode.ts` per AGENTS.MD.
- `src/components/ViewerWorkspace.tsx` composes the viewer, tree, toolbar, and inspector.
- `src/utils/cadHandoff.ts` converts CAD meshes to quote parts.
- `src/utils/meshFingerprint.ts` groups identical bodies before quote row creation.

## Quote Flow

- `src/context/QuoteStateContext.tsx` currently owns parts, BOP rows, selected part, assembly quantity, commercial inputs, and RFQ fields.
- `src/pages/QuoteDetailPage.tsx` is the quote route/layout orchestrator. It handles route loading, CAD handoff, preview collapse state, manual part creation, and composition of quote workspace sections.
- `src/pages/QuoteDetail/` contains the quote workspace section components: parts table, stock panel, operations editor, RFQ rail, cost panel, BOP table, extra costs, and previews.
- `src/components/QuotePreviewViewer.tsx` renders the compact on-demand Three.js preview in the quote page.
- `src/components/BopModal.tsx` is the shared create/edit modal for catalog BOPs, reused by the BOP catalog page and quote BOP picker.
- `src/pages/BopsPage.tsx` manages the reusable brought-out-parts catalog.
- `src/utils/quoteTypes.ts` defines the current quote workspace `Part`, `Bop`, `Stock`, and `Op` types.
- `src/utils/quoteCosting.ts` owns the active quote rollup used by the quote workspace and persistence. Fixed tooling/inspection charges and finishing cost are currently zeroed/excluded.
- `src/context/CatalogContext.tsx` owns material/machine catalog loading and exposes costing catalogs plus display labels to quote workspace components.
- `src/utils/pdfAssembly.ts` prepares quotation data for PDF rendering; `src/utils/fileSave.ts` owns platform-aware save/download behavior.
- `src/utils/quote.ts` and `src/types/` still represent an older quote calculation model. Be careful when wiring new export or persistence behavior.

## Data Layer

- `src/db/client.ts` wraps the Tauri SQL plugin with Drizzle's SQLite proxy.
- `src/db/schema/` defines normalized tables for RFQs, quotes, parts, geometry, stock, operations, BOP catalog, quote BOP rows, materials, machines, customers, DFM issues, notifications, settings, and recent files.
- `src/db/queries/` has table-scoped CRUD helpers.
- `src/db/quoteWorkflowService.ts` bridges the React quote draft to normalized RFQ/quote/part/BOP tables and computes persisted cost snapshots.
- `src-tauri/migrations/` contains native SQLite migrations. Keep it in sync with `src/db/schema/`. **Every new `NNNN_*.sql` file must also be registered in the `migrations` vec in `src-tauri/src/lib.rs` — the Rust runner only applies what's listed there, so a file on disk alone is a silent no-op.**

## Design Surface

- `src/styles/index.css` contains the design tokens and most layout/component CSS.
- `src/components/Layout.tsx`, `Sidebar.tsx`, and `Header.tsx` define the app shell.
- `design_bundle/quote/` contains the original extracted/redesign material and can be used for historical reference, but the source of truth is the current React/CSS implementation.

## Important Boundaries

- Do not put quote math into React components when adding new logic. Extract it to `src/utils/` unless touching the existing page-local code is the smallest safe step.
- Do not write new DB access directly in components. Add or extend query helpers in `src/db/queries/`.
- Do not add Rust commands for quote/business logic.
- Do not mutate Three.js geometry assumptions without testing real STEP files from `public/test_files/`.

## Known Debt

- Save/export paths need a bridge between current workspace types and the DB/export models.
- Some docs and strings have mojibake from earlier encoding issues. Prefer ASCII in new docs unless a file already clearly uses UTF-8 correctly.
