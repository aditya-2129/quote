# Quote App — Unimplemented Features

> Audit date: 2026-05-14. All items below render in the UI but have no logic yet.

---

## High Priority

- [ ] **Sidebar navigation** — 9 nav links (`href="#"`): Dashboard, RFQs, Quotes, Parts, Customers, Analytics, Material library, Machines & rates, Team. Need active-page state in Dashboard.
- [ ] **RFQ fields editable** — Customer, Project, RFQ ref fields have hardcoded `value` with no `onChange`. Need state.
- [ ] **Save button** — persist current quote (parts, ops, stock, commercial) to localStorage via `src/utils/storage.ts`.

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

- [ ] **Zoom in / Zoom out** — Viewer toolbar and Quote Preview both have zoom buttons with no `onClick`.
- [ ] **Share button** (page header) — copy link or export share package.
- [ ] **Duplicate button** (cost panel) — clone the current quote.
- [ ] **Rate card button** (cost panel) — open a machine rate configuration view.
- [ ] **DFM Rules button** — show/edit DFM rule configuration.
- [ ] **Sidebar user More options button** — user account menu.
- [ ] **Section tool** (viewer toolbar) — requires CadViewer API extension.
- [ ] **Measure tool** (viewer toolbar) — requires CadViewer API extension.
- [ ] **Explode tool** (viewer toolbar) — state is wired but never passed to viewer.
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
