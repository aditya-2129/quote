# Issues - CAD Dimension Correctness

Generated from `plans/dimension-correctness-roadmap.md` using the `to-issues` workflow.

The previous enterprise CAD roadmap issues are deleted for now. Do not add manufacturing-intelligence work back until this issue set passes.

## Active Issues

| Issue | Title | Type | Blocked by |
|---|---|---|---|
| 001 | Lock transfer-tool dimension contract in tests | AFK | None |
| 002 | Stop complex bodies from showing stock diameter | AFK | 001 |
| 003 | Preserve true cylinder and hex stock dimensions | AFK | 002 |
| 004 | Keep quote handoff on safe body dimensions | AFK | 002, 003 |
| 005 | Verify the corrected CAD dimension workflow in the app | HITL | 004 |

## Blocking Fixture

`tests/fixtures/step/local_ps_220129_single_cavity_transfer_tool.stp`

Expected high-level import result:

- 6 bodies
- Assembly bounding box: 100.00 x 100.00 x 126.07 mm
- Assembly volume: about 974.51 cm3

## Rule

Do these in order. The next roadmap does not start until this one passes.
