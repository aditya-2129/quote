# 016 - Rust topology module: face/edge/wire extraction

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src-tauri/src/cad/topology.rs`, `src-tauri/src/cad/mod.rs`, and a narrow custom OCCT C++ shim per ADR 0003. Expose a Tauri command:

```rust
#[tauri::command]
async fn extract_topology(step_bytes: Vec<u8>) -> Result<TopologyPayload, String>
```

`TopologyPayload` includes: list of faces with stable IDs, list of edges with stable IDs, face-edge adjacency, wire loops per face. No surface classification yet (that's #017). No analytic surface params yet.

## Acceptance criteria

- [ ] Tauri command callable from JS
- [ ] Stable IDs survive multiple imports of the same file (deterministic)
- [ ] Adjacency graph round-trips through JSON without loss
- [ ] Performance: 10 MB STEP processed in under 5s
- [ ] Errors surface readable messages (no Rust panic strings)
- [ ] No direct dependency on `opencascade-rs`; C++ boundary remains narrow and documented

## Blocked by

- #015 (technology decision: use custom OCCT C++ shim, not `opencascade-rs`)
