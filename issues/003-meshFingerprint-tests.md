# 003 — Golden tests for meshFingerprint duplicate grouping

**Type:** AFK
Status: ready-for-agent

## What to build

Lock in the current behavior of `src/utils/meshFingerprint.ts` against regression. For each fixture in `tests/fixtures/step/`, import via `importStepBytes`, run `groupIdenticalMeshes`, and assert the group count and group membership match the expected JSON. Cover the radial-signature outlier tolerance with at least one near-duplicate case where vertices differ slightly but the body is the same.

Reuse `importStepBytes` from `src/utils/cad.ts` and `groupIdenticalMeshes` from `src/utils/meshFingerprint.ts`.

## Acceptance criteria

- [ ] Every fixture covered by at least one assertion
- [ ] Mirrored instances grouped together
- [ ] Rotated instances grouped together
- [ ] Near-duplicate but distinct bodies NOT grouped together
- [ ] Tests run in CI in under 60s on the full fixture suite

## Blocked by

- #001 (test framework)
- #002 (fixtures)
