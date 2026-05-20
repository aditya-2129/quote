# 038 — Tolerance-aware costing

**Type:** AFK
Status: ready-for-agent

## What to build

Update `src/utils/quoteCosting.ts` and the process planner (#033) to consume PMI tolerances:

- Tight tolerance (≤ ±0.01) on a face → upgrade operation from rough mill to fine mill or grind
- Surface finish < Ra 1.6 → add finishing pass
- Position tolerance → add inspection time
- GD&T callouts present → add CMM inspection step

Tolerance grades feed into cycle time estimator (#034) as multipliers.

## Acceptance criteria

- [ ] Same part with ±0.1 vs ±0.01 produces different (higher) quote
- [ ] Process plan changes appropriately for tight tolerances
- [ ] Inspection time added when GD&T is present
- [ ] Test: tolerance multiplier table is data, not magic numbers
- [ ] No regression on parts without PMI data (fallback to legacy costing)

## Blocked by

- #037 (PMI consumer)
