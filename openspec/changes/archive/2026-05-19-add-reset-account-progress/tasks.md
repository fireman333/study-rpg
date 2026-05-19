## 1. Sync hook — 一階 (medexam-tw)

- [x] 1.1 In `apps/medexam-tw/src/lib/sync/useSync.ts`, add `safeResetAccountData(): Promise<void>` that guards on `user` + `getSupabase()` non-null, then runs snapshot → `delete_my_data` RPC → `clearLocalSyncTables(db)` → `setResolveTick(t => t + 1)` in order. Abort with thrown error if RPC returns `error`.
- [x] 1.2 Confirm `snapshotLocalToBackup` import path and signature match the version used in `safeAccountSwitch` (same `(db, userId, reason)` arity). Reuse the existing `'reset-account-data'` reason tag.
- [x] 1.3 Expose `safeResetAccountData` in the hook's return object alongside `safeAccountSwitch` / `signOutWithFlush`.

## 2. Sync hook — 二階 (medexam2-hospital-tw)

- [x] 2.1 In `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts`, mirror the 一階 implementation against the hospital Dexie schema (`getHospitalDB()` / `__hospitalDb`).
- [x] 2.2 Verify the hospital-side `clearLocalSyncTables` skips `local_backup` (per `lib/sync/account-switch.ts`); confirmed via transaction-scope read — the wipe tx lists only the 10 sync tables + `meta`, never `localBackup`.
- [x] 2.3 Expose `safeResetAccountData` in the hook's return object.

## 3. UI — 一階 SettingsPanel

- [x] 3.1 In `apps/medexam-tw/src/components/SettingsPanel.tsx`, add an `onResetProgress: () => Promise<void>` prop.
- [x] 3.2 Render a 「重置此帳號進度」 button in the 資料管理 section between Export and 刪除雲端資料. Disabled when `email === null` or `status === 'disabled'`.
- [x] 3.3 Implement the two-layer gate inline: `window.confirm` with wipe summary + safety disclosure, then `window.prompt('請輸入 RESET 確認重置：')` with exact-string check.
- [x] 3.4 On success, surface info text `'進度已重置'` via existing `withBusy` helper; on mismatch / cancel, surface `'已取消'` (or `'已取消（未輸入 RESET）'`).
- [x] 3.5 Wire `onResetProgress={safeResetAccountData}` in `apps/medexam-tw/src/App.tsx`.

## 4. UI — 二階 HelpMenu

- [x] 4.1 In `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`, add a new accordion entry `account-reset` (icon ♻, title 「重置此帳號進度」) at the end of `SECTIONS`.
- [x] 4.2 Two-layer gate with hospital category labels (醫院經營 tier / 收益 / 聲望, 醫師名冊, 答題紀錄, 命運卡與抽卡保底, SRS 卡片排程, 收藏題目).
- [x] 4.3 Disable the in-section button when `!signedIn || !onResetProgress || accountResetting`; tooltip explains which guard fired.
- [x] 4.4 Accept `onResetProgress` + `signedIn` as props from `App.tsx` (HelpMenu does not call `useSync` itself — adding a second `useSync()` would spawn a duplicate engine; design.md decision 6 covers this).

## 5. Verification

- [x] 5.1 `pnpm -r typecheck` clean (after rebuilding `@study-rpg/core` per cold-checkout note in project CLAUDE.md).
- [x] 5.2 Dev server boot — both apps serve without console errors. 一階 on `:5173/study-rpg/`, 二階 on `:5174/study-rpg/hospital/`. Only pre-existing React Router future-flag warnings, no errors.
- [x] 5.3 Chrome MCP smoke (non-destructive) — 二階 HelpMenu opens, accordion entry visible at section 11, expand reveals body + disabled reset button with correct "請先登入 Google 帳號" tooltip. 一階 boot clean; SettingsPanel modal requires sign-in to surface, so visual verification deferred to 5.4 below.
- [ ] 5.4 (user-driven) Chrome MCP destructive path — sign in to a throwaway test account, populate at least one row (answer one question), click reset, accept both layers. Verify (a) `__hospitalDb.localBackup.count()` increased by 1; (b) cloud row count for that user_id in Supabase dashboard is 0 across all sync tables; (c) local sync tables are empty; (d) chip flips to `⚪ 待同步`; (e) user remains signed in (AuthButton still shows the avatar).
- [ ] 5.5 (user-driven) Cloud-delete-fail path — temporarily simulate RPC failure (e.g., revoke the RPC permission in the SQL editor for the test session, or stub `supabase.rpc` to throw) and confirm local stays intact + error is surfaced.
- [x] 5.6 `/simplify` 3-agent review. Findings applied: trimmed 2× JSDoc to keep only WHY (invariant), trimmed 1× inline WHAT-comment in 一階 hook, fixed `err as Error` → `err instanceof Error`. Skipped two larger flags (redundant state collapse, withBusy lifting) as semantically distinct / premature abstraction respectively. Typecheck still green post-edits.
- [x] 5.7 `/opsx:verify` clean — 0 CRITICAL / 0 WARNING / 0 SUGGESTION. 21/26 tasks done, 5 deferred (user-driven 5.4/5.5 + self-referential 5.7 + post-verify 5.8/6.x). 1/1 requirement implemented; all 5 scenarios mapped to code; all 6 design decisions followed. `openspec validate --strict` ✓.
- [x] 5.8 `/verify` Step 1c clean — both dev servers boot, 一階 page renders (player Lv.7, 3291 questions loaded, no console errors), 二階 already-verified HelpMenu accordion entry. Dead-code audit skipped (no linter configured per project conventions); manual orphan check via diff confirms 22 references to new identifiers (all declarations wired to call sites). `/simplify` Step 2 already executed in apply pipeline. Step 3 commit gated to user confirmation.

## 6. Archive + sync

- [ ] 6.1 `/opsx:archive add-reset-account-progress` (uses the slash workflow with sync gate, not raw CLI).
- [ ] 6.2 Commit on `track-m2` with message tagged `affects: both` per project.md merge protocol.
- [ ] 6.3 `cd ~/coding-scratch/study-rpg && git merge track-m2` to bring the feature into `main`; push both branches.
