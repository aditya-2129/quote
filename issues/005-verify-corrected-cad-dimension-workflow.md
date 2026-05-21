# 005 - Verify Corrected CAD Dimension Workflow In The App

**Type:** HITL  
**Status:** blocked by 004

## What to build

Run the corrected workflow in the real local app and capture proof that the dimension contract works end to end. This is the final gate before any broader CAD intelligence roadmap can return.

## Acceptance criteria

- [ ] Start the Vite app with the Windows-safe command.
- [ ] Load `local_ps_220129_single_cavity_transfer_tool.stp` in the Viewer.
- [ ] Confirm the Viewer shows 6 bodies.
- [ ] Select each body and confirm envelope dimensions are correct.
- [ ] Confirm complex bodies do not show misleading body `Outer diameter`.
- [ ] Move the model to a quotation.
- [ ] Confirm quote parts use safe body dimensions.
- [ ] Run `npm.cmd run build`.
- [ ] Record screenshots or a concise verification note.

## Blocked by

- 004 - Keep Quote Handoff On Safe Body Dimensions
