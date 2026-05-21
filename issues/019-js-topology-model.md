# 019 - JS-side TopologyGraph and FaceClass types

**Type:** AFK
Status: implementation-verified

## What to build

Create `src/utils/topology.ts` mirroring the Rust payload as TypeScript types:

- `TopologyGraph` - faces map + edges map + adjacency
- `FaceClass` discriminated union: `Plane | Cylinder | Cone | Sphere | Torus | Spline`
- `EdgeClass` discriminated union: `Linear | Circular | Spline`
- Helper functions: `findFacesByClass()`, `neighborsOf(faceId)`, `wireLoopsOf(faceId)`

This is the API every feature recognition module (issues #021-#027) consumes.

## Acceptance criteria

- [x] Types compile clean against current `tsconfig`
- [x] Helper functions have unit tests
- [x] Discriminated unions exhaustive (TypeScript `never` check)
- [x] Documentation explaining when to use this vs the mesh-side API
- [x] No runtime cost when topology is absent (graceful undefined)

## Implementation notes

- Extended `src/utils/topology.ts` with `TopologyGraph`, `FaceClass`, `EdgeClass`, `buildTopologyGraph()`, `findFacesByClass()`, `neighborsOf()`, and `wireLoopsOf()`.
- `buildTopologyGraph(undefined)` returns `undefined`; helper functions return empty arrays when topology is absent.
- `FaceClass` maps Rust surface kinds to a JS discriminated union. `b_spline` and `unknown` are represented as `kind: "spline"` so feature modules can treat them as non-analytic fallback surfaces.
- `EdgeClass` is present as the consumer-facing API. Because the current Rust payload does not yet classify curves, all current edges are conservatively exposed as `kind: "spline"` until a later native edge-curve classification slice adds exact linear/circular data.
- Architecture docs now explain topology APIs vs mesh-side APIs.

## Verification

- `npm.cmd test -- src/utils/topology.test.ts`: passed, 9/9 tests.
- `npm.cmd run build`: passed.

## Blocked by

- #018 (serialization)
