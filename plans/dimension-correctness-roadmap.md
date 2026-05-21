# Plan: CAD Dimension Correctness

## Decision

Pause the previous enterprise CAD roadmap. Do not continue into machine capability databases, tooling databases, process planning, cycle-time estimation, DFM expansion, PMI, historical intelligence, or additional CAD formats until the app can prove that body dimensions and feature dimensions are separated correctly.

The immediate product requirement is simple: the app must not show or use a feature diameter as if it were the body's outer diameter.

## Product Scope

This remains a single-user local Tauri desktop app:

- No SaaS
- No shared backend
- No multi-user workflow
- No remote CAD service
- No team/manager approval system

All validation should run through local fixtures, local tests, and the real local Viewer.

## Failure Being Fixed

Fixture:

`tests/fixtures/step/local_ps_220129_single_cavity_transfer_tool.stp`

Observed Viewer behavior after loading the file:

- The app correctly imports 6 bodies.
- The assembly envelope is correct: 100.00 x 100.00 x 126.07 mm.
- Each selected body shows correct bounding-box dimensions.
- The Inspector also shows `Outer diameter` for selected bodies.
- For complex bodies, that value can be a cylindrical feature diameter, not the whole-body or stock diameter.

Current observed values:

| Part | Correct selected body envelope | Current misleading Inspector diameter |
|---|---|---:|
| Part 1 | 100.00 x 100.00 x 49.93 mm | 24.86 mm |
| Part 2 | 100.00 x 100.00 x 46.60 mm | 99.89 mm |
| Part 3 | 100.00 x 100.00 x 29.02 mm | 59.58 mm |
| Part 4 | 100.00 x 100.00 x 50.00 mm | 69.98 mm |
| Part 5 | 39.45 x 39.47 x 30.70 mm | 33.27 mm |
| Part 6 | 18.22 x 18.22 x 32.12 mm | 13.66 mm |

This is not acceptable for quoting. A user can read `Outer diameter` as stock/body size and quote from the wrong dimension.

## Dimension Contract

### Body Envelope

Every imported CAD body must always expose the body envelope:

- X
- Y
- Z
- Units in millimeters

Envelope dimensions come from the mesh/body bounding box and are always body-level dimensions.

### Stock Shape

The app may show stock-style dimensions only when the whole body qualifies as that stock shape:

- Round/cylindrical stock: show `Outer diameter` and `Length`
- Hex stock: show `AF` and `Length`
- Box/plate/block stock: show X/Y/Z envelope
- Complex/tooling body: show X/Y/Z envelope and a complex/body-envelope label

The classifier must be conservative. If the geometry is ambiguous, show envelope dimensions, not stock dimensions.

### Feature Dimensions

Feature dimensions are separate from body dimensions:

- Hole diameter
- Boss diameter
- Counterbore/countersink diameter
- Pocket depth
- Slot length/width/depth
- Fillet radius
- Chamfer width/angle

Feature dimensions must not appear under body/stock labels. They belong in a separate feature section when the feature pipeline is ready.

### Quote Handoff

Quote part creation must use safe dimensions:

- Whole-body cylinder -> round stock defaults may use outer diameter and length.
- Whole-body hex -> hex stock defaults may use AF and length.
- Complex/tooling body -> quote part defaults must use envelope dimensions and must not consume incidental feature diameters.

## Important Code Areas

Read only the relevant files before changing code:

- `src/utils/shapeAnalysis.ts`
- `src/utils/shapeAnalysis.test.ts`
- `src/components/ViewerWorkspace.tsx`
- `src/utils/cadHandoff.ts`
- `src/utils/cadHandoff.test.ts` if it exists, otherwise add focused tests where local patterns indicate
- `src/utils/__testHelpers__/loadStepFixture.ts`
- `tests/fixtures/step/local_ps_220129_single_cavity_transfer_tool.expected.json`
- `src/utils/topology.ts` and `src/types/topology.ts` only if touching topology-backed classification

Protected code:

- Do not touch the protected explode algorithm in `src/components/CadViewer.tsx`.

## Acceptance Fixture Baseline

The transfer-tool fixture is the blocking acceptance fixture for this plan.

Expected import:

- File: `local_ps_220129_single_cavity_transfer_tool.stp`
- Body count: 6
- Assembly envelope: 100.00 x 100.00 x 126.07 mm
- Assembly volume: about 974.51 cm3

