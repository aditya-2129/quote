# 029 — Accessibility analysis (3/4/5-axis classifier)

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src/utils/manufacturing/accessibility.ts`. For each feature in a part, determine:

- Tool approach direction(s) (vector list)
- Setup count required (number of fixturings)
- Axis requirement: 3-axis / 4-axis / 5-axis / lathe / mill-turn / not machinable
- Reachability flags: undercuts, deep narrow features, tool length limits

Per-part summary: max axis requirement, total setup count, list of inaccessible features.

## Acceptance criteria

- [ ] 3-axis-only parts correctly classified
- [ ] Parts with undercuts flagged as 4/5-axis
- [ ] Lathe-suitable parts (rotational symmetry) detected
- [ ] Setup count matches manual planning on 5 reference parts
- [ ] Inaccessible features surface with reason

## Blocked by

- #021, #022, #023 (need real features to analyze)
