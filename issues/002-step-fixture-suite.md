# 002 — Build STEP fixture suite

**Type:** HITL
Status: done
Completed in: daa209c

## What to build

Curate 15–25 real STEP files under `tests/fixtures/step/` covering the full classification space the CAD layer must handle. Each fixture gets a sibling `.expected.json` recording ground-truth values (bounding box, dominant shape, duplicate group count, hole count where applicable). Categories to cover:

- Simple machined plate
- Hex bar stock
- Round shaft (with and without through-hole)
- Bracket with multiple holes
- Assembly with mirrored instances
- Assembly with rotated duplicates
- Near-duplicate variants (same envelope, different feature)
- Filleted/chamfered edges
- Deep pocket
- Thin wall
- Pathological tessellation (very fine vs very coarse deflection)

HITL: sourcing real-world STEP files requires manual collection and ground-truth verification.

## Acceptance criteria

- [x] At least 15 fixtures present in `tests/fixtures/step/`
- [x] Each fixture has a sibling `.expected.json` with manually verified ground truth
- [x] `README.md` in fixtures dir documents each fixture's purpose
- [x] No fixture exceeds 10 MB (commit-friendly)
- [x] License/provenance recorded for each non-self-authored file

## Blocked by

None — can start immediately.
