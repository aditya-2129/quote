# 036 — Rust PMI extraction module

**Type:** AFK
Status: ready-for-agent

## What to build

Extend the Rust CAD module with `src-tauri/src/cad/pmi.rs`. Use OCCT's STEP AP242 PMI reader to extract:

- Dimensional tolerances (linear, angular)
- GD&T callouts (flatness, perpendicularity, parallelism, position, runout)
- Surface finish callouts (Ra values)
- Thread specifications
- Annotations referencing specific face IDs

Expose via Tauri command. Add to topology payload schema (versioned envelope from #018 covers this).

## Acceptance criteria

- [ ] PMI extraction works on AP242 sample files with annotations
- [ ] Each callout linked to the face(s) it applies to via stable face ID
- [ ] Tolerances parsed into numeric form (not just string text)
- [ ] Surface finish Ra extracted in microns
- [ ] Empty PMI (no annotations) returns clean empty list, not error

## Blocked by

- #016 (topology module)
