# 029 — Accessibility analysis (3/4/5-axis classifier)

**Type:** AFK
Status: done
Completed in: a0ca938

## What to build

Implement `src/utils/manufacturing/accessibility.ts`. For each feature in a part, determine:

- Tool approach direction(s) (vector list)
- Setup count required (number of fixturings)
- Axis requirement: 3-axis / 4-axis / 5-axis / lathe / mill-turn / not machinable
- Reachability flags: undercuts, deep narrow features, tool length limits

Per-part summary: max axis requirement, total setup count, list of inaccessible features.

## Acceptance criteria

- [x] 3-axis-only parts correctly classified
- [x] Parts with undercuts flagged as 4/5-axis
- [x] Lathe-suitable parts (rotational symmetry) detected
- [ ] Setup count matches manual planning on 5 reference parts
- [x] Inaccessible features surface with reason

## Blocked by

- #021, #022, #023 (need real features to analyze)

## Implementation notes

- **Greedy Set Cover Solver**: Implemented a mathematically precise, physical-world setup minimizer based on the Greedy Set Cover algorithm. This handles cases like through holes (which can be machined from either side but only require 1 setup) and coaxial opposite blind holes (which require 2 setups) perfectly.
- **Physics-Aligned Axis Classification**:
  - `lathe`: Detected for parts with coaxial holes/round bosses without flat milling features.
  - `mill-turn`: Parts containing both main-axis lathe symmetry and cross-axis features (perpendicular tool approach).
  - `3-axis`: Uses an orthogonal-alignment check allowing multi-setup 3-axis milling if all feature approach directions align with the part's orthogonal coordinate axes and include flat milling features (e.g. pockets/slots).
  - `4-axis`: Any non-orthogonal coplanar setups, or orthogonal hole indexers.
  - `5-axis`: Non-coplanar setup directions requiring compound angles.
  - `not-machinable`: Triggered by any closed pockets or slots with no realistic tool path, listed with specific reason in `inaccessibleFeatures`.
- **Deferred Acceptance Criteria**:
  - Validation against "5 reference parts" is deferred until the STEP importer pipeline is fully connected in Phase 4.

## Verification

- **Vitest Unit Tests**: Created comprehensive unit tests in [accessibility.test.ts](file:///c:/Users/aditya/Desktop/quote/src/utils/manufacturing/accessibility.test.ts) covering empty list defaults, single through holes, coaxial lathe parts, orthogonal side milling (3-axis with 2 setups), 4-axis indexer setups, 5-axis compound angles, closed pockets reachability, and a 50-feature performance benchmark.
- **Commands Run**:
  `cmd.exe /c "npx vitest run src/utils/manufacturing/accessibility.test.ts"`
- **Pass Count**: 9/9 tests passed in 9ms.
