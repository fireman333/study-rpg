## 0. Apply-time content checks (DONE — findings recorded)

- [x] 0.1 `q.meta.session` IS populated: session 1 = 2400 Q, session 2 = 2200 Q across years 104–115. 次別 dimension works.
- [x] 0.2 Sort key: all 4600 ids end `-Q<n>` AND `q.meta.qNumber` (number) + `q.meta.paper` (`medexam-1`/`medexam-2`) present. Sort = (paper, qNumber) → 醫學一 then 醫學二, ascending qNumber.
- [x] 0.3 **Set size = 200 per (year, session)**, NOT 100 — each sitting = 醫學一 (100) + 醫學二 (100). (Owner's "100題" = one book.) Implemented as the whole sitting (200) per "全部題目"; milestone clamps (3–15 / 6–30) stay sane. Book sub-split is an easy follow-up if the ~100 grain is wanted.

## 1. Pure pool + coverage helpers

- [x] 1.1 `buildExamSetExpeditionPool(pool, history, year, session)` in `expedition.ts` — filter year+session, exclude answered (`questionHistory`), sort (paper, qNumber). Empty ⇒ complete.
- [x] 1.2 `examSetCoverage(pool, history, year, session) → {answered, total}`.
- [x] 1.3 `listExamPapersWithCoverage(pool, history) → ExamPaperCoverage[]` (year desc, session asc, `complete` flag) for the picker.

## 2. Picker + 遠征選單 UI

- [x] 2.1 出征 button → 遠征選單 chooser (always enabled): 錯題遠征 (disabled when wrongCount===0, shows count) + 年份回數遠征. Removed the now-orphaned `expeditionButtonDisabledStyle`.
- [x] 2.2 Year + 次別 picker stage: each (year, 次別) row shows `已答 X/Y` + ✓完成 (disabled when complete). Reuses warm-palette modal styles.
- [x] 2.3 New `expeditionMenu: 'closed'|'choose'|'exam'` + `examSelection` state, mutually exclusive with `quizEntry` / `expeditionOpen` / `quickReviewActive`.

## 3. Launch + reward wiring

- [x] 3.1 Paper select → `examSetPool` (unanswered, ordered); QuizModal opens only when non-empty (`examSelection && examSetPool.length > 0`), `preserveOrder`, `onComplete={onExpeditionComplete}`.
- [x] 3.2 Reuses `onExpeditionComplete` → `creditExpeditionDraws` (no new reward code); `total` = opened pool size, shared expedition-axis daily cap.

## 4. Tests

- [x] 4.1–4.3 `exam-set-expedition.test.ts` (7 tests): filter year+session, exclude answered, sort 醫學一→醫學二, empty when complete, no cross-sitting leak, coverage, paper-list ordering + complete flag + metaless degradation.
- [x] 4.4 No Dexie migration test needed — zero `.version()` bump; `lint:dexie-fixtures` stays a no-op.

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw test` — 400/400 (incl. new 7).
- [x] 5.2 `pnpm -r typecheck` clean; `pnpm lint:dexie-fixtures` no-op (no schema bump).
- [x] 5.3 Chrome MCP smoke (DEV, sync paused for safety, owner save untouched): 出征 → 遠征選單 (錯題 17題 + 年份回數); 年份回數 → picker (23 papers, `已答 X/200`, 年 desc/次 asc); pick 115 第1次 → drill opens at 第 1/199 題 · 解剖學 (excludes the 1 already-answered; 醫學一-first, not shuffled); 結束 without answering → questionHistory unchanged (27). No console errors.
