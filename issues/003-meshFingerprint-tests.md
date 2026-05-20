# 003 — Golden tests for meshFingerprint duplicate grouping

**Type:** AFK
Status: done
Completed in: 8d3658f

## What to build

Lock in the current behavior of `src/utils/meshFingerprint.ts` against regression. For each fixture in `tests/fixtures/step/`, import via `importStepBytes`, run `groupIdenticalMeshes`, and assert the group count and group membership match the expected JSON. Cover the radial-signature outlier tolerance with at least one near-duplicate case where vertices differ slightly but the body is the same.

Reuse `importStepBytes` from `src/utils/cad.ts` and `groupIdenticalMeshes` from `src/utils/meshFingerprint.ts`.

## Acceptance criteria

- [x] Every fixture covered by at least one assertion
- [x] Mirrored instances grouped together
- [x] Rotated instances grouped together
- [x] Near-duplicate but distinct bodies NOT grouped together
- [x] Tests run in CI in under 60s on the full fixture suite

## Blocked by

- #001 (test framework)
- #002 (fixtures)
