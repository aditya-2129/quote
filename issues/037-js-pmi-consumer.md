# 037 — JS PMI consumer + types

**Type:** AFK
Status: ready-for-agent

## What to build

Create `src/utils/pmi.ts` with TypeScript types mirroring the Rust PMI payload (#036). Helper functions: `getToleranceForFace(faceId)`, `getSurfaceFinishForFace(faceId)`, `getThreadsForHole(holeId)`.

UI: display PMI annotations in the part detail view, with hover-to-highlight on the 3D viewer.

## Acceptance criteria

- [ ] Types compile clean
- [ ] PMI data persists in the part_geometry cache (extend schema as needed)
- [ ] UI shows annotations in a readable panel
- [ ] Hover highlights the annotated face in the viewer
- [ ] Tests cover lookup helpers

## Blocked by

- #036 (PMI extraction)
