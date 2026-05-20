# 015 — Spike: validate opencascade-rs maturity

**Type:** HITL
Status: ready-for-human

## What to build

One-week timeboxed spike to determine if `opencascade-rs` (or alternative Rust OCCT bindings) is mature enough to power BREP topology extraction in the Tauri sidecar. Deliverables:

- Prototype Rust crate that reads a STEP file and exposes face count, edge count, and analytic surface types of each face
- Build the prototype on Windows (the user's target platform); validate compile time, binary size impact, and runtime correctness against 5 reference STEP files
- Compare results against OCCT's draw-test reference output
- Document blockers, missing APIs, and effort estimate for full integration

HITL: outcome determines whether Phase 2 proceeds with `opencascade-rs`, falls back to a custom C++ FFI shim, or pivots to a Python sidecar with `pythonocc-core`.

## Acceptance criteria

- [ ] Prototype builds on Windows
- [ ] Reads STEP, lists faces with surface type
- [ ] Output matches manual OCCT viewer inspection on 5 fixtures
- [ ] Binary size impact measured (Tauri bundle delta)
- [ ] Decision document committed to `docs/adr/` with recommendation

## Blocked by

None — can start immediately.
