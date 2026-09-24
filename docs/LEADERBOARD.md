# Hospital Leaderboard (M_2nd ext)

> Opt-in global ranking for 二階 (`apps/medexam2-hospital-tw`). 5 public fields (hospital tier / reputation / doctor count / total study minutes / 2–12 codepoint nickname). Backend = Cloudflare D1 + KV via the existing sync Worker — **not** Supabase.

## Why it exists

二階's core fantasy is hospital growth. A leaderboard amplifies that by giving players cross-account peer comparison, but only after explicit opt-in. The feature deliberately stays small (5 filter tabs, Top 100 only) so privacy disclosure is short and the surface area doesn't bleed into the rest of the app.

Backend chose Cloudflare D1 + KV over Supabase Postgres for three reasons:

1. **Zero egress** at ~1k-player scale matches the in-flight R2 migration's cost ceiling — adding another Supabase-egress feature mid-cutover would have undermined the migration's rationale.
2. **Edge KV** for the public read path lets the leaderboard page load Top 100 in one network hop without an authenticated round-trip — UI is fully readable signed-out.
3. **Worker module co-located** with R2 sync means the same JWT verification helper (`extractBearer` + `verifyJWT`) is reused; no new auth path.

`bug_reports` table stays on Supabase because the owner-side read flow needs server-side SQL (filter by category × severity × timestamp). Leaderboard owner-side reads are just `wrangler d1 execute`, so D1 was fine.

## Architecture

```
Player → [LeaderboardOptInModal] → upsertLeaderboard()
              ↓                          ↓
        IDB v14 leaderboardProfile   POST /leaderboard/upsert
              ↓                          ↓
       getLeaderboardProfile()      Worker JWT verify
       (no-profile | not-opted-in   sanity bounds (tier 1–3,
        | opted-in branch)           rep ≥ 0, doctor 0–50, ...)
              ↓                          ↓
        sync engine                D1 UPSERT (LWW on updated_at)
        onPushComplete            ─────────────────────────────
        (firstError===null
         && !anyOffline)           Cron "0,30 * * * *":
              ↓                    runLeaderboardCron
       pushLeaderboardIfOptedIn      → 5 D1 SELECTs (Top 100)
       (best-effort, errors swallowed)→ 5 KV writes (leaderboard:m2:top100:<filter>)
                                         ↓
                                   GET /leaderboard/:filter → KV (public, no auth)
                                         ↓
                                   LeaderboardPage 5-tab UI
```

## Schema

### D1 table — `leaderboard_m2`

Migration: `cloudflare/sync-worker/migrations/0001_leaderboard.sql` (Worker D1 migrations have their own number space — **not** shared with `supabase/migrations/`).

| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT PRIMARY KEY | Always equals the verified JWT `sub` claim — body fields can't override. |
| `nickname` | TEXT NOT NULL | Display form (preserves case + diacritics). |
| `nickname_lower` | TEXT NOT NULL UNIQUE | `normalizeNickname(raw) = raw.normalize('NFKC').toLowerCase()`. The UNIQUE constraint is the uniqueness gate. |
| `hospital_tier` | INTEGER NOT NULL | 1 (診所) / 2 (區域醫院) / 3 (醫學中心 or 國家級教學醫院, client clamps tier 4 → 3 to match Worker `TIER_MAX`). CHECK 1–3. UI render walks through `tierLabel()` helper for short display labels (診所 / 區域 / 醫中 / 大廟) per `add-abbreviated-tier-labels-medexam2`; canonical names above are storage-layer values only. |
| `reputation` | INTEGER NOT NULL | CHECK ≥ 0. |
| `doctor_count` | INTEGER NOT NULL | CHECK 0–50. |
| `total_study_min` | INTEGER NOT NULL | CHECK ≥ 0. From `monotonicCounters.totalStudyMinutes` (monotonic, never decrements). |
| `is_public` | INTEGER NOT NULL DEFAULT 1 | CHECK ∈ (0, 1). Row stays in D1 even when 0 — cron filters via partial index. |
| `updated_at` | INTEGER NOT NULL | Epoch ms. LWW resolution: `ON CONFLICT DO UPDATE ... WHERE current.updated_at < incoming.updated_at`. |
| `badges_csv` | TEXT NOT NULL DEFAULT '' | Achievement system v15 — per-category highest tier (`cat:Pn,...`, ≤ 6 entries, ≤ 60 chars). Migration `0002_add_badges.sql`. |
| `subject_mastery_count` | INTEGER NOT NULL DEFAULT 0 | Count of `subject-master-*` unlocks (0–14). Same migration as above. |
| `total_correct` | INTEGER NOT NULL DEFAULT 0 | CHECK ≥ 0. Sum of `questionHistory.correctCount` across all answered questions (re-attempts of the same question count separately). **Not** `mastery.correct` — that field carries a partner-specialty multiplier weighting (e.g. 0.6 / 0.8) that doesn't match the player's intuitive「答對總題數」expectation, and was also historically subject to outer-tx rollback drops. Migration `0005_add_total_correct.sql` (add-hospital-leaderboard-correct-count-filter); derivation source changed by `fix-hospital-leaderboard-correct-source` (2026-05-24, client-only). |

