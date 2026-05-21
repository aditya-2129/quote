# 015 — Spike: validate opencascade-rs maturity

**Type:** HITL
Status: done
Completed in: 51522db

## What to build

One-week timeboxed spike to determine if `opencascade-rs` (or alternative Rust OCCT bindings) is mature enough to power BREP topology extraction in the Tauri sidecar. Deliverables:

- Prototype Rust crate that reads a STEP file and exposes face count, edge count, and analytic surface types of each face
- Build the prototype on Windows (the user's target platform); validate compile time, binary size impact, and runtime correctness against 5 reference STEP files
- Compare results against OCCT's draw-test reference output
- Document blockers, missing APIs, and effort estimate for full integration

HITL: outcome determines whether Phase 2 proceeds with `opencascade-rs`, falls back to a custom C++ FFI shim, or pivots to a Python sidecar with `pythonocc-core`.

## Acceptance criteria

- [x] Prototype builds on Windows
- [ ] Reads STEP, lists faces with surface type
- [ ] Output matches manual OCCT viewer inspection on 5 fixtures
- [ ] Binary size impact measured (Tauri bundle delta)
- [x] Decision document committed to `docs/adr/` with recommendation

## Outcome

Decision captured in `docs/adr/0003-brep-topology-integration-path.md`.

The spike rejects direct `opencascade-rs 0.2.0` adoption for Phase 2 on Windows. It also rejects `occt-wasm 3.0.1` as a drop-in backend because it builds but fails runtime initialization before fixture import.

The unchecked acceptance items are intentionally left unchecked because the spike found blocker-level failures before fixture validation or Tauri bundle measurement could be completed. That is the HITL outcome of the spike, not remaining implementation work for `opencascade-rs`.

Recommendation: implement Phase 2 as a narrow custom OCCT C++ shim called from Rust, exposing only the topology and analytic surface payload needed by the quote app.

## Blocked by

None — can start immediately.
