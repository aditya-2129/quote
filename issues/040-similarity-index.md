# 040 — Geometry similarity index

**Type:** AFK
Status: ready-for-agent

## What to build

Compute a fixed-length embedding per part from:
- Feature counts (holes, pockets, slots, …)
- Bounding box dimensions (normalized)
- Material
- Volume / surface area ratio
- Topology graph statistics (face count by type)

Store in a local vector index. Options: `sqlite-vss` (SQLite extension) or `hnswlib` (via Rust binding). Expose query: "find me past parts similar to this one."

Module: `src/utils/similarity.ts`. UI: in part detail view, show "Similar past parts" with link to historical job data.

## Acceptance criteria

- [ ] Embedding deterministic (same part → same vector)
- [ ] Top-5 retrieval precision ≥ 0.7 on 20 hand-curated queries
- [ ] Index rebuilds incrementally on new parts (no full rebuild every import)
- [ ] Query latency under 50ms on 1000-part index
- [ ] UI surfaces past margin/runtime alongside similarity

## Blocked by

- #028 (feature graph)
