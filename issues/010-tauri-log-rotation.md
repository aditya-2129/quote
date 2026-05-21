# 010 — tauri-plugin-log to disk with rotation

**Type:** AFK
Status: done
Completed in: f577d0d

## What to build

Configure `tauri-plugin-log` (already a Cargo dependency) to write to disk under the Tauri app-data dir with size-based rotation (10 MB per file, 5 files retained). Expose a "open logs folder" action in the app's debug menu.

## Acceptance criteria

- [x] Logs persist between app launches under app-data dir
- [x] Rotation kicks in at configured size
- [x] Old log files cleaned up beyond retention count
- [x] "Open logs folder" menu item works on Windows
- [x] Log format includes timestamp + level + module
- [x] No log spam at INFO level during idle

## Blocked by

None — can start immediately.
