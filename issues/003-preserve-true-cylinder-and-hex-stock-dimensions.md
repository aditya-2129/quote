# 003 - Preserve True Cylinder And Hex Stock Dimensions

**Type:** AFK  
**Status:** blocked by 002

## What to build

Prove the conservative classifier still recognizes real stock-like bodies. The fix for complex bodies must not regress true round shafts, tubes, cylinders, hex bars, or hex standoffs.

This slice should cover shape analysis, Viewer selected-body display, and existing fixture tests for stock-like parts.

## Acceptance criteria

- [ ] True whole-body cylinders still show `Outer diameter` and `Length`.
- [ ] True whole-body hex bodies still show `AF` and `Length`.
- [ ] Box/plate/block bodies show envelope dimensions without stock diameter labels.
- [ ] Existing shape-analysis fixture tests still pass or are updated to the new conservative contract.
- [ ] Any new confidence/complex classification keeps old consumers working or updates them safely.

## Blocked by

- 002 - Stop Complex Bodies From Showing Stock Diameter
