## 1. Bug #1 — biochem Q87 wrong CO₂ count (`5f51ad1b`, content)

- [x] 1.1 Verify against biochemistry + the question's own 詳解: PPP oxidative phase = 1 CO₂ + 2 NADPH per glucose-6-phosphate; 考選部 answer is C (B is a「5 莫耳 CO₂」distractor)
- [x] 1.2 Edit `packages/content-neurons-tw/provenance/option-explanations.generated.json` — `109-2-醫學一-生物化學-Q87` option B: 「僅產生 2 莫耳 CO₂」→「PPP 氧化期每莫耳葡萄糖僅產生 1 莫耳 CO₂，非 5 莫耳」
- [x] 1.3 Confirm `sourceHash` stays valid (only the generated output changed, not the source question) — no sidecar re-sync needed
- [x] 1.4 `pnpm run build:neurons-content`; assert built `questions.json` Q87 answer = C (unchanged), B 簡答 corrected, `option-explanations: merged 4600/4600`

## 2. Bug #2 — stale leaderboard settings copy (`d893a4f9`, copy)

- [x] 2.1 Confirm auto-push is live: `useSync.onPushComplete → autoPushLeaderboardOnSync` upserts opted-in rows after each sync push (`leaderboard-autopush.test.ts` covers it); the manual button legitimately remains
- [x] 2.2 Reword the settings `<p>` in `apps/neurons-tw/src/components/LeaderboardSettingsControls.tsx` to 「排行榜會在每次雲端同步後自動更新；此按鈕可立即手動觸發一次。」
- [x] 2.3 Update the stale file-header code comment that called the button an interim pre-cloud-sync trigger

## 3. Bug #3 & #4 — superseded by `add-neurons-exam-prep-hub` (`68d5da1c`, `99a89b2f`)

- [x] 3.1 Confirm both were filed against the pre-hub UI (commits `1c63bb94` / `8f8f649f`, both older than hub rework `edd0cde8`, now on prod `main db18fdcf`)
- [x] 3.2 Verify the reported structures are gone: 0 hits for `cram-action-row` / `cram-action-group` / `handoutEntryBtnStyle` / `speedReviewEntryBtnStyle`; bank subtabs are now `[題庫, 考前中心]` (no standalone 考前講義 subtab to duplicate); 「五分鐘速看版」is a standalone full-width card
- [x] 3.3 Mark `68d5da1c` + `99a89b2f` `fixed` (resolved-by-superseding-change) in the bug-queue ledger — no code change

## 4. Spec delta

- [x] 4.1 ADD `neurons-leaderboard` requirement pinning the settings copy to the live auto-push behavior (additive; no existing requirement restated)

## 5. Verify & ship

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw typecheck` green
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test -- --run` green (1149/1149)
- [x] 5.3 Mark all four `bug_reports` ids `fixed` in the ledger
- [ ] 5.4 Archive → merge `track-neurons` → `main` → push → CF Pages prod deploy → verify run green → prod smoke (leaderboard copy + Q87 content)
