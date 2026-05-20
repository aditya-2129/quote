# 026 — Thread detection module

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src/utils/features/threads.ts`. Detect threaded holes via two signals:

1. **PMI-based** (preferred): thread callout in STEP AP242 PMI (e.g., "M6x1.0")
2. **Geometric** (fallback): helical surface or cylindrical face with diameter matching a standard thread series (M, UNC, UNF, NPT)

Output: thread designation, pitch, length, internal/external.

Note: full PMI extraction is in #038 — this issue uses topology-only detection for now and integrates PMI later.

## Acceptance criteria

- [ ] Detects threads on standard hardware fixtures (M6, M8, 1/4-20)
- [ ] Outputs valid thread designation string
- [ ] Distinguishes internal (tapped hole) from external (threaded shaft)
- [ ] Does not false-positive on smooth bore holes
- [ ] Returns `unknown` for non-standard pitches rather than guessing

## Blocked by

- #021 (hole detection — threads attach to holes)
