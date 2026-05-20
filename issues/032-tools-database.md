# 032 — Tools DB schema + seed data

**Type:** HITL
Status: ready-for-human

## What to build

New `src/db/schema/tools.ts` with cutting tool inventory:

- Tool type (end mill, drill, tap, insert, reamer, …)
- Diameter, length, flute count, material (HSS, carbide, …)
- Feeds/speeds matrix per workpiece material (JSON)
- Tool life estimate
- Cost per tool + per resharpen

Settings UI for CRUD. Seed with a starter set of common tools.

HITL: feeds/speeds depend on real shop data. Generic textbook values lead to bad cycle time estimates.

## Acceptance criteria

- [ ] Schema migrated
- [ ] CRUD UI in settings
- [ ] At least 10 seeded tools covering typical operations
- [ ] Feeds/speeds editable per material
- [ ] Foreign-key safe: tool can be referenced by operations without delete cascades breaking history

## Blocked by

None — can start immediately.
