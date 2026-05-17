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
