# 009 - Local crash diagnostics export

**Type:** AFK
Status: ready-for-agent

## What to build

Replace the original remote crash-reporting idea with a local-only diagnostics flow that fits the project scope: single-user Tauri desktop app, no SaaS, no shared backend, no upload service.

Capture enough information to help debug renderer crashes and Rust panics without sending anything off-machine. Reports should be written under the Tauri app-data dir and be easy for the user to copy/export manually.

Scope:
- Renderer-side: extend the `ErrorBoundary` (#008) diagnostics path and add global `error` / `unhandledrejection` listeners.
- Rust-side: install a panic hook in `src-tauri/src/lib.rs` that writes a local crash report.
- Storage: write JSON crash report files under app-data, separate from normal rotating logs (#010).
- UI: expose a simple way to open the crash reports folder or copy the latest crash report from the app's debug/settings surface.

No network transport, no Sentry/GlitchTip, no S3, no source-map upload pipeline.

## Acceptance criteria

- [ ] Local-only decision documented in `docs/adr/` with the reason remote crash reporting was rejected
- [ ] Renderer `ErrorBoundary` crashes create a structured local JSON crash report
- [ ] Global renderer `error` and `unhandledrejection` events create structured local JSON crash reports
- [ ] Rust panics create a structured local JSON crash report under app-data
- [ ] Report schema includes timestamp, app version, platform, route/window context, error message, stack/backtrace when available, and source (`renderer-boundary`, `renderer-global`, `rust-panic`)
- [ ] PII redaction documented and enforced: no quote contents, no customer names, no CAD file contents, no full STEP bytes
- [ ] User can open the crash reports folder or copy/export the latest report from an existing debug/settings surface
- [ ] Manual verification covers one renderer crash and one simulated Rust-side panic/error path

## Blocked by

- #008 (ErrorBoundary provides the renderer hook)
