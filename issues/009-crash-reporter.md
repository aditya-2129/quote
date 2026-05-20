# 009 — Wire crash reporter (Sentry or alternative)

**Type:** HITL
Status: ready-for-human

## What to build

Pick a crash reporting backend and wire it into both the renderer and the Rust side. Options:

- **Sentry** — commercial, mature, $26/mo team plan
- **GlitchTip** — self-hosted Sentry-compatible, free
- **Roll our own** — Tauri command + S3 upload, cheapest but most work

HITL: requires decision on hosting/budget/privacy posture.

Once chosen, hook:
- Renderer-side: catch via `ErrorBoundary` (#008) + global `unhandledrejection` listener
- Rust-side: panic hook in `src-tauri/src/lib.rs`
- Source map upload in build pipeline

## Acceptance criteria

- [ ] Backend decision documented in `docs/adr/`
- [ ] Renderer errors reach the backend in dev and prod builds
- [ ] Rust panics reach the backend
- [ ] Source maps uploaded so stack traces are readable
- [ ] PII redaction documented (no quote contents, no customer names)

## Blocked by

- #008 (ErrorBoundary provides the renderer hook)
