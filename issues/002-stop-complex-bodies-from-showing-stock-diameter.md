# 002 - Stop Complex Bodies From Showing Stock Diameter

**Type:** AFK  
**Status:** blocked by 001

## What to build

Fix the Viewer-selected-body path so complex bodies from the transfer-tool fixture show envelope dimensions and do not show a misleading body `Outer diameter`. This slice should cut through classification, selected-body Inspector output, and tests for the fixture.

The user-visible result is that a complex plate/tooling body is not presented as round stock just because it contains cylindrical geometry.

## Acceptance criteria

- [ ] Selecting each transfer-tool body still shows its envelope X/Y/Z.
- [ ] Complex transfer-tool bodies do not show `Outer diameter` as a body dimension.
- [ ] Shape analysis is conservative enough that a bore, boss, pocket wall, or other cylindrical feature cannot by itself classify the whole body as round stock.
- [ ] The Viewer Inspector communicates complex/envelope body dimensions without adding explanatory clutter.
- [ ] Focused tests fail on the old behavior and pass on the corrected behavior.

## Blocked by

- 001 - Lock Transfer-Tool Dimension Contract In Tests
