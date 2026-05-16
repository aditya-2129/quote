# Domain Docs

This is a single-context repo.

## Read Order

Before non-trivial code work:

1. Read `CONTEXT.md` for domain terms and product rules.
2. Read `docs/architecture.md` for code boundaries.
3. Read relevant ADRs in `docs/adr/`.
4. Read `docs/design-system.md` before UI work.
5. Read `TODO.md` for known unfinished surfaces.

## Consumer Rules

- Use the vocabulary from `CONTEXT.md` in issue titles, tests, docs, and code comments.
- If a concept is not in `CONTEXT.md`, avoid inventing new language casually. Add a short note or update the context when the user confirms the term.
- Surface ADR conflicts explicitly instead of silently overriding them.
- Treat `AGENTS.MD` as the root behavioral contract for coding agents.

## Missing Docs

If a referenced doc is absent, proceed with the best available context. Do not block work only to create documentation unless the user asked for project setup or the missing doc is necessary to avoid a bad change.
