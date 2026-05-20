# 019 — JS-side TopologyGraph and FaceClass types

**Type:** AFK
Status: ready-for-agent

## What to build

Create `src/utils/topology.ts` mirroring the Rust payload as TypeScript types:

- `TopologyGraph` — faces map + edges map + adjacency
- `FaceClass` discriminated union: `Plane | Cylinder | Cone | Sphere | Torus | Spline`
- `EdgeClass` discriminated union: `Linear | Circular | Spline`
- Helper functions: `findFacesByClass()`, `neighborsOf(faceId)`, `wireLoopsOf(faceId)`

This is the API every feature recognition module (issues #021–#027) consumes.

## Acceptance criteria

- [ ] Types compile clean against current `tsconfig`
- [ ] Helper functions have unit tests
- [ ] Discriminated unions exhaustive (TypeScript `never` check)
- [ ] Documentation explaining when to use this vs the mesh-side API
- [ ] No runtime cost when topology is absent (graceful undefined)

## Blocked by

- #018 (serialization)
