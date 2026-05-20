# 033 — Process planner rules engine

**Type:** HITL
Status: ready-for-human

## What to build

Implement `src/utils/manufacturing/processPlanner.ts`. Inputs: `Part` with feature graph, machine list, tooling list, material. Output: ordered operation list:

```
Op10: Saw cut (raw bar to length)
Op20: Face mill (squaring)
Op30: Drill (8x ⌀6 holes, Op-1 setup)
Op40: Pocket mill (central pocket)
Op50: Tap (M6 threads)
Op60: Chamfer
Op70: Deburr
```

Deterministic rules engine (no ML). Rules encoded as: feature type + material → tool selection → operation type + sequence position.

HITL: rule set must be authored by a manufacturing engineer. Initial wrong sequences will compound errors downstream in cycle time and cost.

## Acceptance criteria

- [ ] Generates plausible op sequences for 5 reference parts
- [ ] Shop-floor reviewer accepts the sequences on at least 4 of 5 parts
- [ ] Rule set documented as data (not buried in code)
- [ ] Multiple setups handled (Op-1, Op-2 fixturing)
- [ ] Tool selection respects machine tool magazine capacity

## Blocked by

- #028 (feature graph)
- #031 (machine capabilities)
- #032 (tooling DB)
