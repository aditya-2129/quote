# 044 — SolidWorks / CATIA import support

**Type:** HITL
Status: ready-for-human

## What to build

Add native SolidWorks (`.sldprt`) and CATIA (`.CATPart`) import. Requires either:

- Commercial converter (Spatial 3D InterOp, Tech Soft 3D HOOPS Exchange) — license cost $$$
- Server-side conversion via a cloud service
- Customer-side STEP export workflow (cheapest, worst UX)

HITL: format support strategy needs a commercial/licensing decision before engineering work.

## Acceptance criteria

- [ ] Strategy chosen and documented in `docs/adr/`
- [ ] If commercial converter: integration complete, license terms documented
- [ ] If customer-side: clear UX flow for "export as STEP from your CAD tool"
- [ ] Imported parts produce equivalent feature graphs to STEP imports

## Blocked by

- #016 (Rust topology module for any native format)
