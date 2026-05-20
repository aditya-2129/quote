# 024 — Fillet detection module

**Type:** AFK
Status: ready-for-agent

## What to build

Implement `src/utils/features/fillets.ts`. Identify fillets: cylindrical (or toroidal) faces tangent to two adjacent faces along their edges. Output: radius, length, adjacent face IDs, convex/concave.

## Acceptance criteria

- [ ] Detects constant-radius fillets on fixtures
- [ ] Radius extracted to ±0.01 mm
- [ ] Distinguishes convex (rounds) from concave (fillets)
- [ ] Variable-radius fillets either detected or explicitly classified as `unknown`
- [ ] No false positives on intentional curved surfaces

## Blocked by

- #019 (JS topology model)
