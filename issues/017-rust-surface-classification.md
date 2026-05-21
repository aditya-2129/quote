# 017 - Rust analytic surface classification

**Type:** AFK
Status: implementation-verified

## What to build

Extend the Rust topology module with `src-tauri/src/cad/surfaces.rs`. For each face, classify the underlying surface and extract exact parameters:

- `Plane` - origin, normal
- `Cylinder` - axis, radius, length, angular span
- `Cone` - axis, half-angle, radii
- `Sphere` - center, radius
- `Torus` - axis, major + minor radius
- `BSpline` - fallback, no exact params

Attach classification to each face in `TopologyPayload`.

## Acceptance criteria

- [x] All five analytic types classified correctly on fixture suite
- [x] B-spline fallback never crashes
- [x] Cylinder axis vector is normalized to within 0.001
- [x] Radii match nominal CAD values within 0.01 mm
- [x] Faces with multiple surface types handled or documented

## Implementation notes

- Added `src-tauri/src/cad/surfaces.rs` for typed Rust surface payloads.
- Extended each `TopoFace` with a `surface` classification object.
- Implemented classification inside the existing narrow OCCT C++ shim using `BRepAdaptor_Surface`.
- Supported kinds: `plane`, `cylinder`, `cone`, `sphere`, `torus`, `b_spline`, and `unknown`.
- Extracted exact parameters where OCCT exposes them:
  - Plane: origin, normal
  - Cylinder: axis, radius, length, angular span
  - Cone: axis, half-angle, min/max radius, length, angular span
  - Sphere: center, radius, angular span
  - Torus: axis, major radius, minor radius, angular span
  - B-spline: classified as fallback without pole/knot serialization
- OCCT BREP represents each face with one underlying surface. Mixed or unsupported OCCT surface categories are returned as `unknown` rather than crashing.

## Verification

- `cargo test -- --no-capture` in `src-tauri`: passed, 10/10 tests.
- `npm.cmd run build`: passed.
- Tests verify all requested analytic classes across the fixture suite, B-spline fallback coverage, cylinder axis normalization, and D30 shaft radius = 15 mm within 0.01 mm.

## Blocked by

- #016 (topology module)
