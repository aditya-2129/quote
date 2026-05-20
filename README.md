# Quote

A desktop CAD quoting tool. Import a STEP file, inspect bodies in a 3D viewer, hand them off to a quote workspace, and turn geometry into a priced manufacturing quotation.

Built with **Tauri 2**, **React 19**, **Three.js**, and **Drizzle ORM** over **SQLite**.

---

## What it does

- **STEP / IGES / BREP import** via `occt-import-js` (Open CASCADE compiled to WebAssembly).
- **3D viewer** — orbit, fit, orientation presets (iso / front / top / right), solid/wireframe, per-face edge extraction, screen-space measure with vertex/edge snap, isolate, and a hybrid principal-axis explode tuned for both plate-stacks and shaft-style assemblies.
- **Identical-body grouping on import** — duplicate bodies (e.g. nine of the same dowel) collapse into one part row with `perAssembly = N`, so you set material/stock/operations once. Match is layered: tri-count + vertex-count buckets, then a pairwise sorted radial-distance compare with mm-level tolerance that survives OCCT's per-instance tessellation jitter.
- **Quote workspace** - parts table with per-row material, stock shape (plate / block / round bar / square bar / tube) and dimensions, operations editor (per-machine setup + cycle minutes, rate-card driven), per-row include/exclude, and brought-out parts (BOPs) for purchased components.
- **Live cost rollup** - material + setup + machining + BOP subtotal + margin + tax, with a quantity-break grid and lead-time bar derived from total machine minutes. Fixed tooling/inspection overheads and finishing are not currently charged.
- **DFM panel** — flagged issues with cost impact and suggested fixes; click an issue to jump to the offending part.
- **Compact in-quote preview** — a slim render-on-demand Three.js viewer pinned top-right. Selecting a part row isolates and frames its bodies; one click toggles back to the full assembly. Idle CPU/GPU is zero so the viewer never throttles the page.

---

## Stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2 (Rust + WebView2 / WebKit / WKWebView) |
| UI | React 19 + React Router 7 |
| Styling | Tailwind 4 (utility classes) + hand-rolled CSS for the panel grid |
| 3D | Three.js 0.184 + OrbitControls + occt-import-js |
| State | React Context for in-memory session state (`CadContext`, `QuoteStateContext`) |
| Persistence | Drizzle ORM over `@tauri-apps/plugin-sql` (SQLite) — schema in `src/db/schema/`, queries in `src/db/queries/` |
| PDF export | `pdf-lib` |

---

## Getting started

### Prerequisites

- **Node.js** ≥ 20
- **Rust** stable toolchain (`rustup default stable`)
- Platform-specific Tauri build deps:
  - **Windows**: WebView2 runtime + Visual Studio C++ Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `webkit2gtk` and friends — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install

```bash
npm install
```

### Develop

```bash
npm run tauri:dev       # Tauri desktop app with HMR
npm run dev             # Vite-only browser dev server (no Tauri APIs, no SQLite)
```

The Vite-only mode is fine for UI iteration but file dialogs and DB calls won't work — use `tauri:dev` for full-stack testing.

### Build a distributable

```bash
npm run tauri:build
```

Output lands in `src-tauri/target/release/bundle/` (`.msi` / `.exe` on Windows, `.dmg` on macOS, `.AppImage` / `.deb` on Linux).

### Database

Schema lives in `src/db/schema/*.ts`. After editing:

```bash
npm run db:generate     # generate migration SQL
npm run db:studio       # open Drizzle Studio at localhost:4983
```

### Quality

```bash
npm run lint            # eslint
npm run format          # prettier write
npm run format:check    # prettier dry-run (CI-friendly)
```

---

## Project structure

```
src/
├── App.tsx, main.tsx           # entrypoint + router
├── components/
│   ├── CadViewer.tsx           # main Three.js viewer (Viewer page) — measure, explode, gizmo
│   ├── QuotePreviewViewer.tsx  # slim render-on-demand viewer (Quote page)
│   ├── ViewerWorkspace.tsx     # parts tree + inspector + toolbar
│   ├── Layout.tsx, Sidebar.tsx, Header.tsx, TitleBar.tsx
│   └── …
├── context/
│   ├── CadContext.tsx          # imported CAD model + handoff signal
│   └── QuoteStateContext.tsx   # parts, selection, asm qty, commercial, rfq
├── pages/
│   ├── QuoteDetailPage.tsx     # quote workspace (preview, parts table, DFM, cost)
│   ├── ViewerPage.tsx          # full 3D viewer
│   ├── Dashboard.tsx, RfqsPage.tsx, QuotesPage.tsx, PartsPage.tsx,
│   ├── CustomersPage.tsx, MaterialsPage.tsx, MachinesPage.tsx, AnalyticsPage.tsx
├── utils/
│   ├── cad.ts                  # STEP import + CadImportResult shape
│   ├── cadHandoff.ts           # CadImportResult → Part[] (with grouping)
│   ├── meshFingerprint.ts      # identical-body detection
│   ├── shapeAnalysis.ts        # volume, area, bbox, primitive recognition
│   ├── geometry.ts, quote.ts   # costing math helpers
│   ├── export.ts               # PDF generation
│   ├── storage.ts              # localStorage fallback
│   └── quoteTypes.ts           # Part, Op, Stock, Rfq types
├── db/
│   ├── client.ts               # Drizzle + tauri-plugin-sql wiring
│   ├── schema/                 # one file per table
│   ├── queries/                # typed CRUD helpers
│   └── seed.ts                 # dev fixture data
├── hooks/                      # useSidebarCollapsed, etc.
└── styles/                     # Tailwind base + custom panel/grid CSS

src-tauri/
├── src/main.rs, lib.rs         # Rust entrypoint, plugin registration
└── tauri.conf.json             # window/build config
```

