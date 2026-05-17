# US-002: Quote Detail Save/Load UI

## Story
As a quoting user, I want the quote detail page to load saved quote data and show save state so that I can trust the workstation as the source of truth.

## Scope
- Wire `QuoteDetailPage` and `QuoteStateContext` to the quote workflow service.
- Add loading, saving, saved, and error states for quote persistence.
- Keep CAD handoff behavior for unsaved drafts.

## Acceptance Criteria
- Project, RFQ ref, customer text, commercial values, notes, and parts survive refresh after Save.
- Opening a saved quote id hydrates the quote state from DB.
- Opening a CAD handoff quote with no DB record still shows the unsaved draft.
- Save button is disabled or shows progress while saving.
- User-visible errors are shown if save/load fails.

## Notes
- Do not create a new Project table for v1.
- Project field remains labeled `Project` in UI.
