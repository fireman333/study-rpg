# fix-sync-sign-in-lifecycle

## Why

Two live-dogfood bugs and one mobile UI bug expose architectural gaps in the M4 cloud-sync sign-in lifecycle:

### Bug 1 — Mobile sign-in skips migration / conflict modal (user-reported)

A player signed in on mobile and expected to pull their PC progress; instead, **no modal appeared** and the local mobile state remained. The PC progress was never synced down. Root cause is an async race in `apps/medexam-tw/src/lib/sync/useSync.ts:65-133` + `migration.ts:104-120`:

- OAuth redirect → `AuthContext` re-hydrates session
- `useSync` effect fires, runs `computeGateState()`
- `hasNonDefaultLocalState()` queries Dexie; on slow mobile cold-load, Dexie hydration may not yet have written the live player object
- Gate misclassifies as `'fresh-start'` or `'silent-pull'` → never re-evaluates as new local data lands
- Modal never renders despite local state actually being non-default

There is no mobile-specific render gate (CSS/JS checked); this is purely an async-timing bug.

### Bug 2 — Sign-out does NOT clear local data; account switch silently corrupts (user + owner observed)

`AuthContext.signOut()` in `apps/medexam-tw/src/lib/auth/AuthContext.tsx:82-89` only calls `supabase.auth.signOut()` — it does NOT clear local IndexedDB sync tables or per-user migration-choice meta keys. `SettingsPanel.tsx:166-169` only exposes a 「登出」 button, not a 「切換帳號」 flow. When a user signs out and signs in with a **different** Google account in the same browser:

1. Previous account's player / items / SRS cards remain in local Dexie
2. New gate computation runs `hasNonDefaultLocalState()` against the OLD account's data → triggers `'conflict-chooser'`
3. If user picks 「使用雲端」 the OLD account's local progress is permanently deleted (no `local_backup` for cross-account scenario)
4. If user picks 「使用本地」 they unintentionally **push the old account's data into the new account's cloud row** — full data corruption

Spec-violating: the existing `cloud-sync` Requirement at L107-110 says "Cloud non-empty defers to conflict chooser" assuming both belong to same user; account-switch breaks that invariant. Current `auth` spec L35-43 correctly says sign-out preserves local — that rule stays — but a separate, explicit account-switch flow is missing.

### Bug 3 — Mobile sync banner renders Chinese characters vertically (user-reported)

The paused banner ("雲端同步已暫停 …") wraps **one Chinese character per line** at iPhone widths (see attached screenshot, 2026-05-19): the email pill `☁️ tony85314@gmail.com` consumes the full horizontal row, squeezing the status text into a 1-character-wide column. Existing `cloud-sync` spec L173-187 covers desktop alignment but only vaguely defers mobile to "consistent anchoring" — needs explicit reflow contract.

### Defense-in-depth gaps exposed (P1 observability)

This investigation also surfaced four observability gaps that, had they existed, would have made Bug 1 self-diagnosing from the bug-report pipeline rather than requiring live reproduction:

- No `gate_state` / sync metadata attached to bug reports
- No user-facing sync status indicator (sync runs silently; user has no way to confirm "is it working?")
- Push / pull failures are silent (`console.warn` only, per spec L150)
- No DEV-mode `__sync.diagnose()` snapshot method

Adding these four in the same hotfix prevents recurrence and turns future similar reports into a 30-second triage rather than a multi-hour Explore agent run.

## What Changes

### Bug 2 fixes — account lifecycle

1. **Account-switch detection at sign-in** (NEW capability): on every successful sign-in, compare current `user.id` against last-signed-in `user.id` stored in `db.meta`. If different AND local has non-default state, show a dedicated `AccountSwitchPrompt` modal BEFORE gate computation, offering:
   - 「清空本地、改用此帳號的雲端進度」(recommended for "I'm logging into my real account on a borrowed device")
   - 「保留本地進度、合併到此帳號雲端」(LWW-merge — current default but now explicit)
   - 「先登出，我用回原本帳號」(immediate sign-out, no data touched)

2. **「切換帳號」 menu entry** in `SettingsPanel.tsx` (一階) and `HelpMenu.tsx` 帳號 section (二階): one-tap action that combines (a) clear local sync tables + meta migration-choice keys, (b) sign-out, (c) open sign-in modal. Original 「登出」 stays as-is (preserves local per existing auth spec L35-43) but gains a tooltip: 「本地進度保留；若下次登入是不同 Google 帳號可能會被詢問如何處理」.

3. **Last-signed-in user tracking**: `db.meta` adds `last_signed_in_user_id` key, written on every successful auth state change to `'authed'`.

### Bug 1 fix — race-resistant gate computation

4. **Dexie hydration guard**: `computeGateState()` awaits an explicit hydration signal (`db.players.get('p1')` plus 100ms settle delay) before reading state for gate decision.

5. **Post-decision re-evaluation**: if gate lands in `'fresh-start'` or `'silent-pull'` AND a local write occurs within 5 seconds of that decision, re-run gate once. This catches the slow-hydration race where the player object materializes just after the initial decision.

6. **DEV-mode console logging**: `useSync` logs `[sync.gate]` events (compute-start / compute-end / state-change / cancellation-fired) gated behind `import.meta.env.DEV` so future race investigations have a trace.

