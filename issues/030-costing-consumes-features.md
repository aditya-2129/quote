# 030 — Costing engine consumes feature graph

**Type:** AFK
Status: done
Completed in: 1986d9d

## What to build

Update `src/utils/quoteCosting.ts` to consume the feature graph from `part_features` (issue #028) instead of guessing operations from bounding box and material alone. Each feature type contributes a cost component:

- Holes → drill time (diameter × depth) per hole, +tap time if threaded
- Pockets → pocket mill time (volume removed)
- Slots → slot mill time
- Fillets/chamfers → additional tool path length
- Bosses → already accounted for in stock minus part volume

Feature-based costing must coexist with existing per-operation manual override (operator can still edit).

## Acceptance criteria

- [x] Quote total differs from old method on a feature-rich part (visible improvement)
- [x] Old quotes (no feature data) still cost correctly via fallback path
- [x] Operator manual overrides take precedence over feature-derived values
- [x] Tests pin down per-feature cost contributions
- [x] Pre-existing `quoteCosting` golden tests (#005) still pass for legacy paths

## Blocked by

- #028 (feature persistence)

## Implementation notes

### New helper: `src/utils/costing/featureCost.ts`

Pure-function module that converts a feature array into total additional cycle-time (minutes).

**Constants (named, with unit comments):**

| Constant | Value | Unit |
|---|---|---|
| `DRILL_RATE_MM3_PER_MIN` | 800 | mm³/min — HSS twist drill in mild steel |
| `TAP_RATE_MM_PER_MIN` | 50 | mm/min — tapping feed rate |
| `POCKET_MILL_RATE_MM3_PER_MIN` | 2000 | mm³/min — carbide end-mill pocket clearing |
| `SLOT_MILL_RATE_MM3_PER_MIN` | 1500 | mm³/min — slotting (constrained chip evacuation) |
| `FILLET_CHAMFER_RATE_MM_PER_MIN` | 300 | mm/min — contour finishing pass |

**Per-feature formulas:**

| Feature | Time (min) |
|---|---|
| Hole (drill) | `π·(d/2)²·depth / DRILL_RATE` |
| Thread (drill + tap) | drill volume / DRILL_RATE + `length / TAP_RATE` |
| Pocket | `depth × footprintAreaMm2 / POCKET_RATE` |
| Slot | `lengthMm × widthMm × depthMm / SLOT_RATE` |
| Fillet | `lengthMm / FILLET_CHAMFER_RATE` |
| Chamfer | `lengthMm / FILLET_CHAMFER_RATE` |
| Boss | 0 (absorbed in stock-minus-part volume) |

### Wiring in `quoteCosting.ts`

- Local `PartWithFeatures` intersection type extends `Part` with optional `features` field — no modification to `quoteTypes.ts`.
- New `partFeatureCost(part, assemblyQuantity, machines)` function:
  - Returns 0 when `part.features` is undefined/empty → legacy path, byte-identical output.
  - Uses `featureCycleMinutes()` to compute total feature minutes, prices at first operation's machine hourly rate.
- `partMachineCost()` now adds `partFeatureCost()` on top of existing operation-based cost.

### Precedence (top wins)

1. **Operator manual override** — `rateOverride` on an operation controls that operation's hourly rate (today's behavior, preserved).
2. **Feature-derived cost** — additive cycle-time from detected features, priced at the part's machine rate.
3. **Existing bounding-box / material rollup** — legacy fallback when no features present.

### Fallback trigger

A part with no `features` field (or an empty array) triggers the legacy fallback. The `featureCycleMinutes()` function returns 0, so `partFeatureCost()` returns 0, and `partMachineCost()` collapses to the original operation-only formula. All 103 golden tests pass unchanged.

## Verification

```bash
# All tests (268 total, 119 in quoteCosting — 103 golden + 16 new)
cmd /c "npx vitest run"
# → Test Files  20 passed (20)  |  Tests  268 passed (268)

# Lint (0 errors, 5 pre-existing warnings in accessibility.ts)
cmd /c "npm run lint"
# → 0 errors, 5 warnings

# Build (typecheck + Vite bundle)
cmd /c "npm run build"
# → clean
```
