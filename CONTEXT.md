# Domain Context

## Product

The app helps a manufacturing shop turn customer CAD into a quote. The core loop is:

1. Import a STEP file.
2. Inspect bodies in the CAD viewer.
3. Group identical geometry into quote parts.
4. Configure material, stock, machining operations, finishing, margin, tax, and assembly quantity.
5. Review cost rollup, quantity breaks, lead time, and DFM issues.
6. Save, export, or send the quotation.

## Core Terms

- RFQ: Request for quote. Commercial context from a customer, including customer name, project, and reference.
- Quote: Priced response for an RFQ. A quote can have revisions.
- Assembly: The imported CAD model as a whole.
- Body or mesh: A CAD body imported from OCCT and rendered in Three.js.
- Part: A quote row. One part can represent multiple identical bodies through `perAssembly` and `meshIds`.
- Handoff: Conversion from a `CadImportResult` in the viewer into quote `Part[]`.
- Stock: Raw material form and dimensions used to manufacture a part.
- Operation: A manufacturing step with machine, setup minutes, cycle minutes, and optional rate override.
- DFM issue: Design-for-manufacturing warning, error, or note that affects manufacturability, cost, or risk.
- Quantity break: Unit price comparison for multiple assembly quantities.
- Lead time: Estimated working-day timeline derived from queue, machine minutes, finishing, and shipping.

## Domain Rules

- CAD geometry is measured in millimeters.
- Net part mass should be derived from CAD volume and material density when geometry exists.
- Stock cost should use stock mass unless the part is marked as stocked or purchased.
- Identical-body grouping should preserve a single editable quote row for duplicate bodies.
- Per-quote material and machine rate overrides are valid, but changing material/stock shape/machine should clear the override.
- Quote math should stay deterministic and local-first.

## Current Open Product Edges

- Save/persistence of complete quote state is incomplete.
- Export PDF is implemented as a utility for older quote calculation types, but it is not wired to the current quote workspace model.
- Send/share, add part, row context menus, DFM fix/accept actions, notifications, rate card shortcuts, and some viewer settings remain unfinished.

## Language To Prefer

- Use "part" for user-facing quote rows.
- Use "body" or "mesh" only when referring to imported CAD/rendering internals.
- Use "quote workspace" for the `/quotes/:id` working screen.
- Use "viewer" for the `/viewer` CAD inspection screen.
