# 007 — Split CadViewer.tsx into sub-modules

**Type:** AFK
Status: done
Completed in: 456237e

## What to build

`src/components/CadViewer.tsx` is 928 lines (was 833 when the issue was filed) doing scene management, the protected explode algorithm, measurement, edge rendering, clipping planes, and screenshots. Split it into sub-modules under `src/components/CadViewer/` without changing behavior.

Suggested layout (open to alternatives the implementer can justify):
- `src/components/CadViewer/index.tsx` — orchestrator React component, `useImperativeHandle`, prop wiring
- `src/components/CadViewer/types.ts` — shared types and constants (`CadViewerHandle`, `CadDisplayMode`, `CadViewOrientation`, `CadViewportTheme`, `SceneMeshRecord`)
- `src/components/CadViewer/scene.ts` — three.js renderer/camera/scene/lights setup, axis gizmo, OrbitControls, resize
- `src/components/CadViewer/explode.ts` — **protected** explode algorithm extracted verbatim (no logic change). See AGENTS.MD.
- `src/components/CadViewer/measure.ts` — measure mode state machine, screen-space snap, measurement overlay rendering, `axisConstrain` helper
- `src/components/CadViewer/edges.ts` — `buildFaceAwareEdges` and edge-line material setup
- `src/components/CadViewer/fitCamera.ts` — camera framing logic (per-mesh and overall fit)
- `src/components/CadViewer/appearance.ts` — live display mode, selection, edge visibility, explode transforms, clipping plane
- `src/components/CadViewer/imperativeHandle.ts` — `CadViewerHandle` methods

Re-export the public surface from `src/components/CadViewer/index.tsx` so existing imports (`import { CadViewer } from "./components/CadViewer"`) continue to work via `index.tsx` resolution. Delete the old `CadViewer.tsx` once the split is complete.

## Why this is now AFK

Previously HITL because (a) module-boundary decisions needed human review and (b) "visual regression tested against 3 reference STEP files" required a human eye. Both are addressable agentically now:

- The orchestrating session designs the boundaries and reviews diffs.
- Browser automation against the real Vite app can load local STEP fixtures, inspect viewer state, and capture visual confirmation that `CadViewer` renders the expected scene tree.

## Acceptance criteria

- [x] Explode algorithm extracted **verbatim** — no math, no ordering, no constant changes. Verified as code motion with wrapper/import changes only.
- [x] No behavior change in `CadViewer` rendering — `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd run test` all pass; the existing 155-test suite is untouched.
- [x] Each sub-module under 250 lines; orchestrator is 346 lines.
- [x] `CadViewerHandle` external API unchanged — every existing caller compiles without edits.
- [x] All public exports previously available from `src/components/CadViewer.tsx` remain importable from `src/components/CadViewer` (the directory's `index.tsx`).
- [x] The protected `ExplodePart` block is annotated in `explode.ts` with the same "do not modify" comment as called out in AGENTS.MD so future contributors do not lose the warning.
- [x] Visual verification completed in the real Vite app viewer with all 6 local files in `public/test_files/`.

## Blocked by

None — can start immediately.
