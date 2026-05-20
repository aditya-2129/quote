# 035 — DFM engine extension

**Type:** AFK
Status: ready-for-agent

## What to build

Build a Design For Manufacturability engine surfacing producibility warnings on imported parts. Module: `src/utils/manufacturing/dfm.ts`. Checks:

- Thin walls (face-pair offset below material-specific threshold)
- Deep pockets (depth/width ratio > 4)
- Tool reach violations (feature depth > available tool length)
- Tight tolerances on hard-to-hold features
- Sharp internal corners (no fillet) where end mill cannot reach
- Excessive aspect ratios

Output: `DfmIssue[]` with severity, location (face IDs), suggested mitigation.

UI: surface in part detail view as a collapsible warnings panel.

## Acceptance criteria

- [ ] All 6 check types implemented
- [ ] Issues highlight on the 3D viewer when clicked
- [ ] Severity levels: info / warning / blocker
- [ ] Reviewer agreement ≥80% with human DFM review on 10 reference parts
- [ ] False positives on simple parts: zero

## Blocked by

- #028 (feature graph)
