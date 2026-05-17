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
- `src/utils/cad.ts` imports STEP/IGES/BREP through `occt-import-js` and builds Three.js geometry plus metadata.
- `src/components/CadViewer.tsx` renders the full viewer and must be treated carefully because it contains tuned interaction and explode behavior.
- `src/components/ViewerWorkspace.tsx` composes the viewer, tree, toolbar, and inspector.
- `src/utils/cadHandoff.ts` converts CAD meshes to quote parts.
- `src/utils/meshFingerprint.ts` groups identical bodies before quote row creation.

## Quote Flow

- `src/context/QuoteStateContext.tsx` currently owns parts, BOP rows, selected part, assembly quantity, commercial inputs, and RFQ fields.
- `src/pages/QuoteDetailPage.tsx` contains the main quote workspace composition and much of the current quote math.
- `src/components/QuotePreviewViewer.tsx` renders the compact on-demand Three.js preview in the quote page.
- `src/components/BopModal.tsx` is the shared create/edit modal for catalog BOPs, reused by the BOP catalog page and quote BOP picker.
- `src/pages/BopsPage.tsx` manages the reusable brought-out-parts catalog.
- `src/utils/quoteTypes.ts` defines the current quote workspace `Part`, `Bop`, `Stock`, and `Op` types.
- `src/utils/quoteCosting.ts` owns the active quote rollup used by the quote workspace and persistence. Fixed tooling/inspection charges and finishing cost are currently zeroed/excluded.
- `src/utils/quote.ts` and `src/types/` still represent an older quote calculation model. Be careful when wiring new export or persistence behavior.

## Data Layer

- `src/db/client.ts` wraps the Tauri SQL plugin with Drizzle's SQLite proxy.
- `src/db/schema/` defines normalized tables for RFQs, quotes, parts, geometry, stock, operations, BOP catalog, quote BOP rows, materials, machines, customers, DFM issues, notifications, settings, and recent files.
- `src/db/queries/` has table-scoped CRUD helpers.
- `src/db/quoteWorkflowService.ts` bridges the React quote draft to normalized RFQ/quote/part/BOP tables and computes persisted cost snapshots.
- `src-tauri/migrations/` contains native SQLite migrations. Keep it in sync with `src/db/schema/`.

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

- `QuoteDetailPage.tsx` is large and owns too many concerns: catalog loading, quote math, part table, RFQ rail, DFM panel, and cost panel.
- Save/export paths need a bridge between current workspace types and the DB/export models.
- Some docs and strings have mojibake from earlier encoding issues. Prefer ASCII in new docs unless a file already clearly uses UTF-8 correctly.
