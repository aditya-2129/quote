# ADR 0003: BREP topology integration path

Date: 2026-05-21

## Status

Accepted

## Context

Phase 2 needs BREP topology access before feature recognition, accessibility analysis, and tolerance-aware costing can be implemented reliably. The current application uses `occt-import-js` tessellation, which gives triangle meshes but not the analytic face, edge, wire, and surface graph needed for manufacturing intelligence.

OCCT itself is the right kernel capability target. The official OCCT overview describes BREP as topology binding geometric objects together, with sub-shapes including vertices, edges, wires, faces, shells, solids, and compounds. It also documents Data Exchange support for IGES and STEP, and the STEP mapping includes analytic surfaces such as planes, cylindrical surfaces, conical surfaces, spherical surfaces, toroidal surfaces, and B-splines.

Issue 015 asked for a Windows spike to validate whether `opencascade-rs` or another Rust OCCT binding is mature enough to power a Tauri-side topology extractor.

## Spike Results

Two isolated prototype crates were created under `tools/`:

- `tools/opencascade-native-spike`: native `opencascade = 0.2.0`
- `tools/occt-rs-spike`: `occt-wasm = 3.0.1`

### Native opencascade-rs

The high-level `opencascade` crate exposes `Shape::read_step`, `Shape::faces()`, and `Shape::edges()`, but its public API does not expose enough analytic surface classification for Phase 2. Its docs.rs page also shows only `11.97%` crate documentation for `opencascade 0.2.0`, and only a Linux docs.rs platform build is listed.

Build attempts on this Windows machine failed before the prototype could read fixtures:

1. Initial build failed because CMake was not installed on `PATH`.
2. With temporary local CMake 4.3.2, bundled OCCT failed at configure time because compatibility with CMake `< 3.5` has been removed.
3. With temporary local CMake 3.31.10, bundled OCCT configured and compiled for roughly ten minutes, then failed during install because `occt-sys 0.2.0` expected missing Debug PDB files such as `TKernel.pdb`.
4. After creating empty PDB placeholders to test the next step, `opencascade-sys 0.2.0` failed to compile generated C++ bridge code because it could not find `opencascade-sys/include/wrapper.hxx` from the generated build context.
5. After adding a temporary include-path workaround, `opencascade-sys 0.2.0` still failed in generated C++ bridge code with `Handle_Poly_Triangulation` / `std::unique_ptr<Handle_Poly_Triangulation>` type errors.

Conclusion: `opencascade-rs 0.2.0` is not mature enough for direct Phase 2 integration on the target Windows stack without first forking and repairing its build system and bindings.

### occt-wasm

`occt-wasm 3.0.1` has a stronger public API for this project. The prototype compiled in release mode and used APIs for STEP import, subshape extraction, face surface type, UV bounds, cylinder data, edge/face adjacency, and geometry properties. The resulting release executable was `22,481,408` bytes.

Runtime initialization failed before any STEP fixture could be imported:

```text
WASM runtime error: unknown import: `env::emscripten_get_preloaded_image_data` has not been defined
```

The crate also returns raw subshape IDs from `get_sub_shapes()` while keeping `ShapeHandle` construction private, forcing an unsafe conversion to query returned faces. That is a small API defect, but still a defect for production integration.

Conclusion: `occt-wasm` is promising as an API shape reference, but it is not a clean drop-in Tauri-side topology backend today.

## Decision

Do not proceed with direct `opencascade-rs` integration for Phase 2.

Proceed with a small custom OCCT C++ shim, called from Rust via `cxx` or a narrow C ABI, for issues 016-020. Keep the shim intentionally thin:

- STEP bytes/path in.
- JSON-serializable topology payload out.
- No UI, viewer, app framework, or broad OCCT wrapper surface.
- Expose only the topology and analytic geometry needed by the quote app.

Use raw OCCT concepts directly:

- `STEPControl_Reader` for STEP import.
- `TopExp_Explorer` / indexed maps for faces, edges, wires, and adjacency.
- `BRep_Tool::Surface` and `GeomAdaptor_Surface` or equivalent RTTI checks for planes, cylinders, cones, spheres, torus, and spline surfaces.
- `BRepGProp` for area and center properties where needed.

## Consequences

Positive:

- Avoids relying on immature Rust bindings for core product geometry.
- Keeps the production surface small and auditable.
- Matches the official OCCT topology and STEP model directly.
- Lets Phase 2 expose exactly the payload TypeScript needs instead of inheriting a generic CAD wrapper API.

Negative:

- Requires maintaining a small amount of C++.
- Requires explicit Windows build setup for the shim.
- Requires us to design ownership, error handling, and serialization carefully.

## Follow-up

Issue 016 should be changed from "Rust topology module using opencascade-rs" to "Rust command wrapping a custom OCCT C++ topology shim."

Before feature work, add a tiny C++/Rust build proof that links one OCCT toolkit and returns a hardcoded version string. Then add STEP import and topology extraction in narrow slices.

## References

- OCCT overview: https://dev.opencascade.org/doc/overview/html/
- OCCT STEP mapping reference: https://github.com/Open-Cascade-SAS/OCCT/wiki/step
- `opencascade 0.2.0` docs: https://docs.rs/opencascade/latest/opencascade/

