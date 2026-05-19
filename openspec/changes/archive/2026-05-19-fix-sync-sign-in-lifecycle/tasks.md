## 1. Account-switch detection — schema + helpers

- [ ] 1.1 `apps/medexam-tw/src/lib/sync/account-switch.ts` (NEW): export `clearLocalSyncTables(db)`, `clearMigrationChoiceKeys(db, userId?)`, `getLastSignedInUserId(db)`, `setLastSignedInUserId(db, userId)`
- [ ] 1.2 Mirror in `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` adapted for HospitalDB tables (`hospital_state`, `hospital_doctors`, `hospital_mastery`, `hospital_question_history`, `question_bookmarks`)
- [ ] 1.3 `db.meta` key `last_signed_in_user_id` SHALL persist across page reloads; existing meta accessor pattern from migration.ts is the template
- [ ] 1.4 `clearLocalSyncTables` SHALL clear ALL synced tables (NOT just player) AND SHALL clear `db.meta` keys whose key matches pattern `migration-choice:*`; preserves non-sync tables (e.g., cosmetic preference UI state if any)

## 2. AccountSwitchPrompt modal

- [ ] 2.1 `apps/medexam-tw/src/components/AccountSwitchPrompt.tsx` (NEW): renders 3-option modal (清空本地、保留本地合併、取消登出)
- [ ] 2.2 Mirror in `apps/medexam2-hospital-tw/src/components/AccountSwitchPrompt.tsx`
- [ ] 2.3 Wire into App.tsx render tree (gated on `accountSwitchDetected === true`); placement above existing MigrationUploadPrompt / ConflictChooserModal in z-stack so it always shows first
- [ ] 2.4 「清空本地」 path: calls `clearLocalSyncTables` + `setLastSignedInUserId(current)` → engine restarts with fresh-start gate
- [ ] 2.5 「保留本地」 path: calls `setLastSignedInUserId(current)` only → engine proceeds to existing conflict-chooser flow
- [ ] 2.6 「取消登出」 path: calls `supabase.auth.signOut()` immediately, no data touched
- [ ] 2.7 Show both side timestamps (max `updated_at` from local rows + cloud row count from a single `select count(*)` per table) to inform decision

## 3. Account-switch detector wired into useSync

- [ ] 3.1 In `apps/medexam-tw/src/lib/sync/useSync.ts` effect, BEFORE `computeGateState()` call: read `last_signed_in_user_id`; if non-null AND differs from current → setState `accountSwitchDetected = true` AND `gateState = 'pending'` (does not run gate yet)
- [ ] 3.2 Mirror in 二階 useSync.ts
- [ ] 3.3 After AccountSwitchPrompt resolves: clear `accountSwitchDetected` flag → useSync effect re-runs → gate computes from the now-correct local state
- [ ] 3.4 `VITE_ACCOUNT_SWITCH_DETECTOR` env flag (default true) — when false, detector is bypassed (rollback safety)

## 4. 「切換帳號」 menu entry

- [ ] 4.1 `apps/medexam-tw/src/components/SettingsPanel.tsx`: add 「切換帳號」 button below 「登出」; tooltip 「清空本地進度後重新登入；適合借用裝置或換主帳號」
- [ ] 4.2 「登出」 button gains tooltip 「本地進度會保留；下次若用不同帳號登入會詢問如何處理」
- [ ] 4.3 「切換帳號」 click handler: confirm dialog → `clearLocalSyncTables` → `signOut` → close panel → open AuthButton sign-in modal
- [ ] 4.4 Mirror in `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` 帳號 section

## 5. Gate race fix

- [ ] 5.1 In `apps/medexam-tw/src/lib/sync/migration.ts` `computeGateState`: prepend `await db.players.get('p1')` and `await new Promise(r => setTimeout(r, 100))` before existing `hasNonDefaultLocalState()` call
- [ ] 5.2 Mirror in 二階 migration.ts (use `db.hospital_state.get('h1')` or equivalent canonical row)
- [ ] 5.3 In `apps/medexam-tw/src/lib/sync/useSync.ts` after gate decision: if decided state ∈ {`fresh-start`, `silent-pull`}, install a 5-second Dexie subscription on `db.players` that re-runs `computeGateState` once if a write occurs in window; cancel subscription on unmount / sign-out / state change
- [ ] 5.4 Mirror 二階 with HospitalDB hospital_state subscription
- [ ] 5.5 Debounce re-eval: only one re-eval per 5s window even if multiple writes fire
- [ ] 5.6 DEV-mode console logging: `console.log('[sync.gate]', { phase, state, ... })` for compute-start / settle-end / decision / re-eval / cancellation events; gated behind `import.meta.env.DEV`