Expected selected-body envelopes:

| Part | Envelope |
|---|---|
| Part 1 | 100.00 x 100.00 x 49.93 mm |
| Part 2 | 100.00 x 100.00 x 46.60 mm |
| Part 3 | 100.00 x 100.00 x 29.02 mm |
| Part 4 | 100.00 x 100.00 x 50.00 mm |
| Part 5 | 39.45 x 39.47 x 30.70 mm |
| Part 6 | 18.22 x 18.22 x 32.12 mm |

Expected UI rule:

- Complex bodies must not show `Outer diameter` as a body dimension.
- If a body is not confidently round stock, the Inspector must show envelope dimensions as the primary selected-body dimensions.

## Implementation Strategy

### 1. Lock The Failure

Add fixture-level expectations that make the current problem explicit:

- The fixture has 6 bodies.
- Each body has the expected envelope.
- Bodies with complex envelopes must not be classified as whole-body cylinder only because they contain cylindrical faces.

The first useful test can fail before the classifier is fixed. That is acceptable; it proves the plan is aimed at the observed bug.

### 2. Make Shape Analysis Conservative

Update the `ShapeAnalysis` behavior so it does not overstate confidence.

The shape-analysis output should be able to distinguish:

- `cylinder`: whole body is a cylinder/round-stock-like body
- `hex`: whole body is hex-stock-like
- `box`: whole body is box/plate/block-like
- `complex`: body has features or mixed surfaces where stock dimensions should not be inferred

If changing the public type is too invasive in one slice, add a conservative confidence or reason field while keeping old consumers working. The end state must still prevent complex bodies from being labeled with stock diameter.

Guardrails:

- A large cylindrical face is not enough to classify the whole body as cylinder.
- A cylindrical bore, boss, pocket wall, or recessed feature is not stock diameter.
- For mesh fallback, compare detected cylindrical evidence against the whole bounding envelope before classifying as cylinder.
- For topology path, compare the dominant cylindrical face against body envelope and adjacent/supporting surfaces before treating it as stock diameter.
- Ambiguous geometry falls back to envelope/complex.

### 3. Fix Viewer Inspector Language

The Viewer Inspector should make the distinction obvious:

- Always show selected-body envelope X/Y/Z.
- For whole-body cylinders, additionally show `Outer diameter` and `Length`.
- For whole-body hexes, additionally show `AF` and `Length`.
- For complex bodies, show `Body type: Complex` or equivalent and do not show `Outer diameter`.
- Do not add a large explanatory in-app paragraph. Keep it compact and workstation-like.

The UI must remain dense, calm, and consistent with the existing Viewer.

### 4. Protect Quote Handoff

`cadResultToParts` must not use feature-derived diameter as a stock/body dimension.

Expected behavior:

- Round-stock bodies produce round stock dimensions only when classifier confidence says the whole body is round.
- Hex-stock bodies produce hex stock dimensions only when the whole body is hex.
- Complex bodies produce safe quote parts using envelope dimensions and a non-misleading shape label.

The transfer-tool fixture must not create quote parts that silently use the misleading current diameters as stock diameter.

### 5. Verify In The Real App

Use the actual local Viewer:

1. Start Vite.
2. Open `#/viewer`.
3. Load `local_ps_220129_single_cavity_transfer_tool.stp`.
4. Confirm 6 bodies.
5. Select each body.
6. Confirm each body shows the correct envelope.
7. Confirm complex bodies do not show misleading `Outer diameter`.
8. Move to quotation.
9. Confirm quote parts use safe dimensions.

Use `npm.cmd` on Windows for scripts.

## Done Definition

This plan is done when:

- Tests cover the transfer-tool fixture or an equivalent reduced reproduction.
- The Viewer no longer mislabels feature diameters as body diameters.
- Existing true cylinder and true hex fixtures still show the expected stock dimensions.
- Quote handoff no longer consumes feature diameter as stock diameter.
- Browser verification against the real app passes.
- `npm.cmd run build` passes.

## Deferred Until This Passes

- Machine capability DB
- Tooling DB
- Process planner
- Cycle-time estimator
- DFM expansion
- PMI/tolerance extraction
- Historical job intelligence
- Similarity index
- Calibration dashboard
- Parasolid/IGES/SolidWorks/CATIA support
