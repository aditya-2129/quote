# 023 — Slot detection module

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src/utils/features/slots.ts`. Detect slot features: elongated pockets with semicircular ends, or rectangular pockets with high aspect ratio.

Output: length, width, depth, orientation axis, slot type (`rounded` / `rectangular`).

## Acceptance criteria

- [ ] Distinguishes slot from generic pocket (aspect ratio > 2)
- [ ] Rounded end caps detected when present
- [ ] Orientation axis matches longest slot dimension
- [ ] Fixture coverage on at least 3 slot variants
- [ ] No double-counting with pocket detector (#022)

## Blocked by

- #019 (JS topology model)
