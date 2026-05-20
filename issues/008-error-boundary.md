# 008 — Add ErrorBoundary at app root

**Type:** AFK
Status: ready-for-agent

## What to build

Add a React `ErrorBoundary` wrapping the app shell in `src/App.tsx`. On error, show a fallback UI with the error message, a "reload" button, and a "copy diagnostic info" action (file path, stack, last route). The fallback must respect the existing design system in `src/styles/index.css`.

## Acceptance criteria

- [ ] Thrown errors in any route surface the fallback UI instead of a blank screen
- [ ] Reload button restores the app cleanly
- [ ] Copy diagnostic action puts a structured JSON blob on clipboard
- [ ] Error logged via `tauri-plugin-log` if available
- [ ] Manual test: throw error in a route → fallback appears

## Blocked by

None — can start immediately.
