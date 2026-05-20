# Issues — Path to Enterprise-Grade CAD Intelligence

Local issue tracker for the roadmap in `plans/enterprise-cad-roadmap.md`.

44 vertical-slice issues, ordered by dependency. Each file is one issue.

**Scope reminder:** this is a single-user, locally-installed Tauri desktop app. No web build, no SaaS, no multi-user server, no shared backend. Every issue must run inside one user's Tauri process with local SQLite + local filesystem only. Anything implying a remote service, multi-tenant model, or browser deployment is out of scope by default.

AI work is tracked in a separate plan (`plans/ai-roadmap.md`, to be written) and is intentionally out of scope here — the moat is deterministic geometric intelligence first.

## Phase index

| Phase | Range | Theme |
|---|---|---|
| 0 | 001–010 | Foundation hygiene: tests, fixtures, edgeCount fix, viewer split, observability |
| 1 | 011–014 | Async (Web Worker) + geometry caching |
| 2 | 015–020 | Rust BREP topology layer (single highest-leverage upgrade) |
| 3 | 021–030 | Feature recognition + accessibility + feature-based costing |
| 4 | 031–035 | Manufacturing intelligence: machines, tools, process planner, cycle time, DFM |
| 5 | 036–038 | PMI / tolerance / surface finish extraction and costing |
| 6 | 039–041 | Historical job data + similarity index + calibration dashboard |
| 7 | 042–044 | Multi-format CAD support |

## HITL vs AFK summary

**HITL (7):** 002, 015, 031, 032, 033, 034, 044
**AFK (37):** everything else

## Completed

| Issue | Commit | Notes |
|---|---|---|
| 001 | c9d116b | Vitest setup, alias sanity tests, lint baseline cleaned |
| 002 | daa209c | STEP fixture suite with 25 curated fixtures, expected metadata, provenance, and visual review |
| 003 | 8d3658f | meshFingerprint golden tests against the full fixture suite + node-friendly OCCT loader helper |
| 004 | 8a2db7e | shapeAnalysis golden tests across 16 single-body fixtures; added self_hex_standoff and self_filleted_cylinder fixtures; locked in self_hex_bar→box as documented tessellation limitation |
| 005 | 0a71c94 | quoteCosting golden tests — 103 tests covering all 20 public functions; one LIMITATION comment locking in hardcoded finishingCost=0 in calculateQuoteRollup |
| 006 | 532cbaa | Dropped fabricated edgeCount field from types, schema, serialization, and 7 call sites; added migration 0010_drop_edge_count.sql |
| 007 | 456237e | Split CadViewer into focused submodules, preserved public API/protected explode logic, and visually verified all 6 local STEP fixtures |
| 008 | cad5a50 | Added app root ErrorBoundary with reload, copy diagnostics, and plugin-log best-effort logging |
| 009 | f5d005c | Added local-only crash diagnostics for renderer crashes, global renderer errors, and Rust panic reports |

## Suggested execution order

Phase 0 fully before Phase 1.
Phase 1 fully before Phase 2.
Phase 2 spike (#015) before any other Phase 2 work.
Phases 3 and 5 can partially parallelize after Phase 2 lands.
Phase 4 needs domain expert availability (HITL-heavy).
AI is tracked in a separate plan and never enters before the deterministic intelligence in Phases 0–7 lands.

## Total estimated effort

15–24 months solo, 6–12 months with one CAD/manufacturing engineer hire.
