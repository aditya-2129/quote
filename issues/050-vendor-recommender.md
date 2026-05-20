# 050 — Vendor recommender

**Type:** HITL
Status: ready-for-human

## What to build

Match an incoming part's requirements against a database of shop capabilities to suggest "best vendor to run this job." Inputs: feature graph + tolerances + material + lead time. Output: ranked vendor list with capability match score.

This is useful for shops with multiple facilities OR for marketplace-style aggregator deployments.

HITL: depends on whether the product is for a single shop or a marketplace. Big scope difference.

## Acceptance criteria

- [ ] Vendor capability schema designed
- [ ] Ranking algorithm documented (capability match + lead time + cost)
- [ ] LLM optional layer surfaces reasoning ("recommend because they have a 5-axis mill and stock the material")
- [ ] At least 3 vendors seeded for testing
- [ ] Confidence score per recommendation

## Blocked by

None — can start immediately, but should not start until shop vs marketplace product decision is made.
