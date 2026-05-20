# 043 — IGES import support

**Type:** AFK
Status: ready-for-agent

## What to build

Extend the Rust import module to read IGES (`.igs`, `.iges`) files. OCCT has solid IGES support; topology extraction should plug in similarly to STEP.

## Acceptance criteria

- [ ] `.igs`/`.iges` files importable
- [ ] Topology extraction produces face/edge graph
- [ ] Surface classification works (cylinders, planes detected)
- [ ] Known IGES quirks (trimmed surfaces, missing topology) handled gracefully
- [ ] UI accepts IGES extensions in file dialog

## Blocked by

- #016 (Rust topology module)
