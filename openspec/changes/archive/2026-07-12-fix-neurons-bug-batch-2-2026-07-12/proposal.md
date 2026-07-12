# fix-neurons-bug-batch-2-2026-07-12

Second L2 batch for four dogfood bug reports (Supabase `bug_reports`, `app = neurons-tw`,
filed 2026-07-12 after the first batch's morning snapshot). Two are real fixes in this repo;
**two were already resolved by the `add-neurons-exam-prep-hub` rework** that shipped to prod
later the same day — they were filed against the pre-hub `/cram` UI.

## Why

| # | Supabase id | Severity | Symptom | Disposition |
|---|---|---|---|---|
| 1 | `5f51ad1b` | minor · explanation-error | `109-2-醫學一-生物化學-Q87` 選項 B 簡答稱「PPP 第一期產生 2 莫耳 CO₂」 | **fix here** (content) |
| 2 | `d893a4f9` | annoying · feature-request | 排名 settings 仍寫「手動上傳是雲端同步未接前的暫時做法…日後接上 cloud sync 後自動推送」，但 cloud sync 早已接上 | **fix here** (copy) |
| 3 | `68d5da1c` | minor · feature-request | 考前猜題 tab 的「考前講義(beta)」按鈕與 subtab 重複 | **superseded** by `add-neurons-exam-prep-hub` |
| 4 | `99a89b2f` | annoying · visual-glitch | 考前猜題第一列按鈕排版（「五分鐘速看版」右對齊） | **superseded** by `add-neurons-exam-prep-hub` |

### Root causes / findings

1. **Wrong CO₂ count.** The PPP oxidative phase produces **1 CO₂ per glucose-6-phosphate** (with
   2 NADPH). Q87's own main 詳解 states this correctly (「第一期──產生 2 個 NADPH、1 個 CO2」),
   but the AI-generated per-option 簡答 for B said「僅產生 2 莫耳 CO₂」— internally contradictory and
   factually wrong. The 考選部 answer (C) is unaffected: B is a distractor (「5 莫耳 CO₂」) either way.
2. **Stale leaderboard copy.** Auto-push IS wired — `useSync.onPushComplete → autoPushLeaderboardOnSync`
   upserts an opted-in player's row after every successful cloud-sync push (covered by
   `leaderboard-autopush.test.ts`). The settings-panel sentence (and a matching code comment) still
   described the manual button as an interim measure「未接前的暫時做法」, misleading players into
   thinking sync was not yet connected.
3–4. **Filed against the pre-hub UI.** Both were filed against commits `1c63bb94` / `8f8f649f`
   (morning/noon). The `add-neurons-exam-prep-hub` rework (`edd0cde8`, 19:38, now on prod `main`
   `db18fdcf`) folded the 考前 surfaces into a subject-led hub — it removed the standalone `/cram/handout`
   subtab (so there is no subtab for the button to duplicate) and deleted the `.cram-action-row` button
   group (「五分鐘速看版」is now a standalone full-width card). Both structures the reports describe no
   longer exist (verified: 0 hits for `cram-action-row` / `handoutEntryBtnStyle` / the 3rd subtab).

## What Changes

1. **Content:** `option-explanations.generated.json` — `109-2-醫學一-生物化學-Q87` option B 簡答
   「PPP 第一期僅產生 2 莫耳 CO₂，非 5 莫耳」→「PPP 氧化期每莫耳葡萄糖僅產生 1 莫耳 CO₂，非 5 莫耳」.
   Source question untouched → `sourceHash` stays valid (no re-sync). Rebuild merges it into
   `questions.json` (answer C unchanged; 4600/4600 simplified explanations merged).
2. **Copy:** `LeaderboardSettingsControls.tsx` — reword the settings sentence to
   「排行榜會在每次雲端同步後自動更新；此按鈕可立即手動觸發一次。」and update the matching stale code comment.
3–4. **No code change** — closed as resolved-by-superseding-change (`add-neurons-exam-prep-hub`);
   marked `fixed` in the local bug-queue ledger.

## Impact

- **Affected specs:** `neurons-leaderboard` — one ADDED requirement pinning the settings copy to the
  live auto-push behavior (the existing「Push leaderboard row」requirement body + `leaderboard-autopush.test.ts`
  already describe auto-push on `onPushComplete`; only the copy — and that requirement's stale「(deferred)」
  framing — lagged). Additive, so no existing requirement is restated. Bugs #1/#3/#4 need no spec delta
  (a single corpus data value; two superseded-by-shipped-change with nothing to restate).
- **Affected code:** `packages/content-neurons-tw/provenance/option-explanations.generated.json`
  (+ rebuilt `dist`), `apps/neurons-tw/src/components/LeaderboardSettingsControls.tsx`.
- **No schema / sync / migration.** No Dexie / R2 / SYNCED_META_KEYS change. Answer keys untouched.
- **Verification:** typecheck clean; `1149/1149` vitest; content rebuild verified (Q87 answer C,
  corrected B); prod smoke post-deploy.
- 二階 / medexam2 unaffected (separate repo).