---

## Key flows

### Viewer → Quote handoff

1. **Viewer** (`/viewer`) — drop a STEP, inspect bodies, hide/isolate, measure, explode. The imported `CadImportResult` lives in `CadContext`.
2. Click **Move to Quotation** — that flips `pendingHandoff = true` on `CadContext`.
3. **Quote page** (`/quotes/:id`) — on mount, if `pendingHandoff` is set, it calls `cadResultToParts(cad)` which runs the identical-body grouping and seeds the parts table with one row per distinct geometry, `perAssembly = copies in the assembly`.
4. From there, each row gets a material, stock, and operations. Purchased components are added as BOP rows from the catalog. Cost rolls up live. Quantity breaks recompute. Lead time updates.

### Identical-body grouping (`src/utils/meshFingerprint.ts`)

Two-pass match designed for triangulated input where OCCT can jitter vertex positions slightly between instances of the same BREP body:

1. **Cheap bucket** — `triangleCount | vertexCount`. Both are integer-stable and don't have float boundary problems.
2. **Pairwise compare** within each bucket — for every pair, build a sorted multiset of `|vertex − centroid|` distances. Pair is "same" if at most 1% of distances exceed a 0.1 mm tolerance. Union-find collapses transitive matches into groups.

Sorted-radial signature is invariant to rigid motion *and* mirroring, so rotated/mirrored copies match. The outlier allowance handles cases where OCCT relocates 1–2 interior vertices very differently between otherwise-identical instances. 0.1 mm is well below any meaningful machining tolerance.

### Performance notes (Quote page)

- **`QuotePreviewViewer`** is render-on-demand: a single rAF gets scheduled when OrbitControls reports a change, the visibility/selection effect mutates the scene, or `fit()` is called. Idle = 0 GPU draws.
- **`PartRow`** is `React.memo`-d with ref-stabilised callbacks so only the two rows that toggle selection re-render (not all 26+).
- **`CostPanel`** is memoized too — independent of `selectedId`.
- **`RfqRail`** reads `useDeferredValue(selectedId)`, so the row highlight and 3D body update commit immediately and the heavy `StockEditor` / `OperationsEditor` remount happens in a follow-up render.

---

## Rules of the road

From `AGENTS.MD`:

- Geometry/quote math goes in `src/utils/`, not into components.
- Components stay in `src/components/`, strictly typed, no untyped props.
- DB schema changes must keep `src/db/schema/` and migrations in sync.
- Rust (`src-tauri/`) is for OS/window concerns only. No business logic there.
- The CAD explode block in `CadViewer.tsx` is tuned across mould, shaft, and 2-body cases — **do not refactor it without an explicit request.**

For deeper project context, see:

- [`CONTEXT.md`](CONTEXT.md) for domain vocabulary and product rules.
- [`docs/architecture.md`](docs/architecture.md) for code boundaries and main flows.
- [`docs/design-system.md`](docs/design-system.md) for UI/design guidance.
- [`docs/agents/`](docs/agents/) for issue-tracker, triage, and agent workflow setup.
- [`docs/adr/`](docs/adr/) for architectural decisions.

### Roadmap and local issues

- [`plans/enterprise-cad-roadmap.md`](plans/enterprise-cad-roadmap.md) tracks the long-term path to enterprise-grade CAD intelligence.
- [`issues/README.md`](issues/README.md) indexes the local roadmap issues.
- Local issue statuses use `ready-for-agent` for AFK implementation work and `ready-for-human` for HITL decision/review work.

---

## Status

The app is functional end-to-end for the import -> group -> price -> preview loop. Persistence writes the quote workflow to Drizzle/SQLite with a browser fallback.

---

## License

Private — internal project.
