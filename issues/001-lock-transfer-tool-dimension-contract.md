# 001 - Lock Transfer-Tool Dimension Contract In Tests

**Type:** AFK  
**Status:** ready

## What to build

Create a test-backed baseline for the transfer-tool fixture that proves the observed dimension problem is real and gives future agents exact expected body envelopes. The fixture must become the acceptance anchor for the dimension-correctness roadmap.

This slice should be independently useful even before the classifier is fixed: it should make the current false-positive body diameter behavior visible in tests or explicit expected metadata.

## Acceptance criteria

- [ ] The transfer-tool fixture is covered by a focused dimension-contract test or fixture expectation.
- [ ] The test confirms the file imports as 6 bodies.
- [ ] The test confirms the assembly envelope is about 100.00 x 100.00 x 126.07 mm.
- [ ] The test records selected-body envelopes:
  - Part 1: 100.00 x 100.00 x 49.93 mm
  - Part 2: 100.00 x 100.00 x 46.60 mm
  - Part 3: 100.00 x 100.00 x 29.02 mm
  - Part 4: 100.00 x 100.00 x 50.00 mm
  - Part 5: 39.45 x 39.47 x 30.70 mm
  - Part 6: 18.22 x 18.22 x 32.12 mm
- [ ] The test or fixture metadata states that feature diameters must not be treated as body/stock diameter.

## Blocked by

None - can start immediately.
