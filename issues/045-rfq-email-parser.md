# 045 — RFQ email parser

**Type:** HITL
Status: ready-for-human

## What to build

LLM-backed extractor that reads a customer RFQ email and produces a structured draft quote:

- Part list with quantities
- Material requested
- Lead time required
- Surface finish callouts in prose
- Tolerance hints in prose
- Customer contact info

Module: `src/ai/rfqParser.ts`. UI: paste email → preview structured draft → user confirms → quote draft created.

HITL: needs design on which LLM provider (Anthropic vs OpenAI), prompt engineering, evaluation set of real RFQs.

## Acceptance criteria

- [ ] Extracts part count + quantities correctly on 20+ sample RFQs
- [ ] Material identification ≥90% precision
- [ ] Hallucination rate (inventing parts not in email) ≤2%
- [ ] User always reviews before quote creation (no auto-create)
- [ ] PII handling documented

## Blocked by

None — can start immediately, but should not start until Phase 7 done.
