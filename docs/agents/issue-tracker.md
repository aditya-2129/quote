# Issue Tracker

Primary issues for this repo live in GitHub Issues:

- Repository: `https://github.com/aditya-2129/quote`
- Remote name: `origin`

## Publishing Work

When a skill says "publish to the issue tracker", use GitHub Issues if the GitHub CLI is available and authenticated.

Recommended conventions:

- One issue per independently shippable vertical slice.
- Include user-visible behavior, implementation notes, acceptance criteria, and verification.
- Link related docs such as `CONTEXT.md`, `docs/architecture.md`, and ADRs when relevant.

## Drafting Work Locally

Use local markdown when planning is not ready to publish to GitHub Issues yet.

For active roadmap-level work, use the top-level planning folders:

- Plans: `plans/<roadmap-or-feature>.md`
- Issues: `issues/<NNN>-<slug>.md`
- Index: `issues/README.md`
- Triage state: a `Status:` line near the top of each issue file

For scratch experiments that are not part of the active roadmap, use `.scratch/<feature-slug>/`.

Local drafts can later be copied into GitHub Issues.

## Current Local Roadmap

The enterprise CAD intelligence roadmap is tracked locally until it is ready to publish:

- Plan: `plans/enterprise-cad-roadmap.md`
- Local issue index: `issues/README.md`
- Issue status mapping: `AFK` -> `ready-for-agent`, `HITL` -> `ready-for-human`

## Fetching Work

When the user references a GitHub issue number, fetch it from GitHub if tooling is available. When the user references a local path, read that markdown file directly.
