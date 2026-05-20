# 027 — Boss detection module

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src/utils/features/bosses.ts`. Detect bosses: raised cylindrical or rectangular protrusions from a base face. Output: shape (round/rectangular), dimensions, height, base face ID.

## Acceptance criteria

- [ ] Detects round and rectangular bosses on fixture parts
- [ ] Dimensions match CAD nominal to ±0.1 mm
- [ ] Distinguishes a boss with a hole (returns both features) from a simple boss
- [ ] No confusion with stock material edges

## Blocked by

- #019 (JS topology model)
