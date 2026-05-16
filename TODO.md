# Quote App — Unimplemented Features

> Audit date: 2026-05-16. All items below render in the UI but have no logic yet.

---

## High Priority

- [ ] **Save button** — persist current quote (parts, ops, stock, commercial) to localStorage via `src/utils/storage.ts` (or Drizzle via `src/db/queries/quotes.ts`).

---

## Medium Priority

- [ ] **Export PDF button** — generate a printable quote sheet. Logic stub exists in `src/utils/export.ts`.
- [ ] **Send button** — open an email/share modal with quote summary.
- [ ] **Add part button** — append a new blank row to the parts table.
- [ ] **Per-row More options (⋯) button** — context menu: rename, duplicate, delete part.
- [ ] **DFM Apply fix buttons** — update issue state when fix is applied.
- [ ] **DFM Accept buttons** — dismiss/accept a DFM warning.
- [ ] **Notifications bell** — open a panel listing recent alerts/activity.

---

## Low Priority

- [ ] **Zoom in / Zoom out** — Quote SVG-preview HUD has zoom buttons with no `onClick`. (The compact CAD preview already supports scroll-wheel zoom natively.)
- [ ] **Share button** (page header) — copy link or export share package.
- [ ] **Duplicate button** (cost panel) — clone the current quote.
- [ ] **Rate card button** (cost panel) — open a machine rate configuration view.
- [ ] **DFM Rules button** — show/edit DFM rule configuration.
- [ ] **Sidebar user More options button** — user account menu.
- [ ] **Section tool** (viewer toolbar) — requires CadViewer API extension. Button is currently disabled with a "Coming soon" tooltip.
- [ ] **Inspector Details / Settings buttons** (viewer right panel) — no `onClick`.

---

## Done

- [x] Quote state chip (Draft / Internal review / Sent / Won / Lost)
- [x] Global search with parts table filtering
- [x] Keyboard shortcuts modal (`?` key)
- [x] CAD viewer — orientation, display mode, edges, fit, screenshot
- [x] Mesh selection and hide/show toggles
- [x] STEP file import (local file + test files)
- [x] Parts table — filter chips, bulk apply, include/exclude, material, qty
- [x] Stock editor — shape picker + dimension inputs
- [x] Operations editor — add, remove, reorder, edit
- [x] Finishing / margin / tax inputs
- [x] Assembly qty input + quantity break buttons
- [x] Sidebar collapse button
- [x] Tauri window controls (minimize / maximize / close)
- [x] Workspace toggle (Viewer / Quote, keyboard V / Q)

### Done since 2026-05-14

- [x] Sidebar nav — `NavLink` routing + active-page state (moved from High)
- [x] RFQ fields — Customer / Project / RFQ ref bound to `QuoteStateContext` (moved from High)
- [x] Explode tool — master + per-axis trim sliders, wired to `CadViewer` via the `explode` prop (moved from Low)
- [x] Measure tool — toggle + click-to-measure with screen-space snap and axis-constrain (moved from Low)
- [x] Identical-body grouping — `src/utils/meshFingerprint.ts`; duplicate bodies collapse into one Part row with `perAssembly = N`
- [x] Compact in-quote 3D preview — `src/components/QuotePreviewViewer.tsx`; render-on-demand viewer with isolate / full-assembly toggle in the panel header
- [x] Quote-page perf — memoized `PartRow`, `DfmPanel`, `CostPanel`; `useDeferredValue` on the right-rail selection
- [x] Two-column Quote workspace — parts table dominant, preview + RFQ rail stacked top-right
- [x] Rename Mesh → Part — user-visible labels and id prefix (`part-0`, `part-1`, …); parts-table header is `PART`
