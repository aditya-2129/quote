# Issue Tracker

Primary issues for this repo live in GitHub Issues:

- Repository: `https://github.com/aditya-2129/quote`
- Remote name: `origin`

## Publishing Work

When a skill says "publish to the issue tracker", use GitHub Issues if the GitHub CLI is available and authenticated.

Recommended conventions:

- One issue per independently shippable vertical slice.
- Include user-visible behavior, implementation notes, acceptance criteria, and verification.
- Link related docs such as `CONTEXT.md`, `docs/architecture.md`, ADRs, and `TODO.md` when relevant.

## Drafting Work Locally

For early planning or offline work, use local markdown under `.scratch/`:

- One feature per directory: `.scratch/<feature-slug>/`
- PRD: `.scratch/<feature-slug>/PRD.md`
- Issues: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Triage state: a `Status:` line near the top of each issue file

Local drafts can later be copied into GitHub Issues.

## Fetching Work

When the user references a GitHub issue number, fetch it from GitHub if tooling is available. When the user references a local path, read that markdown file directly.
