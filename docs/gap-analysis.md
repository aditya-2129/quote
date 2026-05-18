# Gap Analysis — Tauri Quote vs. Kaivalya Reference

Comparison against the Kaivalya Engineering "Engineering Command Center" quotation form (`http://localhost:4000/quotations-draft/new`) captured 2026-05-18.

This file now keeps only gaps that are needed, planned, or still pending review.

## Workflow & users

- **PO logging / Confirmed Orders** — **Need: yes, next phase.** Reference has a dedicated stage after a quote is won; Tauri does not yet. This should be implemented in the next phase as the post-win order/PO tracking flow.

## Quote header fields

- **Date received** + **expected delivery date** — **Need: yes, next RFQ/inquiry phase.** Reference shows both as required fields. Tauri should add them when inquiry/RFQ handling is implemented in the next phase, rather than treating them as standalone quote-form fields now.

## Costing structure

- **Fixed extra-cost line items** — **Need: yes, ASAP.** Reference has named categories: Stuffing & Packing, Shipping/Delivery, Design & Engineering fee, Final Assembly & Testing. Tauri removed fixed overheads, but these quote-level extra costs should be added back urgently.
