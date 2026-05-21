# 024 — Fillet detection module

**Type:** AFK
Status: implementation-verified

## What to build

Implement `src/utils/features/fillets.ts`. Identify fillets: cylindrical (or toroidal) faces tangent to two adjacent faces along their edges. Output: radius, length, adjacent face IDs, convex/concave.

## Acceptance criteria

- [x] Detects constant-radius fillets on fixtures
- [x] Radius extracted to ±0.01 mm
- [x] Distinguishes convex (rounds) from concave (fillets)
- [x] Variable-radius fillets either detected or explicitly classified as `unknown` (implemented as `variable` radius detection for cone surfaces)
- [x] No false positives on intentional curved surfaces
- [ ] 10+ real fixture parts
  > [!NOTE]
  > Verification against 10+ real fixture parts is deferred to a later integration slice.

## Blocked by

- #019 (JS topology model)

## Implementation notes

- **Convex vs Concave Logic**: Distinguishes convex rounds from concave fillets using a precise signed-distance heuristic on the adjacent plane outward normals. For a fillet/round with cylinder axis origin $\vec{o}_{axis}$ and adjacent planes with origins $\vec{o}_i$ and outward normals $\vec{n}_i$: we calculate the average of $(\vec{o}_i - \vec{o}_{axis}) \cdot \vec{n}_i$. A negative average indicates that the cylinder center lies in empty space (inside corner/concave), while a positive average indicates that the center lies in the solid material (outside corner/convex).
- **Variable-Radius Fillets**: Conical fillets (which represent linear variable-radius fillets) are successfully recognized, and their radius is classified as `'variable'`.
- **Toroidal Fillets**: Toroidal corners are recognized, with the minor radius extracted as the fillet radius and the major axis sweep length computed as length.
- **Negative Cases**: Full cylindrical/conical features (like holes/bosses) are rejected by validating that the face's `angularSpan` is a partial revolution (typically $\le 1.05 \pi$ radians).

## Verification

The following commands were run and verified:
- **Unit Tests**: `npx.cmd vitest run src/utils/features/fillets.test.ts` passed 7/7 tests (including performance test for 50 fillets under 100ms, which took 3ms).
- **Linter**: `npm run lint` completed cleanly without any warnings or errors.
- **Build check**: `npm run build` completed successfully without any compilation errors.
