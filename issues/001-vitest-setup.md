# 001 — Add vitest + test scripts to package.json

**Type:** AFK
Status: done
Completed in: c9d116b

## What to build

Stand up the test framework so subsequent issues can land tests. Add `vitest` and `@testing-library/react` as devDependencies. Wire `test`, `test:watch`, and `test:ci` scripts in `package.json`. Add `vitest.config.ts` at repo root configured for the existing TS + React + Vite setup. Ensure tests can import from `@utils/*` aliases the same way runtime code does.

## Acceptance criteria

- [x] `npm run test` exits 0 on an empty test suite
- [x] `npm run test:watch` runs in watch mode
- [x] A trivial sanity test (`expect(1 + 1).toBe(2)`) passes
- [x] Existing `npm run build` and `npm run lint` still pass
- [x] Vite path aliases (`@utils`, `@components`) resolve in tests

## Blocked by

None — can start immediately.
