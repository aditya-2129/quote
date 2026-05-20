# 017 — Rust analytic surface classification

**Type:** AFK
Status: ready-for-agent

## What to build

Extend the Rust topology module with `src-tauri/src/cad/surfaces.rs`. For each face, classify the underlying surface and extract exact parameters:

- `Plane` — origin, normal
- `Cylinder` — axis, radius, length, angular span
- `Cone` — axis, half-angle, radii
- `Sphere` — center, radius
- `Torus` — axis, major + minor radius
- `BSpline` — fallback, no exact params

Attach classification to each face in `TopologyPayload`.

## Acceptance criteria

- [ ] All five analytic types classified correctly on fixture suite
- [ ] B-spline fallback never crashes
- [ ] Cylinder axis vector matches OCCT viewer to ±0.001
- [ ] Radii match nominal CAD values within 0.01 mm
- [ ] Faces with multiple surface types (rare) handled or documented

## Blocked by

- #016 (topology module)