## 5.5 Cold-start force-pull (M3b — added 2026-05-19 after player report)

- [x] 5.5.1 `apps/medexam-tw/src/lib/sync/engine.ts`: add `COLD_START_FORCE_PULL_THRESHOLD_MS = 60 * 60 * 1000` constant
- [x] 5.5.2 In `engine.start(uid)`: detect `_lastPullAt === null OR Date.now() - _lastPullAt > threshold` → call `pullAllNow({force:true})` else fall back to existing `pullNow()`
- [x] 5.5.3 Mirror in 二階 engine.ts
- [x] 5.5.4 Add `cloud-sync` spec Requirement「Cold-start force-pull bypasses incremental cursor」+ 3 scenarios
- [ ] 5.5.5 Smoke test: simulate stale `_lastPullAt` via `localStorage.setItem('study-rpg.sync.lastPullAt', String(Date.now() - 2 * 3600 * 1000))` → reload → confirm pullAllNow fires (not pullNow)

## 6. Engine diagnose method

- [ ] 6.1 In `apps/medexam-tw/src/lib/sync/engine.ts` add public `getDiagnosticSnapshot(): SyncDiagnostic` method
- [ ] 6.2 Snapshot includes: gateState, authStatus, currentUserId, lastSignedInUserId, lastPushAt, lastPullAt, queueDepth, recentErrors (ring buffer last 5), dbRowCounts (per synced table via `count()`)
- [ ] 6.3 Add `recentErrors` ring buffer state to engine (max 5 entries; push on every failed op; oldest evicted)
- [ ] 6.4 DEV `globalThis.__sync.diagnose = () => engine.getDiagnosticSnapshot()` in factory's DEV branch
- [ ] 6.5 Mirror in 二階 engine.ts
- [ ] 6.6 Type `SyncDiagnostic` exported from `packages/core/src/types.ts` (cross-app shared shape)

## 7. Sync status chip UI

- [ ] 7.1 `apps/medexam-tw/src/components/SyncStatusChip.tsx` (NEW): renders icon based on engine status; tap opens popover with last-synced timestamp + Force Push + Force Pull buttons
- [ ] 7.2 Mirror in 二階 SyncStatusChip.tsx (uses 二階 engine + auth context)
- [ ] 7.3 Mount in header next to AuthButton; only renders when authStatus === 'authed' (hidden when unauthed)
- [ ] 7.4 States: 🟢 已同步 / 🟡 同步中 / 🔴 同步失敗 / ⚪ 離線 / ⏸ 已暫停 — derive from engine.getStatus() polling at 1Hz
- [ ] 7.5 Tap-popover Force Push calls `engine.pushAllNow()`; Force Pull calls `engine.pullAllNow()`; popover dismisses on outside click

## 8. Sync error toast

- [ ] 8.1 In `apps/medexam-tw/src/lib/sync/engine.ts`: track consecutive error count per op type; on 2nd consecutive failure emit `sync:error` custom event with `{ op, table, message }`
- [ ] 8.2 Toast container in App.tsx subscribes to `sync:error` event; renders 「同步失敗：[reason]。資料安全保留在本機。點此重試」
- [ ] 8.3 Tap to retry: calls `engine.pushAllNow()` + `engine.pullAllNow()`; toast dismisses
- [ ] 8.4 Auto-dismiss after 10s; debounce: same error message doesn't re-toast within 60s
- [ ] 8.5 Mirror engine + toast in 二階

## 9. Mobile sync banner reflow

