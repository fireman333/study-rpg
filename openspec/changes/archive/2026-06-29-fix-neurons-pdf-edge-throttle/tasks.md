# Tasks — fix-neurons-pdf-edge-throttle

## 1. `driveFetch.ts` — single-shot fetch + throttle classifier

- [x] 1.1 Remove the 4 MiB Range-chunking path from `fetchBooklet` (drop `chunkSize`, the 206-probe / slice-assembly `ReadableStream`, `parseContentRangeTotal`); fetch each booklet as one whole-file `GET …?alt=media` request (keep referrerPolicy/credentials/mode, the resourceKey header, retries for transient 5xx/network, and the typed `DriveFetchResult`).
- [x] 1.2 Raise the per-request abort timeout default 30s → 180s (`DEFAULT_TIMEOUT`).
- [x] 1.3 Add an exported `isCorsMaskedError(err)` helper (true for a thrown `TypeError` / "Load failed" / "Failed to fetch") + an exported `sameOriginProbe()` helper (`fetch(<same-origin asset>, { method: 'HEAD'|'GET', cache: 'no-store' })` → boolean), so callers can classify a suspected edge throttle. No cross-origin (httpbin) probe.
- [x] 1.4 Keep `diagnoseDrive` working but note it is no longer a primary affordance (used only from the demoted button).

## 2. Cooldown helper (`platform/` + Dexie `meta` KV, no schema bump)

- [x] 2.1 Add a small cooldown module: `getCooldown()` → `{ until, strikes } | null`, `recordThrottleStrike()` (ladder 30m → 2h → 6h → 24h cap; writes `meta`), `clearThrottle()` / `noteDriveSuccess()` (reset strikes after several consecutive successes). Use the existing Dexie `meta` key-value store (no `.version(n)` bump).
- [x] 2.2 Unit-test the ladder: strike 1→30m, 2→2h, 3→6h, 4+→24h cap; success-reset behavior.

## 3. Bulk download — pacing, throttle stop, cooldown (`OfflineAllPdfControl.tsx`)

- [x] 3.1 At `downloadAll` start, if a cooldown is active (`now < until`) refuse and show 「Google Drive 暫時限制大量下載，請於 ~HH:MM 後再試」 (do not issue any Drive request).
- [x] 3.2 Add a ~4s + 0–2s jitter sleep between consecutive (non-skipped) booklet fetches.
- [x] 3.3 On a fetch failure, classify via `isCorsMaskedError` + `sameOriginProbe()` + `navigator.onLine`; if suspected throttle (and we already had a Drive success this run OR it is the 2nd such failure), `recordThrottleStrike()`, STOP the queue (break the loop, no further Drive requests, no retry), and surface 「Google Drive 暫時限制大量下載，已暫停；已完成的檔案會保留，稍後可重新按下載續跑。」 A genuine offline / other error keeps the existing per-booklet failure handling.
- [x] 3.4 On a successful booklet fetch call `noteDriveSuccess()` (drives strike reset).
- [x] 3.5 Cache via `response.clone()` when clonable, else the existing buffered-Blob clean-200 path; keep verify-write-landed + QuotaExceededError classification. Drop the now-defunct 「組裝」(slice-assembly) failure stage from the surfaced stages.
- [x] 3.6 Demote the 🔍 診斷連線 button into the error/details area (shown when there is a failure / on expand), not a standing primary control.

## 4. Single-open — soft cooldown (`platform/index.ts`)

- [x] 4.1 In `openWebBooklet`, on a suspected-throttle failure, soft-respect the cooldown: still attempt the one fetch; on success call `noteDriveSuccess()` (clears/relaxes cooldown); on failure surface throttle-aware copy + the official Drive link (existing fallback). Do not hard-block a single open.

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean.
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` — new/updated unit tests green (single-shot fetch path; `isCorsMaskedError`; cooldown ladder + reset; bulk stops + records strike on suspected throttle; bulk refuses while in cooldown).
- [x] 5.3 `/verify` (Chrome MCP smoke on dev): app boots clean (no console errors); seeded a cooldown in the real Dexie `meta` → bulk button renders `⏸ 已暫停（Drive 限流）` + disabled + the paused banner (copy + 約HH:MM + 官方連結 fallback); cleaned up the seeded row. Dead-code audit clean (tsc `noUnusedLocals`); `/simplify` applied (shared `isSuspectedEdgeThrottle` classifier, `tryPut` cache helper, dropped 2 dead exports + shadowed banner, short-circuited `noteDriveSuccess`); typecheck + 754 tests green. (Live throttle path is environment-dependent → owner verifies on real device, 5.4.)
- [ ] 5.4 Owner real-device smoke (iPad): bulk download completes (paced) or pauses honestly with the throttle copy; single 「看原始詳解 PDF」 opens. (The throttle is environment-dependent; this is the acceptance signal.)
