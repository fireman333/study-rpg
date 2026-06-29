## Why

The HelpMenu「原始詳解 PDF → 全部下載供離線」action behaved unpredictably on iOS, and the owner could not tell *why*: "sometimes it re-downloads from scratch even though some files are already cached; other times it quickly skips files (seen on iPad)."

Root cause (confirmed by reading the code + a Codex consult):

- The action caches **44–46 booklet PDFs totalling ~250 MB–1.5 GB** (largest single = **123 MB**) into the **Cache API**, but **`navigator.storage.persist()` is never called**. iOS WebKit evicts non-persisted storage **whole-origin** (7-day ITP / storage pressure), so the same button genuinely behaves differently between sessions and devices (an iPhone with less free space evicts / quota-fails far more than an iPad).
- The progress text was the **loop index** (`下載中 i/46`), so a fast cache-hit *skip* and a slow real *re-fetch* looked identical — the player perceived "re-download everything" vs "quickly skip" purely from speed, with no signal of what was happening.
- A `QuotaExceededError` on a large booklet was swallowed into a generic `失敗` count, so the big PDFs appeared to "fail forever" with no explanation (the real cause — out of space — was invisible). Codex's correction: the observed "partial cache" is better explained by *prior runs only partially succeeding* (big PDFs quota-failing) + on-demand caching of individually-opened booklets, not random partial eviction.

This is an iOS-Safari durability + observability bug; it cannot be reproduced on desktop Chrome, so the fix is verified on real devices.

## What Changes

All in `apps/neurons-tw/src/components/OfflineAllPdfControl.tsx` (no byte-store / driveFetch interface change, no schema change, no sync change):

- **Request persistent storage** (`navigator.storage.persist()`, best-effort, user-gesture-triggered) before the bulk fetch, to reduce whole-origin eviction. No persistence guarantee is claimed (consistent with the existing byte-store eviction stance).
- **Honest progress**: tally `本次下載 / 略過已快取 / 失敗` as three separate counts instead of a loop index, so the player can tell skipping from re-fetching.
- **Classify out-of-space distinctly**: catch `QuotaExceededError` and surface a non-blocking 「儲存空間不足」 message (with the remaining-space estimate when available) separate from a network failure.
- **Verify-after-write**: after caching a booklet, confirm it actually landed (`byteStore.get`); an unverified write is counted as a failure rather than silently treated as success (guards iOS's "no error thrown but nothing persisted").
- Keep the download **sequential** (Codex: do not add concurrency for ~1 GB of PDFs on mobile Safari).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: the offline-all action requests best-effort persistent storage, reports per-booklet outcome (downloaded vs skipped-cached vs failed), classifies out-of-space failures distinctly from network failures, and verifies each cache write landed.

## Impact

- **Modified**: `apps/neurons-tw/src/components/OfflineAllPdfControl.tsx` (single file).
- **No** byte-store / driveFetch API change, **no** Dexie version bump, **no** R2 / sync change, **no** new dependency.
- **Verification**: typecheck + `drive-fetch` / `local-pdf-provenance` unit tests (20) stay green; Chrome MCP render smoke (component renders, no console error, storage APIs callable). The iOS eviction/quota behavior is owner-verified on a real iPhone + iPad (desktop cannot reproduce it).
