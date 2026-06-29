## Why

On iPad / iPhone Safari, fetching certain source-explanation booklets **persistently fails** — both the bulk 「全部下載供離線」 (stalls at e.g. 「檢查 3/46 · 本次下載 0」 after the owner cleared browsing data, so nothing is cached and every booklet must hit the network) and the single 「看原始詳解 PDF」 (shows 「網路連線失敗」 and forces the owner to the official Drive link). The failure is per-booklet and deterministic, not transient.

Root cause (confirmed with a Codex consult + a live probe): the app fetched each booklet as **one whole-file `fetch()`**, and iOS / WebKit drops a large cross-origin response mid-flight ("the network connection was lost", surfaced to JS as a `TypeError`) — even though `curl` and desktop browsers succeed on the exact same URL. The failing booklets are simply the larger ones (the one in the owner's screenshot, 113-1-醫學一, is **~23 MB**; the corpus runs up to **123 MB**). It throws at the `fetch()` stage, before any blob/cache handling, which is why the official-link fallback was the only thing that worked.

A live `Range` probe confirms the Drive REST endpoint serves `206 Partial Content` with `Content-Range` (Range is honored), so we can sidestep WebKit's large-response cliff without changing where the bytes come from.

## What Changes

`apps/neurons-tw/src/platform/driveFetch.ts` (`fetchBooklet`) now fetches each booklet in **4 MiB `Range` slices** instead of one whole-file request, and streams the slices into one body:

- The first slice doubles as a probe. `206` + a parseable `Content-Range` total → stream slice 0, then pull slices 1..N (each request ≤ 4 MiB, so WebKit never sees a large in-flight response). The assembled body streams to the Cache API (bulk) / blob (single-open) via back-pressure — one 4 MiB request at a time — so the whole PDF is never held in JS memory.
- A small file that fits in the first slice, or a server that ignores `Range` (`200`), takes the existing single-shot path (no regression).
- Each request gets an **AbortController timeout** (guards an indefinitely-hung request) and retries transient 5xx / network errors (incl. the iOS network-lost `TypeError`) with backoff. Default retries 2 → 3.
- 403/429 (quota), 404 (link-rot), offline, and missing-key handling are unchanged; the official-Drive-link fallback on any failure is unchanged.

No call-site changes: both the bulk download (`OfflineAllPdfControl`) and on-demand open (`platform/index.ts`) get the chunked fetch for free, since `fetchBooklet`'s contract (returns a `DriveFetchResult` with a `Response`) is preserved.

Deliberately NOT in this change (Codex's "fuller rework", deferred): a Service Worker serving a virtual same-origin PDF URL with separate per-chunk cache entries + a resumable manifest. The single-shot streaming-into-one-Cache-entry approach fixes the reported failure (the large in-flight `fetch()`) with far less surface area; the viewer still materializes a blob for very large files, which is a separate, lower-severity concern.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: booklet bytes are fetched in bounded `Range` slices (not one whole-file request), so large booklets fetch reliably on iOS / mobile Safari; the bytes still flow publisher-Drive → the player's browser directly (the zero-app-hosted-bytes invariant is preserved), each request has a timeout + retry, and an ignored-`Range`/small-file path keeps the single-shot behavior.

## Impact

- **Modified**: `apps/neurons-tw/src/platform/driveFetch.ts` (single file) + its test `apps/neurons-tw/src/__tests__/drive-fetch.test.ts` (+3 chunked-assembly tests).
- **No** byte-store / call-site / Dexie / R2 / sync change, **no** new dependency, **no** new app-hosted bytes.
- **Verification**: typecheck clean; `drive-fetch` (13) + `local-pdf-provenance` (10) tests green; a live `curl` Range probe against the failing booklet (113-1-醫學一) returns `206` + `Content-Range: …/24135038` (Range honored, total parsed). The iPad large-response failure itself is owner-verified on the real device (desktop cannot reproduce it).