Partial indexes (all `WHERE is_public = 1`):

```sql
idx_leaderboard_m2_composite      (hospital_tier DESC, reputation DESC, doctor_count DESC)
idx_leaderboard_m2_reputation     (reputation DESC)
idx_leaderboard_m2_doctor_count   (doctor_count DESC)
idx_leaderboard_m2_study_min      (total_study_min DESC)
idx_leaderboard_m2_total_correct  (total_correct DESC)
```

Partial indexing means opted-out rows do not bloat the snapshot indexes and `runLeaderboardCron` doesn't need an extra `WHERE is_public = 1` filter step beyond the index seek.

### IDB table — `leaderboardProfile` (Dexie v14)

| Field | Notes |
|---|---|
| `user_id` (PK) | Matches Supabase Auth `user.id`. |
| `nickname` | The display nickname the player chose. |
| `opted_in` | Boolean. `true` after submitting the opt-in modal. |
| `is_public` | Optional boolean (added Phase 7). `false` → settings toggle off → push with `is_public: 0`. Undefined treated as `true` for pre-Phase-7 v14 rows. |
| `dismissed_at` | Epoch ms when player picked「不再顯示」on the opt-in modal. Skips re-prompt forever. |
| `last_pushed_at` | Epoch ms of last successful Worker round-trip. |

Helpers in `apps/medexam2-hospital-tw/src/services/leaderboard-profile.ts`: `getLeaderboardProfile` / `markOptedIn` / `markDismissedForever` / `markPushed` / `clearLeaderboardProfile` / `setLeaderboardPublic`.

## Endpoints (`cloudflare/sync-worker/src/leaderboard.ts`)

All routes share the Worker's standard CORS allowlist (`localhost:5173` / `localhost:4173` / `https://fireman333.github.io`). User identity is **always** the JWT `sub` claim on authenticated routes — the request body never supplies `user_id` (cross-tenancy forging defense, same pattern as `presign.ts`).

### `POST /leaderboard/upsert`

JWT verify → sanity bounds → nickname uniqueness pre-check → D1 UPSERT (LWW).

Body:
```json
{
  "nickname": "wlk",
  "hospital_tier": 2,
  "reputation": 5400,
  "doctor_count": 7,
  "total_study_min": 312,
  "total_correct": 1245,
  "is_public": 1,
  "updated_at": 1716000000000
}
```

`total_correct`, `badges_csv`, and `subject_mastery_count` are optional in the body — older client bundles that predate the corresponding migrations omit them, and the Worker treats omitted as `0` / `''`. The one-way ratchet in the UPSERT preserves a populated server-side value when an incoming push omits these fields (defends against stale-cache clients clobbering with empties).

Responses:
- `200 {"ok": true}` — succeeded.
- `200 {"ok": true, "dropped": "tier_oob" | "rep_oob" | "doctor_oob" | "study_oob" | "correct_oob"}` — out-of-bounds, silently dropped (warn log, no retry storm).
- `400 {"error": "invalid_nickname_length" | "invalid_body" | "invalid_updated_at"}`.
- `401 {"error": "unauthenticated"}` — JWT missing / invalid.
- `409 {"error": "nickname_taken"}` — `nickname_lower` collision with a different `user_id`.
- `500 {"error": "upsert_failed"}` — D1 write error.

