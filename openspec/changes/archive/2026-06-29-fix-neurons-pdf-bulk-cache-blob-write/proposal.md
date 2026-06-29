## Why

After shipping the Range-chunked fetch (`fix-neurons-ipad-large-pdf-fetch`), the owner's iPad **still** can't bulk-download the larger booklets: 「全部下載供離線」 shows 「檢查 22/46 · 本次下載 0 · 略過已快取 21」 (21 small ones cached, every uncached one fails), and single 「看原始詳解 PDF」 on those still shows 「網路連線失敗」.

The cause is now **genuinely ambiguous and unreproducible** (I can't access the iPad, and Drive is rate-limiting my own test IP — the referrer-restricted key is shared by all players). A Codex consult surfaced three candidates I can't disambiguate from my side:
1. **CORS-masked Drive quota** — a `403/429/503` from Drive that lacks CORS headers surfaces to JS as a thrown `TypeError`, which the app reports as 「網路連線失敗」. So the failure may be the *shared-key / per-file download quota*, not a dropped connection (and the chunking's extra requests could even add quota pressure).
2. **WebKit `Cache.put` with a JS-constructed `ReadableStream` body** — the bulk path cached the chunked stream directly; WebKit can reject that (the single-open path buffers to a Blob first — the proven pattern).
3. **`Cache.put` rejects a `206`** per the Service Worker spec — defensive hardening.

There is **no cheap way to tell these apart without a signal from the real device**. So this change makes the failure self-describing.

## What Changes

- **`driveFetch.ts`**: every failure result now carries a short `detail` string — the underlying HTTP status (`HTTP 403`) or the thrown error's `name: message` (e.g. `TypeError: Load failed` for a CORS-masked quota vs `… network connection was lost` for a dropped response). The single-slice (small-file) success path is re-wrapped to a clean **`200`, `Content-Type: application/pdf`** response so a `206` never reaches `Cache.put` (#3).
- **`OfflineAllPdfControl.tsx`** (bulk download):
  - Cache via a **buffered Blob** (`await res.response.blob()` → `cache.put(new Response(blob))`) instead of putting the JS-constructed stream — the proven single-open pattern, which sidesteps the WebKit `Cache.put(stream)` risk (#2). The network is still chunked, so only one booklet is held in memory briefly.
  - **Surface the first failure's stage + cause** in the result UI: `抓取 <reason> <detail>` (fetch) / `組裝 <err>` (slice assembly) / `寫入快取 <err>` (cache write) / `寫入快取未落地` (write didn't persist) / `空間不足` (storage quota). So the owner's next screenshot pinpoints which of the three candidates is real, on the real device.

Deliberately **NOT** in this change: Drive-quota pacing (inter-request delay / `Retry-After` / cooldown) and any feature reframe. Those are the *targeted* fix — applied once the surfaced cause confirms quota, rather than guessed at now.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`: the offline-all bulk download caches each booklet via a buffered Blob with a clean `200` response (WebKit `Cache.put` compatibility), and surfaces the first failure's stage + underlying cause (HTTP status / thrown-error detail) so an unreproducible device failure can be diagnosed from the UI.

## Impact

- **Modified**: `apps/neurons-tw/src/platform/driveFetch.ts`, `apps/neurons-tw/src/components/OfflineAllPdfControl.tsx`.
- **No** byte-store / Dexie / R2 / sync / dependency change; bytes still flow Drive → browser directly.
- **Verification**: typecheck clean; `drive-fetch` (13) + `local-pdf-provenance` (10) tests green. The download itself could not be re-run live (Drive throttles the shared key from my test traffic); the fix is owner-verified on the real device, where the new 「首個失敗：…」 line reports the true cause.
