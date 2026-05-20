# 049 — Estimator copilot

**Type:** HITL
Status: ready-for-human

## What to build

Conversational copilot that helps an estimator refine a quote:

- "Why is this so expensive?" → walks through cost breakdown
- "What if we relax this tolerance?" → re-runs costing with hypothetical changes
- "Compare to job #1234" → diff against a historical job
- "Suggest cost reductions" → grounded in DFM + similarity data

Module: `src/ai/estimatorCopilot.ts`. UI: chat panel in quote detail.

HITL: needs UX design (where the chat lives, conversation persistence, undo), prompt strategy, evaluation against real estimator workflows.

## Acceptance criteria

- [ ] Hypothetical changes never mutate the quote without explicit confirm
- [ ] All claims traceable to deterministic engine output
- [ ] Conversation history persists per quote
- [ ] Cost reductions suggested ≥1 reviewer agrees with on 20 trial quotes
- [ ] Token cost budgeted (no runaway loops)

## Blocked by

- #034 (cycle time estimator)
- #039 (job history)
