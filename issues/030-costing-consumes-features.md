# 030 — Costing engine consumes feature graph

**Type:** AFK
Status: ready-for-agent

## What to build

Update `src/utils/quoteCosting.ts` to consume the feature graph from `part_features` (issue #028) instead of guessing operations from bounding box and material alone. Each feature type contributes a cost component:

- Holes → drill time (diameter × depth) per hole, +tap time if threaded
- Pockets → pocket mill time (volume removed)
- Slots → slot mill time
- Fillets/chamfers → additional tool path length
- Bosses → already accounted for in stock minus part volume

Feature-based costing must coexist with existing per-operation manual override (operator can still edit).

## Acceptance criteria

- [ ] Quote total differs from old method on a feature-rich part (visible improvement)
- [ ] Old quotes (no feature data) still cost correctly via fallback path
- [ ] Operator manual overrides take precedence over feature-derived values
- [ ] Tests pin down per-feature cost contributions
- [ ] Pre-existing `quoteCosting` golden tests (#005) still pass for legacy paths

## Blocked by

- #028 (feature persistence)
