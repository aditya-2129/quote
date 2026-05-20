# 006 — Fix fabricated edgeCount field

**Type:** AFK
Status: ready-for-agent

## What to build

`src/utils/cad.ts:278` currently sets `edgeCount: Math.round(faceCount * 1.5)` — a fabricated approximation. Audit all consumers of `StepGeometryInput.edgeCount` and `GeometrySummary.edgeCount`. Two acceptable resolutions:

1. **Drop the field entirely** if no consumer needs it (preferred — simpler).
2. **Compute real edge count** from triangle adjacency (build edge set, count unique pairs) if a consumer needs it.

Audit must cover: `src/utils/quoteCosting.ts`, `src/utils/pdfAssembly.ts`, `src/utils/export.ts`, any UI that displays geometry summary.

## Acceptance criteria

- [ ] Audit report committed (which consumers use the field)
- [ ] Either field removed OR replaced with real computation
- [ ] No remaining `* 1.5` magic number in cad.ts
- [ ] Existing tests pass (or are updated to reflect the new value)
- [ ] PDF export and UI rendering unchanged unless the field is consumer-facing

## Blocked by

None — can start immediately.