- [ ] 9.1 `apps/medexam-tw/src/styles.css`: add `@media (max-width: 639px)` block for `.sync-paused-banner` → `flex-direction: column; align-items: stretch`; for `.sync-paused-banner__text` → `width: 100%; min-width: 200px; white-space: normal`
- [ ] 9.2 `.auth-button__email` → `display: none` on mobile; new `.auth-button__email-collapsed` → `display: inline` showing ☁️ icon only; tap-handler opens SettingsPanel
- [ ] 9.3 Mirror in 二階 styles.css
- [ ] 9.4 Visual verify on iPhone-sized viewport via Chrome MCP (320px, 414px, 640px breakpoints): banner readable, no per-character wrap, status chip + AuthButton + banner all coexist without overlap

## 10. Bug report sync_metadata capture

- [ ] 10.1 Supabase migration `supabase/migrations/0010_bug_reports_sync_metadata.sql`: `ALTER TABLE bug_reports ADD COLUMN sync_metadata JSONB` (0008 + 0009 already used by `add-targeted-tickets`)
- [ ] 10.2 RLS policy unchanged (auth.uid() = user_id already covers reads)
- [ ] 10.3 `apps/medexam-tw/src/services/bug-report.ts`: import engine, call `engine.getDiagnosticSnapshot()`, attach to payload as `sync_metadata` when checkbox is checked
- [ ] 10.4 `BugReportModal.tsx` auto-context section: add 「同步診斷快照」 checkbox (default checked) describing what's captured
- [ ] 10.5 Mirror in 二階 services/bug-report.ts + BugReportModal
- [ ] 10.6 Apply migration to remote Supabase via `supabase db push` (gated on user explicit OK)

## 11. AuthContext changes

- [ ] 11.1 `apps/medexam-tw/src/lib/auth/AuthContext.tsx`: on `onAuthStateChange` → SIGNED_IN event, call `setLastSignedInUserId(db, session.user.id)` BEFORE notifying subscribers
- [ ] 11.2 Mirror in 二階 AuthContext.tsx
- [ ] 11.3 `signOut()` behavior unchanged (per existing auth spec L35-43 — preserves local data)
- [ ] 11.4 Export `last_signed_in_user_id` getter as React hook `useLastSignedInUserId()` for AccountSwitchPrompt + diagnose consumption

## 12. Spec deltas

- [ ] 12.1 `openspec/changes/fix-sync-sign-in-lifecycle/specs/auth/spec.md`: ADD 2 requirements (account-switch detection, 「切換帳號」 settings entry)
- [ ] 12.2 `openspec/changes/fix-sync-sign-in-lifecycle/specs/cloud-sync/spec.md`: MODIFY paused-banner mobile reflow (refine existing L173-187), ADD 4 requirements (race-resistant gate, sync status chip, error toast, diagnose snapshot)
- [ ] 12.3 `openspec/changes/fix-sync-sign-in-lifecycle/specs/bug-reporting/spec.md`: MODIFY auto-context fields list to include sync_metadata

## 13. Typecheck & build