### `GET /leaderboard/:filter`

Public (no JWT). `filter ∈ {composite, reputation, doctor, study, correct}`. Reads pre-computed KV snapshot — never hits D1 at request time.

Response:
```json
{
  "rows": [
    {"player_key": "pk1_<22 base64url chars>", "nickname": "wlk", "hospital_tier": 3, "reputation": 18200, "doctor_count": 12, "total_study_min": 480, "total_correct": 1830, "badges_csv": "study:P2,quiz:P3", "subject_mastery_count": 4}
  ],
  "last_updated_at": 1716003600000,
  "total_count": 17
}
```

`player_key` (change `hash-leaderboard-user-ids`) is an opaque per-app HMAC of the account id — the snapshot no longer publishes `user_id`. A signed-in client gets its own key from `GET /leaderboard/me` (top-level `player_key`) and matches rows on it. Before the deadline in the Worker var `LEADERBOARD_RAW_ID_COMPAT_UNTIL` (rollout window only) rows also carry `user_id`, and every key comes from the window secret — so the keys published next to raw ids change at the deadline and stop resolving to anyone.

Each row carries exactly the fields in `PUBLIC_SNAPSHOT_FIELDS` (`src/leaderboard.ts`), applied both when the cron writes KV and again when this endpoint responds. Rows do **not** carry the player's `updated_at` — that is when their client last pushed, and on a login-free endpoint it published each player's daily routine (removed 2026-09-23, change `drop-sync-time-from-public-leaderboard` in study-rpg-2nd). A player's own `updated_at` is available only from the JWT-gated `GET /leaderboard/me`. A new snapshot column is not published until it is added to that list.

`last_updated_at: null` + empty `rows` means cron has never run for this filter yet (cold start) — UI shows「期待第一個上榜的玩家！」empty state.

### `GET /leaderboard/nickname-check?n=<candidate>`

JWT-gated (prevents unauthenticated dictionary enumeration of taken nicknames). Returns `{"available": boolean}` (no `reason` field today; reserved for future granularity).

### `POST /leaderboard/opt-out`

JWT verify → `UPDATE leaderboard_m2 SET is_public = 0, updated_at = <now> WHERE user_id = <jwt.sub>`. Bumps `updated_at` so subsequent stale client pushes don't accidentally flip `is_public` back to 1.

Response: `200 {"ok": true}`. Idempotent if row doesn't exist.

### `DELETE /leaderboard/me`

JWT verify → `DELETE FROM leaderboard_m2 WHERE user_id = <jwt.sub>`. Returns `{"ok": true, "deleted": <changes>}` where `changes` is the row count (0 if no row existed).

Called by `safeResetAccountData` in `useSync.ts` when player confirms「重置此帳號進度」. Worker failure is swallowed via `console.warn` — leaderboard delete is best-effort, must not abort the reset flow.

## 30-min cron — `runLeaderboardCron`

Schedule: `0,30 * * * *` (every 30 min at `:00` and `:30`, UTC). Dispatched in `src/index.ts` `scheduled()` by matching `event.cron` against the schedule string.

Per invocation:
1. 5 D1 SELECTs against partial indexes — `ORDER BY <filter-specific column(s)> DESC LIMIT 100 WHERE is_public = 1`.
2. 1 COUNT(*) for `total_count`.
3. 5 KV writes — `leaderboard:m2:top100:<filter>` ← `{rows, last_updated_at: Date.now(), total_count}`.
4. One structured log line: `[leaderboard cron] computed snapshots`.

No D1 writes from cron — read-only. 30-min cadence picked over per-upsert because: (a) KV write rate quota matters at edge (steady state 8 writes/hr = 192/day ≈ 19% of free-tier 1K/day), (b) Top 100 visibility lag of ≤ 30 min is acceptable for a personal-dogfood scale leaderboard, (c) avoids hot-spotting the index when many players push within minutes of each other. Original hourly cadence (`"0 * * * *"`) bumped to 30-min post-MVP per dogfood feedback that 60-min staleness felt too slow during active play sessions.

