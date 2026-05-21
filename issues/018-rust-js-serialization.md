# 018 - JSON serialization Rust-JS for topology payload

**Type:** AFK
Status: implementation-verified

## What to build

Implement `src-tauri/src/cad/serialize.rs` defining the wire format for `TopologyPayload` and its sub-types. Use `serde_json` with versioned envelope:

```json
{ "version": 1, "topology": { "...": "..." } }
```

Mirror types on the JS side in `src/utils/topology.ts` (issue #019 covers the JS model). Version field exists to allow future schema migration without breaking older quote files.

## Acceptance criteria

- [x] Single source of truth for the schema (Rust types + generated JSON schema)
- [x] Round-trip test: Rust -> JSON -> JS -> JSON -> Rust produces identical payload
- [x] Unknown future fields ignored gracefully on older clients
- [x] Payload size benchmarked on 5 fixtures (target: under 2 MB for typical part)

## Implementation notes

- Added `src-tauri/src/cad/serialize.rs` with `TopologyEnvelope`, `TOPOLOGY_SCHEMA_VERSION = 1`, envelope wrapping, serde JSON helpers, and generated schema support through `schemars`.
- `extract_topology` now returns the versioned envelope rather than a bare `TopologyPayload`.
- Added `topology_payload_schema` Tauri command for retrieving the generated JSON schema.
- Added `src/utils/topology.ts` with JS envelope parse/serialize helpers and `TOPOLOGY_SCHEMA_VERSION = 1`.
- Existing payload shape remains in `src/types/topology.ts`; issue #019 can build the richer JS model on top.

## Verification

- `cargo test -- --no-capture` in `src-tauri`: passed, 15/15 tests.
- `npm.cmd test -- src/utils/topology.test.ts`: passed, 3/3 tests.
- Payload size benchmark results:
  - `FIXTURE PS_1250 ROUND BLOCKS.stp`: 238,349 bytes
  - `LOCUS SYSTEMS MACHINE FIXTURE.stp`: 179,043 bytes
  - `PS_1250_FIXTURE BLOCKS.stp`: 68,921 bytes
  - `Pump Manifold v3.step`: 75,703 bytes
  - `TEST BUTTON_9 CAVITY_29X12 (1).stp`: 132,676 bytes

## Blocked by

- #017 (surface classification - payload schema depends on this)
