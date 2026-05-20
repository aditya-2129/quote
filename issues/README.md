# Issues — Path to Enterprise-Grade CAD Intelligence

Local issue tracker for the roadmap in `plans/enterprise-cad-roadmap.md`.

50 vertical-slice issues, ordered by dependency. Each file is one issue.

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
| 8 | 045–050 | AI layer (LAST, never first) |

## HITL vs AFK summary

**HITL (13):** 002, 007, 009, 015, 031, 032, 033, 034, 044, 045, 046, 049, 050
**AFK (37):** everything else

## Completed

| Issue | Commit | Notes |
|---|---|---|
| 001 | c9d116b | Vitest setup, alias sanity tests, lint baseline cleaned |
| 002 | daa209c | STEP fixture suite with 25 curated fixtures, expected metadata, provenance, and visual review |

## Suggested execution order

Phase 0 fully before Phase 1.
Phase 1 fully before Phase 2.
Phase 2 spike (#015) before any other Phase 2 work.
Phases 3 and 5 can partially parallelize after Phase 2 lands.
Phase 4 needs domain expert availability (HITL-heavy).
Phase 8 strictly last — AI without deterministic intelligence underneath is a demo.

## Total estimated effort

15–24 months solo, 6–12 months with one CAD/manufacturing engineer hire.
