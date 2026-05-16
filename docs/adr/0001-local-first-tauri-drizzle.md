# ADR 0001: Local-First Tauri App With Drizzle SQLite

## Status

Accepted

## Context

The quote app needs to handle customer CAD, rates, RFQs, and quote state on a desktop machine. The current project uses Tauri 2, React, and Drizzle over SQLite through `@tauri-apps/plugin-sql`.

## Decision

Keep the product local-first:

- React owns product interaction and business workflows.
- SQLite is the durable local store.
- Drizzle schemas and query helpers are the application data contract.
- Tauri/Rust is limited to shell, OS, window, and plugin integration.

## Consequences

- Quote save/export work should bridge the current React quote state into normalized Drizzle tables.
- Business logic should stay in TypeScript utilities rather than Rust commands.
- UI-only Vite mode remains useful for layout work, but full persistence must be tested in Tauri mode.
- Schema changes require updates to `src/db/schema/`, query helpers, seed data when relevant, and migrations.
