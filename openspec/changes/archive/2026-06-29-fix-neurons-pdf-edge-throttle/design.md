## Context

Booklet PDFs are fetched **browser-direct** from the publisher's Google Drive (`GET https://www.googleapis.com/drive/v3/files/{id}?alt=media&key={referrer-restricted public key}`, CORS mode) and cached in the Cache API. A hard licensing invariant forbids any app-owned server in the byte path (no proxy / Worker / R2 re-hosting) — CC-BY-NC content + third-party figures.

The download fails on iPad (and intermittently elsewhere). Root cause confirmed this session: Google's **edge** returns a `403` "Sorry..." abuse interstitial (`text/html`, **no `access-control-*` header**) for bursty per-IP Drive/media traffic; a CORS fetch with no `Access-Control-Allow-Origin` throws `TypeError: Load failed`, which the app rendered as 「網路連線失敗」. Confirmed by: a direct `curl` returning exactly that CORS-less 403 HTML; healthy GCP quota (Queries/min at 0.08%); a non-Google cross-origin probe returning 200; and a fresh-IP (cellular) run downloading ~21 files before the next burst re-hit the wall. The currently-shipped 4 MiB Range chunking — built for a now-disproven "iOS drops large responses" theory — turns one booklet into ~31 requests, so a 46-booklet bulk run fires hundreds–thousands of requests = the burst that trips the throttle.

Two Codex (gpt-5.5) consults converged: fix the **client request pattern**, not auth/infra. Per-user OAuth, a redirect-only Worker, and GCP quota engineering were all rejected because the final byte fetch still egresses from the player's IP, so a per-IP edge throttle persists regardless.

## Goals / Non-Goals

**Goals:**
- Eliminate the request-volume burst that trips the per-IP edge throttle, so single-open and bulk download both work on iPad under normal use.
- When the throttle is hit anyway, fail honestly and back off (no retry-storm), with copy that tells the player what happened and that progress is saved.
- Keep the zero-app-hosted-bytes invariant; no backend/Worker/GCP change.
- Stay simple — this is a solo-maintained app.

**Non-Goals:**
- A Range large-file resume fallback (single-shot is simpler and *less* throttle-prone than 2 Range requests).
- A manual Pause/Resume UI (cache-skip on re-click is natural resume).
- Per-user OAuth Drive read, a redirect-only Worker, GCP quota engineering (all ineffective vs a per-IP throttle).
- Guaranteeing a one-shot ~1 GB bulk download — bulk is best-effort, resumable-by-cache.

## Decisions

### D1 — One whole-file request per booklet (drop Range chunking)
Default `fetchBooklet` to a single `?alt=media` GET. 46 booklets → 46 requests instead of ~1000. This is the single most important change. **Alternative considered:** keep Range only for files ≥40 MB (64 MiB chunks). Rejected for v1 — a single request is *fewer* requests than even 2 chunks and far less code; the disproven large-response theory it was built for never reproduced. The Range path is removed, not flag-gated (dead code otherwise).

### D2 — Per-request timeout 30s → 180s
30s was tuned for 4 MiB chunks; a single whole 123 MB fetch on mobile legitimately exceeds it. Use a 180s hard abort timeout. **Alternative:** an idle/stall timeout (reset on each progress event) — better but more code; deferred. 180s hard is enough for v1.

### D3 — Bulk pacing: ~4s + 0–2s jitter between booklets
The loop is already sequential (concurrency 1); it just needs spacing. 4s base + 0–2s jitter ≈ 3–5 min for 46 files — acceptable, and well under the burst threshold now that each file is one request. Jitter de-correlates repeated runs / multiple users. **Alternative:** Codex's earlier 10–30s (8–15 min) — too slow now that chunking is gone. Values are dogfood-tunable constants.

### D4 — Throttle detection via a same-origin probe (not httpbin)
The edge 403 is opaque (a thrown `TypeError`, no readable status). On such a failure, run **one same-origin** probe (`fetch(<same-origin asset>, {method:'HEAD'|'GET', cache:'no-store'})`). Classify as **suspected Drive edge throttle** only when: the Drive fetch threw a `TypeError`-class error **AND** the same-origin probe succeeds **AND** `navigator.onLine !== false` **AND** (we already had a Drive success this run **OR** it is the 2nd such Drive failure this run). **Alternative:** the existing cross-origin httpbin probe — rejected (extra third-party dependency, itself blockable by adblock/captive-portal/DNS → false signal). It is "suspected," never "proven" — the browser cannot prove it (accepted limitation).

### D5 — Persisted progressive cooldown; bulk hard-blocks, single-open soft-warns
On a detected throttle: **stop the bulk queue immediately** (no further Drive requests, no retry) and persist `{ until, strikes }` in the Dexie `meta` KV store. Ladder by strike: 30 min → 2 h → 6 h → 24 h cap. Reset strikes after several consecutive successful Drive fetches. **Bulk** refuses to start while `now < until` (shows "請於 ~HH:MM 後再試"). **Single-open** only soft-warns (one request rarely trips the throttle and a player tapping one PDF deserves the attempt) — it still tries, and a success there clears/relaxes the cooldown. **No Dexie schema bump** — `meta` is key-value.

### D6 — Cache write via `response.clone()` where possible
A whole 123 MB `.blob()` pressures iOS memory; prefer caching `response.clone()` to avoid an extra large-object copy where the Response is clonable, falling back to the existing buffered-Blob clean-200 path otherwise (still required — WebKit `Cache.put` rejects some bodies). Keep the verify-write-landed + QuotaExceededError handling.

### D7 — Throttle-aware copy + demote the diagnostic button
Replace 「網路連線失敗」/「下載失敗」 with 「Google Drive 暫時限制大量下載，已暫停；已完成的檔案會保留，稍後可重新按下載續跑。」 Keep the official Drive-viewer link fallback. Move the 🔍 診斷連線 button into the error/details area (its diagnostic job is done; not a primary affordance).

## Risks / Trade-offs

- **Throttle detection can false-positive** (a same-origin-OK + Drive-`TypeError` could be a transient blip, not the throttle) → mitigate with the multi-condition gate (D4: prior success OR 2nd failure) so a single transient miss doesn't trip a 30-min cooldown; the cooldown is conservative but recoverable (re-click after it elapses; single-open ignores it).
- **Bulk is slower** (~3–5 min vs the old instant-but-failing burst) → acceptable; it now *completes*. Copy sets the expectation; cache-skip makes re-runs cheap.
- **A single 123 MB fetch can still drop on a flaky mobile link mid-transfer** → surfaces as one failed booklet (counted, not a partial cache entry); re-click re-attempts it; this is rarer than the throttle and not worth Range-resume complexity in v1.
- **Heavy concurrent users on one shared NAT/IP could still collectively trip the edge throttle** → outside one client's control; the cooldown + official-link fallback degrade gracefully; not solvable under the no-proxy invariant.
- **`response.clone()` may not be usable for every response shape** → fall back to the existing buffered-Blob clean-200 path (no regression).

## Migration Plan

Pure client change in `apps/neurons-tw`. No data migration, no Dexie bump, no backend/Worker/GCP change. Deploy = merge to `main` → CF Pages builds neurons → live. Rollback = revert the change + redeploy (the prior chunking behavior returns; no persisted state is incompatible — the new `meta` cooldown keys are simply ignored by old code). Existing cached booklets remain valid (same byte-store, same keys).

## Open Questions

- Exact pacing/cooldown constants are dogfood-tunable; 4s+jitter and 30m/2h/6h/24h are the v1 defaults. Owner can adjust after real-device use.
