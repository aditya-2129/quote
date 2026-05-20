# 018 — JSON serialization Rust↔JS for topology payload

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src-tauri/src/cad/serialize.rs` defining the wire format for `TopologyPayload` and its sub-types. Use `serde_json` with versioned envelope:

```json
{ "version": 1, "topology": { ... } }
```

Mirror types on the JS side in `src/utils/topology.ts` (issue #019 covers the JS model). Version field exists to allow future schema migration without breaking older quote files.

## Acceptance criteria

- [ ] Single source of truth for the schema (Rust types + generated JSON schema)
- [ ] Round-trip test: Rust → JSON → JS → JSON → Rust produces identical payload
- [ ] Unknown future fields ignored gracefully on older clients
- [ ] Payload size benchmarked on 5 fixtures (target: under 2 MB for typical part)

## Blocked by

- #017 (surface classification — payload schema depends on this)
