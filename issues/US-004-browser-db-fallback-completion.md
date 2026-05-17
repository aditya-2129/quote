# US-004: Browser DB Fallback Completion

## Story
As a developer using the in-app browser, I want localhost pages to work without Tauri SQL so that Codex can inspect and test DB-backed flows.

## Scope
- Extend the dev-only browser fallback to cover parts, stock, geometry, operations, DFM issues, and quote events.
- Keep fallback removable and isolated to browser development mode.

## Acceptance Criteria
- Browser fallback supports the same query helpers used by quote persistence.
- Quote, RFQ, analytics, and list pages do not log Tauri SQL `invoke` errors in the browser.
- Fallback data persists in localStorage during dev browser sessions.
- Native Tauri app continues using SQLite.

## Notes
- Preserve the existing browser fallback gate.
- Do not introduce fallback behavior in production/native runtime.
