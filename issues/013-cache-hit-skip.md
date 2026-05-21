# 013 — STEP SHA-256 cache key + hit-skip path

**Type:** AFK
Status: done
Completed in: c958d83

## What to build

Compute SHA-256 of incoming STEP bytes during import. Key the geometry cache (#012) by `sha256 + occtOptionsDigest`. On hit, skip tessellation entirely: return cached mesh data + classification result. On miss, run full import and write cache.

Integration: extend `src/context/CadContext.tsx` to consult the cache before invoking the worker. Add a "Cache hit" / "Cache miss" indicator to the dev UI for verification.

## Acceptance criteria

- [x] Second import of the same STEP file completes in under 500ms (measured wall-clock)
- [x] Changing occt-import options invalidates cache
- [x] Cache hit ratio visible in dev menu
- [x] No staleness bug: deleting a cache row triggers re-import on next load
- [x] Cache survives app restart

## Blocked by

- #012 (cache schema)
