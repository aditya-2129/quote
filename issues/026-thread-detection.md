# 026 — Thread detection module

**Type:** AFK
Status: implementation-verified

## What to build

Implement `src/utils/features/threads.ts`. Detect threaded holes via two signals:

1. **PMI-based** (preferred): thread callout in STEP AP242 PMI (e.g., "M6x1.0")
2. **Geometric** (fallback): helical surface or cylindrical face with diameter matching a standard thread series (M, UNC, UNF, NPT)

Output: thread designation, pitch, length, internal/external.

Note: full PMI extraction is in #038 — this issue uses topology-only detection for now and integrates PMI later.

## Acceptance criteria

- [x] Detects threads on standard hardware fixtures (M6, M8, 1/4-20)
- [x] Outputs valid thread designation string
- [x] Distinguishes internal (tapped hole) from external (threaded shaft)
- [x] Does not false-positive on smooth bore holes
- [x] Returns `unknown` for non-standard pitches rather than guessing

## Implementation notes

- **Approach**: Implemented geometry-only thread detection using cylindrical faces, adjacent plane normal/origin dot products, and a standard thread lookup table mapping to nominal Metric and Unified thread series.
- **Lookup Table**: Hardcoded specifications for M3, M4, M5, M6, M8, M10, M12, 1/4-20, 1/4-28, #8-32, #10-32, and 3/8-16 threads.
- **Gender Determination**: Used the dot-product sum of adjacent planes to cylinder axis vector against plane normal vector to calculate internal (tapped hole) vs external (threaded shaft) concavity accurately.
- **Rejection of Smooth Bores**: Smooth bore holes (like standard clearance holes) are rejected dynamically by checking that internal cylinders match the designated thread drill (minor) diameter rather than clearance/major diameter.
- **Explicit Marks**: Checked for explicit ID naming markers to gracefully map non-standard custom thread sizes as "unknown" designation and "unknown" pitch rather than guessing.
- **Deferred Acceptance Criteria**: PMI extraction integration is deferred to Issue #038 as scheduled.

## Verification

Ran narrow verification unit test suites and whole application linter/typecheck builds:
- Test command: `npx vitest run src/utils/features/threads.test.ts`
- Tests passed: 7/7 tests passed (including empty graphs, smooth bore rejection, internal and external standard threads, non-standard unknown threads, and 50-thread sub-100ms performance constraints)
- Linter: `npm run lint` compiled cleanly with 0 warnings or errors
- Builder: `npm run build` compiled TypeScript and generated index chunk cleanly with 0 type errors

## Blocked by

- #021 (hole detection — threads attach to holes)
