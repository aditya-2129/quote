# 010 — tauri-plugin-log to disk with rotation

**Type:** AFK
Status: ready-for-agent

## What to build

Configure `tauri-plugin-log` (already a Cargo dependency) to write to disk under the Tauri app-data dir with size-based rotation (10 MB per file, 5 files retained). Expose a "open logs folder" action in the app's debug menu.

## Acceptance criteria

- [ ] Logs persist between app launches under app-data dir
- [ ] Rotation kicks in at configured size
- [ ] Old log files cleaned up beyond retention count
- [ ] "Open logs folder" menu item works on Windows
- [ ] Log format includes timestamp + level + module
- [ ] No log spam at INFO level during idle

## Blocked by

None — can start immediately.
