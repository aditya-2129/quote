# 034 — Cycle time estimator

**Type:** HITL
Status: ready-for-human

## What to build

Implement `src/utils/manufacturing/cycleTime.ts`. For each operation in the process plan (#033), estimate cycle time:

- Material removal volume / metal removal rate (from tool feeds/speeds)
- Tool change overhead per op
- Setup time per fixture
- Inspection time per tolerance class
- Air-cut and rapid moves (parametric estimate)

Per-part total = sum of operations + setup overhead. Per-quote total = per-part × quantity + batch setup amortization.

HITL: feeds/speeds + setup time values come from real shop data — generic estimates are usually wrong by 30%+. Validate against historical jobs.

## Acceptance criteria

- [ ] Estimates within ±20% of actual on 10 historical jobs
- [ ] Output broken down per operation for transparency in the quote
- [ ] Batch amortization correct: setup costs spread across qty
- [ ] Editable: operator can override any estimate manually
- [ ] Logged: which feeds/speeds were used (debugging aid)

## Blocked by

- #033 (process plan)
