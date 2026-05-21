# 016 - Rust topology module: face/edge/wire extraction

**Type:** AFK
Status: implementation-verified

## What to build

Implement `src-tauri/src/cad/topology.rs`, `src-tauri/src/cad/mod.rs`, and a narrow custom OCCT C++ shim per ADR 0003. Expose a Tauri command:

```rust
#[tauri::command]
async fn extract_topology(step_bytes: Vec<u8>) -> Result<TopologyPayload, String>
```

`TopologyPayload` includes: list of faces with stable IDs, list of edges with stable IDs, face-edge adjacency, wire loops per face. No surface classification yet (that's #017). No analytic surface params yet.

## Acceptance criteria

- [x] Tauri command registered and callable through Tauri command surface
- [x] Stable IDs survive multiple imports of the same file (deterministic)
- [x] Adjacency graph round-trips through JSON without loss
- [ ] Performance: 10 MB STEP processed in under 5s
- [x] Errors surface readable messages (no Rust panic strings)
- [x] No direct dependency on `opencascade-rs`; C++ boundary remains narrow and documented

## Implementation notes

- Implemented native topology extraction in `src-tauri/src/cad/topology.rs`.
- Added `src-tauri/src/cad/mod.rs` and registered `extract_topology` in the Tauri command handler.
- Added a narrow C ABI shim in `src-tauri/cpp/topo_shim.cpp` / `src-tauri/cpp/topo_shim.h`.
- Added matching TypeScript payload types in `src/types/topology.ts`.
- Build uses OCCT from vcpkg. Developer setup:

```powershell
vcpkg install opencascade:x64-windows
vcpkg list opencascade
```

The build script defaults to `C:\vcpkg` and also respects `VCPKG_ROOT`. It copies required vcpkg DLLs into the Tauri target output so app users do not need to install vcpkg or OCCT separately.

## Verification

- `cargo test -- --no-capture` in `src-tauri`: passed, 7/7 tests.
- `npm.cmd run build`: passed.
- Fixture coverage verified with `public/test_files/Pump Manifold v3.step` and `public/test_files/LOCUS SYSTEMS MACHINE FIXTURE.stp`.
- Remaining unchecked item needs a real >=10 MB STEP fixture or a dedicated performance fixture.

## Blocked by

- #015 (technology decision: use custom OCCT C++ shim, not `opencascade-rs`)
