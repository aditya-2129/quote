# 007 — Split CadViewer.tsx into sub-modules

**Type:** HITL
Status: ready-for-human

## What to build

`src/components/CadViewer.tsx` is 833 lines doing scene management, explode logic, measurement, edge rendering, clipping planes, and screenshots. Propose a module split that preserves the protected explode algorithm verbatim (see `AGENTS.MD`), then implement.

Suggested layout (open to alternatives):
- `CadViewer/scene.ts` — three.js scene + camera + lighting setup
- `CadViewer/explode.ts` — protected explode algorithm (DO NOT MODIFY logic)
- `CadViewer/measure.ts` — measurement tools
- `CadViewer/clipping.ts` — clipping plane controls
- `CadViewer/edges.ts` — face-aware edge rendering
- `CadViewer/index.tsx` — orchestrator component

HITL: architectural split decision needs review before implementation. The explode algorithm is protected and cannot be touched without explicit user approval per `AGENTS.MD`.

## Acceptance criteria

- [ ] Proposed module split reviewed and approved
- [ ] Explode algorithm extracted verbatim (no behavior change)
- [ ] No regression in viewer behavior on manual test pass
- [ ] Each sub-module under 250 lines
- [ ] `CadViewerHandle` external API unchanged
- [ ] Visual regression tested against 3 reference STEP files

## Blocked by

None — can start immediately.
