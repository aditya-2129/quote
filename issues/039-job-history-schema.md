# 039 — job_history schema + manual entry UI

**Type:** AFK
Status: ready-for-agent

## What to build

New `src/db/schema/job_history.ts` recording shipped jobs:

- Quote ID (FK)
- Date shipped
- Actual runtime per operation (hours)
- Actual margin (% delta from quote)
- Actual scrap rate
- Actual tooling cost
- Operator notes (text)

UI: `src/pages/JobHistoryPage.tsx` for manual data entry plus a list/filter view.

This is the foundation for the estimator calibration feedback loop. Without real shipped-job data, every later AI/similarity step is starved.

## Acceptance criteria

- [ ] Schema migrated
- [ ] Manual entry form with validation (no negative hours, margin sane)
- [ ] List view filterable by date range, material, machine
- [ ] Quote → "Mark as shipped" action seeds the entry form pre-filled
- [ ] CSV export for offline analysis

## Blocked by

None — can start immediately.
