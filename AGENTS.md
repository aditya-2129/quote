# Agent Context

## Project: Manufacturing Quote App
CAD-driven tool for generating manufacturing quotes from STEP files.

## Stack
- **Frontend**: React 19, React Router 7, Tailwind 4, Three.js (CAD)
- **Runtime**: Tauri 2 (Rust)
- **Storage**: Drizzle ORM (SQLite via Tauri Plugin) + localStorage fallback

## Core Commands
- `npm run tauri:dev`: App dev
- `npm run db:generate`: Schema update
- `npm run db:studio`: DB UI

## State of Project
- **CAD**: Import/Viewing is functional (`occt-import-js`).
- **UI**: High-fidelity layout exists, but many buttons/fields are static (see `TODO.md`).
- **Data**: Moving from `localStorage` to `Drizzle` SQL.

## Rules
- **Logic**: Use `src/utils/` for geometry/quote math.
- **UI**: Keep components in `src/components/`, strictly typed.
- **DB**: Sync `src/db/schema/` with Drizzle.
- **Rust**: Only for system/window logic in `src-tauri/`.
