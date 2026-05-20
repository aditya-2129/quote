# 041 — Estimator calibration dashboard

**Type:** AFK
Status: ready-for-agent

## What to build

`src/pages/CalibrationPage.tsx` — analytics view comparing quoted vs actual on shipped jobs (from #039). Show:

- Cycle time accuracy histogram per operation type
- Margin distribution (planned vs realized)
- Outliers list (jobs with ≥30% delta) with one-click jump to the quote
- Material-specific bias (e.g., "aluminum pocket time consistently underestimated")
- Suggested rate adjustments (statistical, no ML)

This dashboard is the feedback loop that lets the deterministic engine improve over time without AI.

## Acceptance criteria

- [ ] Loads in under 1s on 500 shipped jobs
- [ ] Charts use existing design system (no new chart library unless necessary)
- [ ] Outlier list clickable to source quote
- [ ] Bias detection requires at least 10 jobs per material to display
- [ ] Suggested adjustments are advisory only (no auto-apply)

## Blocked by

- #039 (job history data)
- #040 (similarity for outlier context)
