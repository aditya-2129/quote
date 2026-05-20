# 046 — Quote explanation LLM narrative

**Type:** HITL
Status: ready-for-human

## What to build

LLM-backed narrative generator that reads the deterministic quote breakdown and writes a customer-friendly explanation:

- "Why does this cost $X" paragraph
- "Major cost drivers" bullet list
- "Lead time rationale" paragraph
- Optional: tone preset (formal / friendly / technical)

Module: `src/ai/quoteNarrative.ts`. UI: in quote detail, "Generate explanation" button → editable draft → optional include in PDF export.

HITL: tone choices and the "what's customer-visible" decision need product review.

## Acceptance criteria

- [ ] Narrative grounded in the deterministic cost breakdown (no invented numbers)
- [ ] All cited numbers cross-checkable against the quote
- [ ] Editable before export
- [ ] PDF export includes narrative when toggled on
- [ ] Tone presets work as documented

## Blocked by

None — can start immediately, but should not start until Phase 7 done.
