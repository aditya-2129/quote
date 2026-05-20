# 025 — Chamfer detection module

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src/utils/features/chamfers.ts`. Identify chamfers: narrow planar faces between two adjacent faces, with two linear edges shared with the adjacent faces. Output: width, angle, length, adjacent face IDs.

## Acceptance criteria

- [ ] Detects 45° and non-45° chamfers
- [ ] Width and angle within ±0.5° / ±0.1 mm
- [ ] Distinguished from regular planar faces (narrow strip + linear edge constraint)
- [ ] Edge length matches the chamfered edge in CAD

## Blocked by

- #019 (JS topology model)
