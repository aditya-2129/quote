# US-005: DFM, Notes, And History Events

## Story
As a quoting user, I want DFM decisions, notes, and history to persist so that review state is visible after refresh.

## Scope
- Persist DFM accept/dismiss state.
- Persist quote notes.
- Replace hardcoded history examples with quote events and revision history.

## Acceptance Criteria
- Accepting a DFM issue marks it dismissed in DB.
- Notes tab saves to the quote.
- History tab displays saved quote events.
- DFM state, notes, and history survive refresh.

## Notes
- Actionable Apply Fix buttons may remain lightweight in v1 unless already wired cleanly.
