# US-003: Part Material, Operation, And Costing

## Story
As an estimator, I want material and machining selections to drive real quote totals so that part costs are not stuck at zero.

## Scope
- Connect part material selections to DB material ids.
- Connect operation machine selections to DB machine ids.
- Compute material, setup, machining, finishing, tooling, inspection, margin, tax, totals, and quantity breaks from persisted data.

## Acceptance Criteria
- Material-only parts calculate material cost.
- Material plus operations calculate setup and machining cost.
- Quantity changes update totals and quantity breaks.
- Saved quote cost snapshot matches the visible quote total.
- Rows no longer show placeholder `-` values once material and operations are configured.

## Notes
- Keep v1 focused on existing material and machine libraries.
- Avoid changing DB orchestration except through the workflow service contract.
