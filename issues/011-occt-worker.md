# 011 — Move occt-import to Web Worker via comlink

**Type:** AFK
Status: done
Completed in: 35bb520

## What to build

Currently `src/utils/cad.ts:340` runs `occt-import-js` (a WASM module) on the main thread, blocking UI for multi-second imports of large assemblies. Move it to a dedicated Web Worker and expose an async API via `comlink`.

Architecture:
- `src/workers/occt.worker.ts` — runs `occt-import-js`, returns serializable mesh data (positions, indexes, normals, face groups, colors, tree structure)
- `src/utils/cadWorker.ts` — main-thread comlink wrapper
- Main thread reconstructs `THREE.BufferGeometry` from transferred ArrayBuffers (zero-copy where possible)

`src/context/CadContext.tsx` calls become `await cadWorker.importStep(buffer, fileName)`.

## Acceptance criteria

- [x] Import of a 20 MB STEP file keeps UI frame time under 50ms (verified via Performance trace)
- [x] No regression in mesh data: existing fingerprint tests (#003) still pass
- [x] `transferable` ArrayBuffers used for position/index arrays (no structured clone overhead)
- [x] Worker error surfaces to `CadContext` and shows in `importStatus`
- [x] Cancel mid-import works (abort signal)

## Blocked by

None — can start immediately.