- [ ] 13.1 `pnpm --filter @study-rpg/medexam-tw typecheck` green
- [ ] 13.2 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` green
- [ ] 13.3 `pnpm -r typecheck` green
- [ ] 13.4 `pnpm --filter @study-rpg/medexam-tw build` green
- [ ] 13.5 `pnpm --filter @study-rpg/medexam2-hospital-tw build` green
- [ ] 13.6 Bundle size delta < +10 KB gzipped per app

## 14. Smoke testing — Chrome MCP

### Bug 2 — account-switch flow

- [ ] 14.1 Sign in as Account A, accumulate some local progress (answer 3 questions, gain XP)
- [ ] 14.2 Sign out via SettingsPanel 「登出」 → verify local data intact (player still has XP); tooltip visible
- [ ] 14.3 Sign in as Account B (different Google account) → verify AccountSwitchPrompt appears BEFORE migration/conflict modal
- [ ] 14.4 Pick 「清空本地」 → verify local sync tables cleared, gate state = fresh-start (or silent-pull if B's cloud has data)
- [ ] 14.5 Repeat 14.1, this time pick 「保留本地」 → verify gate falls through to conflict-chooser as before
- [ ] 14.6 Verify 「切換帳號」 menu entry works: clears local + signs out + reopens sign-in modal in one tap

### Bug 1 — gate race

- [ ] 14.7 In DEV mode, inject artificial 500ms delay into Dexie hydration, sign in, verify gate now correctly detects local state (was misclassifying before fix)
- [ ] 14.8 Verify `[sync.gate]` DEV logs trace the compute → settle → decision → re-eval timeline
- [ ] 14.9 Verify cancellation path doesn't drop modal: rapid sign-out-then-back-in within 1s; modal state should be consistent with final gate decision

### Bug 3 — mobile banner

- [ ] 14.10 Chrome MCP resize to 320px (iPhone SE), pause sync via conflict modal "Decide later", verify banner text reads horizontally, email collapses to ☁️ icon
- [ ] 14.11 Tap collapsed email → SettingsPanel opens with full email
- [ ] 14.12 Repeat at 414px (iPhone 14) and 640px (small tablet) — verify reflow transitions at breakpoint cleanly

### P1 observability

- [ ] 14.13 Trigger a forced sync error (e.g., disable Supabase URL env temporarily), verify SyncStatusChip turns 🔴 after 2nd failure, error toast appears
- [ ] 14.14 Tap toast retry → verify new push/pull attempt fires
- [ ] 14.15 In DEV console, call `__sync.diagnose()` → verify snapshot has expected shape
- [ ] 14.16 Submit a bug report with sync_metadata checkbox checked → verify row in `bug_reports` has populated `sync_metadata` JSONB
- [ ] 14.17 Submit a bug report with checkbox UNchecked → verify `sync_metadata IS NULL` in row

### Cross-app

- [ ] 14.18 Repeat 14.1-14.17 against 二階 (medexam2-hospital-tw) with HospitalDB

## 15. Verify

- [ ] 15.1 `openspec validate fix-sync-sign-in-lifecycle` green
- [ ] 15.2 Dead code audit: no orphan imports / unused state vars added
- [ ] 15.3 Bundle size diff measured and within budget
- [ ] 15.4 `/simplify` run on touched files; address any callouts
- [ ] 15.5 `/verify` end-to-end pass

## 16. Owner mobile verification (out of Chrome MCP reach)

- [ ] 16.1 Deploy hotfix to `https://fireman333.github.io/study-rpg/` via GitHub Pages
- [ ] 16.2 Owner verifies on real iPhone: sign in with second Google account, AccountSwitchPrompt appears; banner reads horizontally
- [ ] 16.3 Capture sync_metadata from a deliberate "broken sync" scenario (toggle airplane mode mid-session, check bug report)

## 17. Commit (gated)

- [ ] 17.1 User explicit confirm before `git commit`
- [ ] 17.2 Explicit `git add <paths>`; verify `git diff --cached --name-status` only contains this change scope (per multi_agent_git_safety.md — hotfix worktree shares .git with main + track-m2)
- [ ] 17.3 Commit message:
      ```
      fix(sync-sign-in-lifecycle): account-switch + mobile race + observability bundle

      Bug 1: gate race on mobile cold-load misclassified local-non-default
      as fresh-start; modal never fired. Fix: await Dexie hydration +
      100ms settle + 5s post-decision re-eval window.

      Bug 2: signOut() preserves local (per spec) but no account-switch
      flow existed; signing in with a different Google account silently
      treated old-account data as conflict candidate. Fix: detect
      last_signed_in_user_id mismatch at sign-in, prompt AccountSwitchPrompt
      before gate; add 「切換帳號」 menu that bundles clear+signout+signin.

      Bug 3: mobile sync banner collapsed Chinese text to per-character
      vertical wrap. Fix: CSS mobile reflow + collapse email pill to icon.

      P1 observability bundle (recurrence prevention): SyncStatusChip in
      header, error toast on 2 consecutive failures, __sync.diagnose() DEV
      method, bug_reports.sync_metadata JSONB column for triage.

      Both apps (一階 + 二階). Schema: one Supabase migration adds JSONB
      column. Dexie meta gains last_signed_in_user_id key (no schema bump).

      OpenSpec change: fix-sync-sign-in-lifecycle
      ```

## 18. Archive (deferred to user)

- [ ] 18.1 `/opsx:archive` after commit
- [ ] 18.2 Cherry-pick or merge commit to track-m2 worktree (cross-track sync per CLAUDE.md `git merge track-m2` protocol)
- [ ] 18.3 Push main to origin (gated on user explicit OK; never force-push)
