# ADR 0002: Local-Only Crash Diagnostics

## Status

Accepted

## Context

The app is a single-user, locally-installed Tauri desktop tool. The roadmap explicitly excludes SaaS, shared backends, and remote services by default. Crash diagnostics still matter because CAD import, local SQLite, and native Tauri code can fail in ways that are hard to reproduce.

Remote crash-reporting services such as Sentry, GlitchTip, or S3 uploads would introduce network transport, account setup, hosting/privacy decisions, and potential leakage of customer/CAD context. That conflicts with the current product scope.

## Decision

Crash diagnostics stay local-only.

- Renderer crashes write structured JSON reports under the Tauri app-data directory.
- Rust panics write structured JSON reports under the same local crash-report directory.
- The Settings screen exposes manual actions to open the crash report folder and copy the latest report.
- No crash report is uploaded automatically.
- No source maps are uploaded.

## Report Contents

Reports may include:

- timestamp
- app version
- platform
- current route/window context
- source (`renderer-boundary`, `renderer-global`, `rust-panic`)
- error message
- stack or backtrace when available

Reports must not include:

- quote contents
- customer names
- CAD file contents
- STEP bytes
- full local file payloads

Long encoded-looking strings and local path segments should be redacted before writing renderer reports.

## Consequences

Debugging requires the user to manually copy or share reports. This is intentional for the personal/local app scope. If the product scope later changes to team or hosted usage, remote crash reporting must be reconsidered in a new ADR.