### Bug 3 fix — mobile banner layout

7. **Banner mobile reflow contract**: at viewport `< 640px`, the sync paused banner SHALL stack vertically (status text on its own row at full width, action button below, email pill collapsed to ☁️ icon-only with tap-to-expand). Specifically: the status text row MUST be at least 200px wide to prevent per-character wrap.

### P1 observability bundle

8. **Sync status chip** in app header (both apps): visible icon reflecting engine state — 🟢 已同步 (last push/pull < 60s) / 🟡 同步中 (in-flight) / 🔴 同步失敗 (last attempt errored) / ⚪ 離線 / ⏸ 已暫停. Tap opens detail popover with last-synced timestamp + Force Push / Force Pull buttons.

9. **Sync error toast**: when a push or pull fails twice in a row (not just once — exponential backoff still applies), a non-blocking toast shows 「同步失敗：[reason]。資料安全保留在本機。點此重試」. Replaces the current `console.warn`-only behavior.

10. **`__sync.diagnose()` DEV method**: appended to existing `globalThis.__sync` debug surface. Returns `{ gateState, lastPushAt, lastPullAt, queueDepth, recentErrors, lastSignedInUserId, currentUserId, dbRowCounts }` for one-call console copy-paste into bug reports.

11. **Bug report `sync_metadata` field**: `bug_reports` table gains optional `sync_metadata JSONB` column; auto-context modal adds checkbox (default checked) that captures `__sync.diagnose()` output at submission time. Snapshot is captured even in production (no DEV-gate on the bug-report path — only on the global handle).

### Cross-app

12. All twelve changes apply to both `apps/medexam-tw` (一階) and `apps/medexam2-hospital-tw` (二階). Shared logic lives in `packages/core/src/lib/sync/` where possible; per-app glue stays in the respective `src/lib/sync/`.

## Impact

### Affected specs

- **`auth`**: ADDED 2 requirements (account-switch detection + 「切換帳號」 settings entry). Existing "Sign-out preserves local" stays unchanged.
- **`cloud-sync`**: MODIFIED 1 requirement (paused-banner mobile reflow). ADDED 4 requirements (race-resistant gate, sync status chip, error toast, `__sync.diagnose()`).
- **`bug-reporting`**: MODIFIED 1 requirement (auto-context fields list adds `sync_metadata`).

### Affected code (both apps unless noted)

- `src/lib/auth/AuthContext.tsx` — last-signed-in tracking, no signOut change (per existing spec)
- `src/lib/sync/migration.ts` — hydration guard, post-decision re-evaluation, account-switch helper
- `src/lib/sync/useSync.ts` — DEV log gating, error toast emit, race-resistant gate flow
- `src/lib/sync/engine.ts` — `diagnose()` method
- `src/lib/sync/account-switch.ts` (NEW) — clearLocalSyncTables() + clearMigrationChoiceKeys()
- `src/components/AuthButton.tsx` + `SyncStatusChip.tsx` (NEW) — status chip UI
- `src/components/AccountSwitchPrompt.tsx` (NEW) — account-switch modal
- `src/components/SettingsPanel.tsx` (一階) / `HelpMenu.tsx` (二階) — 「切換帳號」 entry + tooltip on 「登出」
- `src/styles.css` (both apps) — mobile sync banner reflow rules
- `src/services/bug-report.ts` (both apps) — capture `sync_metadata` from `__sync.diagnose()`
- `supabase/migrations/0008_bug_reports_sync_metadata.sql` (NEW) — add JSONB column

### Schema / data migration

- Supabase: one new migration adds `bug_reports.sync_metadata JSONB NULL`. Idempotent. No backfill needed.
- Dexie: `db.meta` adds `last_signed_in_user_id` key. No schema version bump (meta is generic key-value).
- No breaking changes to `cloud-sync` table schemas.

### Behavior changes / edge cases

- Existing signed-in users: no behavior change unless they sign out and sign in with a different account.
- Users who already saw the migration / conflict modal and resolved: no re-prompt; their choice keys remain valid (per-userId scope).
- Offline users: `account-switch` flow requires online verification of cloud row count → if offline, modal falls back to "online check pending" state and defers until reconnection.
- Mobile race fix is best-effort: 100ms settle delay should cover 99%+ of mobile cold-load timings, but pathologically slow devices may still race. The re-evaluation guard (5s window) catches the remaining tail.

### Bundle impact

Estimated +6 KB gzipped per app (status chip + account-switch modal + diagnose method + error toast wiring). Acceptable; well under the 1 MB total target.

### Out of scope (deferred to follow-up `harden-sync-observability` change)

- Persistent sync activity log (last 100 ops in Dexie)
- Manual Force Push / Force Pull as standalone buttons in settings (preview tap-popover only this round)
- Periodic reconciliation (visibility-change full pull)
- Per-device tracker
- "Send diagnostic" one-tap button (uses sync_metadata snapshot only this round)
- Two-device E2E test harness
- Conflict log table (server-side)
- Row-count drift checker

These are all valuable but expanding scope risks delaying the user-facing bug fixes. Triage decision: ship the bug fixes + P1 observability now, follow up with P2 observability in next change.
