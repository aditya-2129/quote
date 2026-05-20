# 031 — Extend machines schema with capability fields

**Type:** HITL
Status: ready-for-human

## What to build

Extend `src/db/schema/machines.ts` and the settings UI to capture machine capabilities required by the process planner:

- Travel limits (X, Y, Z mm)
- Spindle: max RPM, max power kW
- Axis count (3/4/5)
- Achievable tolerance class (ISO grade)
- Tool magazine capacity
- Material compatibility list (steel, aluminum, brass, titanium, plastic)
- Hourly rate (already exists — verify)

HITL: capability ranges and tolerance class definitions need shop-domain input. Wrong defaults produce wrong process plans downstream.

## Acceptance criteria

- [ ] Schema migration generated
- [ ] Settings UI extended in `src/pages/SettingsPage.tsx` (or equivalent)
- [ ] Seed data for at least 2 reference machines
- [ ] Existing machine rows migrate with sensible defaults
- [ ] Tooltips/help text on each field reviewed by a manufacturing engineer
- [ ] Validation: travel limits must be > 0

## Blocked by

None — can start immediately.
