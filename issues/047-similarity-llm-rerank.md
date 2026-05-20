# 047 — Geometry similarity + LLM rerank

**Type:** AFK
Status: ready-for-agent

## What to build

Layer LLM reranking on top of the geometry similarity index (#040). Vector index returns top-50 candidates; LLM compares query part vs each candidate using feature descriptions + dimensions + material, returns reranked top-5 with reasoning.

Module: `src/ai/similarityRerank.ts`.

## Acceptance criteria

- [ ] Top-5 precision improves over raw vector index on the same 20-query benchmark
- [ ] Reasoning surfaced in UI ("Similar because: 8 M6 holes, same aluminum, similar pocket pattern")
- [ ] Reranking latency under 3s per query
- [ ] Falls back to raw vector index if LLM unavailable
- [ ] No invented features (LLM grounded in actual feature graph data)

## Blocked by

- #040 (vector index)