## Nickname normalization

`normalizeNickname(raw) = raw.normalize('NFKC').toLowerCase()`. Worker copy and client copy MUST stay byte-identical — drift causes「available」client-side but「taken」server-side (or vice versa). The client helper lives in `packages/core/src/lib/leaderboard-types.ts`; Worker copy is inline in `leaderboard.ts` (Worker package doesn't depend on `@study-rpg/core`).

Codepoint count uses `[...str].length` semantics on both sides:
- ASCII / CJK: 1 char per codepoint.
- Emoji: typically 1 codepoint (single-char emoji) or more (ZWJ sequences like 👨‍👩‍👧 count as multiple codepoints).

Bounds: **2 ≤ codepoints ≤ 12**. ZWJ emoji that exceed 12 are rejected — accepted P4 polish trade-off vs. building a full grapheme-cluster counter.

## Sign-in gate

`LeaderboardSettingsControls.tsx` (the inline controls in HelpMenu) and `LeaderboardOptInModal.tsx` both check `useAuth().user`. Signed-out players see a「請先登入 Google 帳號」 prompt, never the form. No anon submit path — every upsert needs a JWT.

Public reads (`GET /leaderboard/:filter`) are exempt: the leaderboard page renders Top 100 for everyone, signed in or not.

## Migration apply

```bash
cd cloudflare/sync-worker
wrangler d1 migrations apply study-rpg-leaderboard --local    # local D1 instance for dev
wrangler d1 migrations apply study-rpg-leaderboard --remote   # production D1
```

`--local` and `--remote` are separate D1 instances — applying locally does not touch prod. Both should be applied once (in either order) for any developer running `wrangler dev`.

## Sync engine integration

```ts
// apps/medexam2-hospital-tw/src/lib/sync/useSync.ts
createSyncEngine({
  // ...existing R2 sync wiring
  onPushComplete: () => pushLeaderboardIfOptedIn(user.id),
})
```

The engine fires `onPushComplete` **only** when `firstError === null && !anyOffline` — partial failures suppress the callback so we never spam Worker on a flaky network. Inside `pushLeaderboardIfOptedIn`:

- No `leaderboardProfile` row → `{kind: 'skipped', reason: 'no-profile'}`.
- `profile.opted_in === false` → `{kind: 'skipped', reason: 'not-opted-in'}` (defensive — current UI never lands here, but the row exists).
- `profile.opted_in === true` → build attributes from Dexie, POST upsert, mark `last_pushed_at`. Returns `{kind: 'pushed', is_public}`.
- Any throw → caught and returned as `{kind: 'error', message}`. **Never** re-thrown — a Worker outage must not trip the sync engine's consecutive-failure counter.

## Env / secrets

No new env vars on the client side beyond the existing R2 Worker URL (`VITE_SYNC_WORKER_URL`). The leaderboard endpoints live on the same Worker, so the URL is shared.

Worker secrets (set via `wrangler secret put`):
- `SUPABASE_JWKS_URL` — `https://<project>.supabase.co/auth/v1/keys` (same as R2 sync). Already set for the R2 migration; no new secret needed.
- `SUPABASE_PROJECT_REF` — for JWT issuer/audience verification. Already set.
- `LEADERBOARD_PLAYER_KEY_SECRET` — HMAC key for the public `player_key` (see `cloudflare/sync-worker/README.md` § Secret rotation). Must be set BEFORE the Worker that reads it is deployed.
- `LEADERBOARD_PLAYER_KEY_WINDOW_SECRET` — rollout window only: the HMAC key used instead of the one above until `LEADERBOARD_RAW_ID_COMPAT_UNTIL`. Must differ from it; delete after the window.

No `SUPABASE_SERVICE_ROLE_KEY` — Worker never reads user data on behalf of users (same boundary as R2 sync).

## Owner read flow

Until a future `/leaderboard` slash skill ships, the owner inspects D1 via `wrangler d1 execute`:

```bash
# Last 20 leaderboard rows by updated_at
cd cloudflare/sync-worker
wrangler d1 execute study-rpg-leaderboard --remote --command \
  "SELECT user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, is_public, datetime(updated_at/1000, 'unixepoch') AS updated_at_iso
   FROM leaderboard_m2 ORDER BY updated_at DESC LIMIT 20;"

# How many opted-in rows
wrangler d1 execute study-rpg-leaderboard --remote --command \
  "SELECT count(*) AS opted_in_total FROM leaderboard_m2 WHERE is_public = 1;"

# Top 10 by reputation
wrangler d1 execute study-rpg-leaderboard --remote --command \
  "SELECT nickname, hospital_tier, reputation FROM leaderboard_m2
   WHERE is_public = 1 ORDER BY reputation DESC LIMIT 10;"
```

Inspect cron output (KV snapshots):

```bash
wrangler kv key get --binding LEADERBOARD_KV "leaderboard:m2:top100:composite" --remote
```

## Monitoring

- **Cron health**: Workers dashboard → study-rpg-sync-worker → Logs. Filter for `[leaderboard cron]` every 30 min. Missing log row for > 1 hour = cron broken.
- **Drop-rate**: search Worker logs for `[leaderboard] dropped upsert:` patterns. A sudden spike means client is sending out-of-bounds payloads (likely Dexie schema drift or tier-clamp regression).
- **D1 size**: `wrangler d1 info study-rpg-leaderboard --remote` shows DB size. At ~50 bytes/row × 1k users projected = ~50 KB. Free-tier ceiling is 5 GB.
- **KV ops**: Workers dashboard → KV → `LEADERBOARD_KV`. Expected steady-state: 8 writes/hour (cron, 4 keys × 2 fires) + N reads/hour (player page loads). Read spikes during marketing pushes are fine — KV reads are free at edge.

## Known warts

- **Emoji ZWJ codepoint counting** (e.g. 👨‍👩‍👧 = 7 codepoints) — accepted P4 polish for the initial ship. Players hitting the limit can use a shorter name.
- **Account delete across apps** — `safeResetAccountData` in 二階 deletes the leaderboard row, but **一階 SettingsPanel's** `delete_my_account` flow doesn't (二階 has no delete-account button by design). If a player deletes their 一階 account, the 二階 leaderboard row becomes orphaned (no auth user to push updates). Nickname stays reserved. Future cleanup: cron sweep for `updated_at` > 90 days idle.
- **Tier-4 clamp** — content pack defines 4 tiers (`診所 / 區域醫院 / 醫學中心 / 國家級教學醫院`) but Worker `TIER_MAX = 3`. Client clamps tier 4 → 3 in `buildLeaderboardAttributes`. Phase 4 follow-up: either bump Worker `TIER_MAX` to 4 or expose the cap in shared types.
- **JWKS URL path gotcha (Worker auth)** — Supabase exposes the JWT signing keys at **`https://<projectref>.supabase.co/auth/v1/.well-known/jwks.json`** (standard RFC path, returns 200 with the ES256 key). The seemingly-natural `/auth/v1/keys` endpoint returns **401** because GoTrue requires an `apikey` header there, and `jose.createRemoteJWKSet()` doesn't send one — silent verify failure for every authed Worker endpoint. Prod secret `SUPABASE_JWKS_URL` MUST be set to the `.well-known` path. For local `wrangler dev`, mirror it in `cloudflare/sync-worker/.dev.vars` (gitignored). Symptom of wrong URL: every `/leaderboard/*` authed call returns `401 {"error":"unauthenticated"}` with no other clue in the Worker log.

## Follow-up changes (not in this milestone)

- `add-leaderboard-friend-filter` — read-time friend list (no server-side join, just client-filter the public Top 100). Maps to roadmap M6.
- `add-leaderboard-og-card` — public-share angular character card with OG image. Roadmap M6.
- `add-leaderboard-orphan-sweep` — cron sweep `is_public = 1` rows idle > 90 days into a `is_public = 0` archive state.
- `bump-worker-tier-max-to-4` — proper 國家級教學醫院 distinction without client-side clamp.
