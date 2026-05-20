# 042 — Parasolid (.x_t) import support

**Type:** AFK
Status: ready-for-agent

## What to build

Extend the Rust import module (`src-tauri/src/cad/`) to read Parasolid `.x_t` and `.x_b` files. OCCT supports limited Parasolid import via the `XmlXCAFDrivers` (text format only) — for binary, consider the Parasolid Bodyshop SDK if licensed.

Validate Parasolid imports produce equivalent topology to STEP imports of the same part.

## Acceptance criteria

- [ ] `.x_t` files importable end-to-end
- [ ] Feature recognition outputs match STEP-imported equivalent on reference parts
- [ ] UI accepts `.x_t`/`.x_b` extensions in file dialog
- [ ] Clear error message if binary Parasolid is detected and not supported
- [ ] Licensing requirements documented in `docs/`

## Blocked by

- #016 (Rust topology module)
