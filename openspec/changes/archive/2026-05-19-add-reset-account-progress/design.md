## Context

`cloud-sync` already supports two destructive flows: **account deletion** (`delete_my_data()` + Supabase Auth deletion + sign-out, intended for "I'm leaving this product") and **account-switch** (snapshot → flush → wipe → sign in another account, intended for "I'm switching identity"). Today's gap is **in-place reset** — keep the same Google identity signed in, but throw away all gameplay progress on it.

Two recently archived changes (`2026-05-19-fix-sync-sign-in-lifecycle` and `2026-05-19-fix-account-switch-data-loss`) already proved out every primitive this change needs: `snapshotLocalToBackup`, `clearLocalSyncTables`, `delete_my_data()` RPC, and the `setResolveTick` engine-restart pattern. The remaining work is composition + UX, not new infrastructure.

The two apps (`medexam-tw` 一階 and `medexam2-hospital-tw` 二階) keep parallel sync wiring (own Dexie schema, own `useSync` hook, shared `delete_my_data` RPC). The reset feature must ship in both with mirror implementations to stay in sync.

## Goals / Non-Goals

**Goals:**
- One method (`safeResetAccountData()`) on each app's sync hook that performs snapshot → cloud-delete → local-wipe → engine-restart as an ordered, abort-on-error sequence.
- Two independent confirmation gates the user must clear before destruction starts.
- Reuse `local_backup` Dexie table as the recovery escape hatch — same snapshot path used by account-switch.
- Preserve `auth.user` throughout: the engine restarts via `setResolveTick`, no sign-out, no re-OAuth round trip.
- Surface the entry in each app's existing account-management UI, not as a primary CTA.

**Non-Goals:**
- No new Supabase migration. `delete_my_data()` already exists since `0002_account_lifecycle.sql`.
- No new RPC, no schema change, no new Supabase Auth scope.
- No background scheduling or partial reset (no "reset only 醫師 roster", no "reset only 答題紀錄"). Single all-or-nothing flow.
- No undo button. The localBackup snapshot is the only recovery; user must use it manually via existing Settings flow.
- No analytics/telemetry beyond a console log. Adoption is rare; full event pipeline is overkill.

## Decisions

### Decision 1 — Snapshot BEFORE cloud delete, not after

Cloud `delete_my_data()` is irreversible. If snapshot fails after delete, the user is in an unrecoverable state. If snapshot fails before delete, we simply abort the reset and tell the user — local + cloud both intact.

**Alternative considered**: snapshot to localBackup AND export JSON download in parallel. Rejected because (a) export is a separate explicit user gesture already; (b) doubling the safety net implies the primary one is unreliable and erodes user trust.

### Decision 2 — Abort on cloud-delete error, do NOT cascade wipe locally

If `supabase.rpc('delete_my_data')` returns an error (RLS denial / network / 5xx), we throw and stop. Local data stays intact. Result: cloud and local both still contain the pre-reset state, which is the safest divergence direction (next sync just re-uploads).

**Alternative considered**: wipe local anyway so "reset" feels complete even when offline. Rejected — leaves cloud diverged from local; next auto-push re-uploads stale state and resurrects what the user thought they erased. Worse than visibly failing.

### Decision 3 — `setResolveTick(t => t + 1)` engine restart, not `pageReload()`

After wipe, the engine needs to re-evaluate the sign-in gate so the user lands in `fresh-start` state. `setResolveTick` is the same mechanism `safeAccountSwitch` uses post-sign-in. A hard `location.reload()` would also work but flashes the UI and risks losing any unsaved non-sync local state (mock-exam in progress, etc.) which is fine for account-switch but rude for a single-identity reset.

**Alternative considered**: keep the engine running and just trigger an empty pull. Rejected — the engine has internal gate state (`fresh-start` / `silent-pull` / `resolved`) that's harder to reset cleanly than just re-running the resolver.

### Decision 4 — Layer 2 = type "RESET", not a checkbox

A typed-confirmation string defeats accidental fat-finger taps in a way a checkbox does not. Standard pattern in GitHub repo deletion, Stripe account closure, etc. The exact string is "RESET" (uppercase, ASCII) — short enough not to be tedious, distinct enough from normal typing.

**Alternative considered**: checkbox + 5-second countdown button enable. Rejected — countdown UX is more code (timer, button-enabled state, accessibility) than a `prompt()` call for the same protective effect.

### Decision 5 — UI placement mirrors each app's existing destructive-action home

一階 already has 資料管理 section in `SettingsPanel.tsx` housing Export + Delete-cloud-data. The reset button slots in there between them.

二階 has no SettingsPanel equivalent; account-level actions live in `HelpMenu.tsx`'s 帳號 accordion section. Reset slots in there.

This keeps "destructive actions live where users already expect to find them" and avoids inventing a new surface.

### Decision 6 — Mirror impl, not shared module

Both `useSync.ts` files will get an independently-written `safeResetAccountData` method. The two apps have different Dexie schema (`db: StudyRpgDB` vs `hospitalDb: HospitalDB`) and different `clearLocalSyncTables` signatures. Extracting a shared utility would need a parameterized factory and shave maybe 30 LOC at the cost of cross-package coupling. Not worth it for a one-time wire.

**Alternative considered**: factor into `@study-rpg/core`. Rejected — `core` is content-agnostic by contract; sync is app-layer.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| User clears Layer 1 + Layer 2, snapshot succeeds, cloud-delete succeeds, but `clearLocalSyncTables` partially fails → local is half-wiped, cloud is empty | Wrap the wipe in try/catch; if it throws, log error + leave a console warning. Local will re-pull from cloud (empty) on next pull tick, eventually converging. Worst case: a few orphaned rows linger one tick. Acceptable. |
| Race: user clicks reset, then clicks 切換帳號 mid-flow | Both flows mutate the same engine state. We accept that the second click wins / aborts the first. No locking primitive — the prompt() blocks the main thread anyway during Layer 2, so the realistic window is narrow. |
| Supabase RPC succeeds but transient network blip means client doesn't see success | The retry is "just hit Reset again" — second run is idempotent (already-deleted rows are a no-op on the cloud side; snapshot creates a new localBackup entry tagged `reset-account-data`). |
| User loses access to localBackup recovery UI (it currently has none) | Out of scope; tracked separately. The data IS in IndexedDB; M5+ could surface a recovery picker. |
| Both apps' implementations drift over time | Mirror impls reviewed in the same PR / change. Spec scenarios are app-agnostic so future fixes can target either app's deviation without spec churn. |

## Migration Plan

No migration needed. `delete_my_data()` RPC exists in production since 2026-05-15. Feature ships as a pure additive UI + sync-hook change. Rollback = revert the 5 file edits.

Per `auto-git` policy + project.md merge protocol: develop on `track-m2` (current worktree), `/opsx:archive` after `/verify` passes, then merge `track-m2 → main` and push both branches.

## Open Questions

- (Resolved at proposal time) Should reset preserve `local_backup` rows from previous account-switches? **Yes** — `clearLocalSyncTables` already excludes `local_backup`. Just confirming during impl.
- (Resolved at proposal time) Should we add a "are you sure?" telemetry event to `bug_reports.sync_metadata`? **No** — out of scope; bug-reports skill could surface it later if needed.
