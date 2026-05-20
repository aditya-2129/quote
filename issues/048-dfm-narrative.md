# 048 — DFM narrative LLM

**Type:** AFK
Status: ready-for-agent

## What to build

LLM layer on top of the DFM engine (#035). Deterministic engine surfaces structured DFM issues; LLM writes a customer-facing email or report explaining each issue and suggesting design alternatives.

Module: `src/ai/dfmNarrative.ts`. UI: "Generate DFM feedback" button in part detail.

## Acceptance criteria

- [ ] Every narrative point traces back to a real DFM issue (no hallucinated problems)
- [ ] Suggested alternatives are realistic (not "machine from titanium" when the issue is wall thickness)
- [ ] Tone consistent with quote narrative (#046)
- [ ] Editable before export
- [ ] Empty DFM → empty narrative (don't invent problems)

## Blocked by

- #035 (DFM engine)
