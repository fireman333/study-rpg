## Why

The 原始詳解 PDF download (single 「看原始詳解 PDF」 + bulk 「全部下載供離線」) fails on the owner's iPad and intermittently elsewhere: the Drive `fetch()` throws and the UI shows 「網路連線失敗」. Root cause is now **confirmed**: Google's edge serves a `403` "Sorry..." abuse interstitial (`text/html`, **no `access-control-*` headers**) when one egress IP sends too many Drive/media requests in a burst; a CORS fetch sees no `Access-Control-Allow-Origin` and throws `TypeError: Load failed`. Evidence: a direct `curl` of the exact URL returns that exact CORS-less 403 HTML; the GCP project Drive quota is healthy (Queries/min 12,000 at 0.08%); a non-Google cross-origin probe returns `200`; and switching the iPad to a fresh egress IP let the bulk download ~21 files before the next burst re-hit the wall — i.e. a **per-IP edge throttle**, not project quota, not the device, not DNS, not per-file link-rot.

The currently-shipped **4 MiB Range chunking aggravates the problem**: it was added for a now-disproven "iOS drops large in-flight responses" theory (a tiny 4 MiB request fails too), and it multiplies one booklet into ~31 requests, so the bulk 46-booklet run fires hundreds-to-thousands of rapid requests from one IP — a textbook abuse-throttle trigger. Two Codex consults (gpt-5.5) independently concluded the durable fix is the **client request pattern**, not auth/infra (per-user OAuth / a redirect-only Worker / GCP quota engineering all fail because the final byte fetch still egresses from the player's IP).

## What Changes

- **BREAKING (internal behavior): stop Range-chunking booklet fetches.** Default to **one whole-file `?alt=media` request per booklet** (46 files → 46 requests, not ~1000). Removes the request-amplification that trips the edge throttle. (The disproven large-response-abort theory it was built for never reproduced.)
- **Raise the per-request abort timeout 30s → 180s.** A single whole 123 MB fetch on a mobile network needs it; 30s was tuned for 4 MiB chunks and now manufactures false failures.
- **Pace the bulk download.** The offline-all run (already sequential / concurrency 1) SHALL wait ~4s + 0–2s jitter between booklets so a single user's full run (~3–5 min) stays under the burst threshold. Cache-first skip is unchanged.
- **Detect the throttle and back off instead of hammering.** On a CORS-masked fetch failure (a `TypeError`-class error), run **one same-origin** probe; if the same-origin probe succeeds and `navigator.onLine !== false` while Drive failed, classify it as a **suspected Drive edge throttle**, **stop the bulk queue immediately** (no retry-storm), and persist a progressive cooldown (30 min → 2 h → 6 h → 24 h cap; reset after several successful Drive fetches). Bulk **hard-respects** the cooldown; single-open **soft-respects** it (one request rarely trips the throttle → warn but still allow).
- **Throttle-aware copy.** Replace generic 「網路連線失敗」/「下載失敗」 with 「Google Drive 暫時限制大量下載，已暫停；已完成的檔案會保留，稍後可重新按下載續跑。」 The official Drive-viewer link fallback is kept. The 🔍 診斷連線 button is demoted into the error/details area.

The **zero-app-hosted-bytes / no-proxy licensing invariant is unchanged** — bytes still flow Drive → the player's browser directly.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-explanation-pdf-provenance`:
  - **REMOVE** `Booklets are fetched in bounded Range slices for mobile-Safari reliability` — the Range-slice mandate is now counterproductive (built for a disproven theory; amplifies the per-IP request burst that causes the real failure).
  - **MODIFY** `Booklet is auto-fetched on demand and cached, with an offline-all option` — default one request per booklet (drop the slice-assembly path + its failure stage); bulk run paces between booklets and auto-stops on a suspected edge throttle with a persisted cooldown.
  - **MODIFY** `Fetch errors and offline degrade gracefully with the official link` — add the CORS-masked edge-throttle failure class (arrives as a `TypeError`, not a readable 403): classify via a same-origin probe, surface throttle-aware copy, persist the cooldown (bulk hard-block, single-open soft-warn), keep the official-link fallback.

## Impact

- **Affected code (neurons-tw only):**
  - `apps/neurons-tw/src/platform/driveFetch.ts` — remove Range chunking (single whole-file fetch), raise timeout to 180s, add a CORS-masked-error classifier + a same-origin throttle probe helper.
  - `apps/neurons-tw/src/components/OfflineAllPdfControl.tsx` — inter-booklet pacing + jitter, throttle detection → stop queue, cooldown read/write, throttle-aware copy, demote the diagnostic button.
  - `apps/neurons-tw/src/platform/index.ts` — single-open soft-cooldown awareness.
  - A small cooldown helper + Dexie `meta` key-value entries (the cooldown state / strike count). **No Dexie schema bump** (meta is key-value).
  - Unit tests: single-shot fetch path, CORS-masked-error classification, cooldown ladder + reset.
- **Unchanged:** the zero-app-hosted-bytes invariant, the Drive endpoint + referrer/CORS request policy, the byte-store (Cache API) interface, the provenance map / manifest, the responsive PDF panel, the official-link fallback. No backend / Worker / R2 / Supabase change. No GCP-side change.
- **Out of scope (recorded):** Range large-file resume fallback; manual Pause/Resume UI (re-clicking download auto-skips cached files = natural resume); per-user OAuth Drive read; a redirect-only Worker; GCP quota engineering.
