# US-007: End-To-End Verification

## Story
As the project owner, I want a focused verification checklist so that the persistence workflow can be tested consistently.

## Scope
- Document and run build, browser, and native DB checks.
- Verify the current quote page flow after implementation.

## Acceptance Criteria
- `npm.cmd run build` passes.
- Browser quote page loads without DB fallback errors.
- Save creates expected native DB rows.
- Refresh preserves project, RFQ ref, parts, material, operations, quantities, notes, and commercial fields.
- Manual verification notes are added to the issue or a short verification doc.

## Notes
- Use the existing in-app browser at `http://localhost:5173/#/quotes/q-mp8v2joi` when available.

## Verification Run
- `npm.cmd run build` passes.
- In-app browser quote page loads without Tauri SQL `invoke` or DB errors.
- Saving a browser quote creates a persisted quote route and saved state.
- Refreshing the saved quote preserves Customer, Project, RFQ ref, and saved status.
- `/quotes` shows the saved quote with a computed total.
- `/rfqs` shows the saved RFQ/project.
- `/analytics` counts the saved RFQ and draft quote.
