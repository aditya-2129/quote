# 008 — Add ErrorBoundary at app root

**Type:** AFK
Status: done
Completed in: a123b03

## What to build

Add a React `ErrorBoundary` wrapping the app shell in `src/App.tsx`. On error, show a fallback UI with the error message, a "reload" button, and a "copy diagnostic info" action (file path, stack, last route). The fallback must respect the existing design system in `src/styles/index.css`.

## Acceptance criteria

- [x] Thrown errors in any route surface the fallback UI instead of a blank screen
- [x] Reload button restores the app cleanly
- [x] Copy diagnostic action puts a structured JSON blob on clipboard
- [x] Error logged via `tauri-plugin-log` if available
- [x] Manual test: throw error in a route → fallback appears

## Blocked by

None — can start immediately.
