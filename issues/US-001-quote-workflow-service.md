# US-001: Quote Workflow Service

## Story
As a quoting user, I want the quote workbench to save and load a complete quote so that CAD-derived quote work survives refreshes and app restarts.

## Scope
- Build a save/load orchestration layer for RFQ, Quote, Parts, Stock, Geometry, Operations, DFM, and Events.
- First Save creates persistent records.
- Later Save updates existing records.
- Existing quote ids hydrate the quote workstation.

## Acceptance Criteria
- Saving an unsaved CAD-derived quote creates rows in `rfqs`, `quotes`, `parts`, `part_stock`, `part_geometry`, `part_operations`, and `quote_events` where relevant.
- Saving an existing quote updates the same quote instead of duplicating it.
- Loading an existing quote returns a complete editable draft for the quote page.
- Project maps to `rfqs.title`; `quotes.title` mirrors it.
- The protected CAD explode algorithm is not modified.

## Notes
- Prefer a service module above low-level query helpers.
- Keep low-level queries small and reusable.
