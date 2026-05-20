# 005 — Golden tests for quoteCosting invariants

**Type:** AFK
Status: ready-for-agent

## What to build

Pin down current quote math behavior in `src/utils/quoteCosting.ts`. Cover: per-part cost calculation, material cost from volume + density, operation rollup, finishing surcharge, BoP add-ons, currency rounding. Use synthetic `Part` objects — fixtures not required for this issue.

Reuse existing types from `src/utils/quoteTypes.ts`.

## Acceptance criteria

- [ ] Test for each public function in `quoteCosting.ts`
- [ ] Edge cases covered: zero quantity, missing material, zero operations
- [ ] Rounding behavior asserted (no float drift)
- [ ] Tests document invariants in describe/it titles (acts as living spec)

## Blocked by

- #001 (test framework)
