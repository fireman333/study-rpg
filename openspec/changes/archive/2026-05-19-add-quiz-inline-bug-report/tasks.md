## 1. Schema migration

- [x] 1.1 在 `supabase/migrations/0007_bug_reports_question_id.sql` 寫 migration：`ALTER TABLE bug_reports ADD COLUMN question_id text NULL` + `CREATE INDEX bug_reports_question_id_idx ON bug_reports (question_id) WHERE question_id IS NOT NULL`
- [x] 1.2 同一個 migration `DROP CONSTRAINT bug_reports_category_check` + `ADD CONSTRAINT bug_reports_category_check CHECK (category IN (...14 個 values...))`
- [x] 1.3 跑 `supabase db push --linked` 推 0007 到 remote（CLI 確認 `Applying migration 0007_bug_reports_question_id.sql... Finished supabase db push.`）
- [x] 1.4 `supabase migration list --linked` 顯示 `0007 | 0007` 已同步；migration 內 SQL 是 transactional `BEGIN/COMMIT`，遠端落地代表 column + index + constraint 三件套都進去了
- [x] 1.5 Sanity INSERT 等 live smoke 一起驗（answer 流程送出 inline report 時 category=`question-error` 會打進去；若 constraint 不允許會 throw 並寫進 sheet `submitError` UI）

## 2. Core types (`@study-rpg/core`)

- [x] 2.1 在 `packages/core/src/lib/bug-report-types.ts` export `QUIZ_BUG_TARGETS` const 陣列（types.ts 透過 lib/bug-report-types.ts re-export）
- [x] 2.2 export `QuizBugTarget` type 從上面 const derive
- [x] 2.3 export `QUIZ_BUG_TARGET_TO_CATEGORY` mapping const
- [x] 2.4 在 `packages/core/src/index.ts` re-export 上述三項 + `BUG_REPORT_CATEGORIES` 同步擴張至 14 個 value
- [x] 2.5 跑 `pnpm --filter @study-rpg/core build` 確認 dist 包含新 export（QUIZ_BUG_TARGETS / QuizBugTarget / QUIZ_BUG_TARGET_TO_CATEGORY 都出現在 d.ts）
- [x] 2.6 在 `packages/core/CHANGELOG.md` 加 entry：`0.4.0 — add QUIZ_BUG_TARGETS / QuizBugTarget / QUIZ_BUG_TARGET_TO_CATEGORY for inline quiz bug reports`（既有 0.3.0 為 tier4 scene 增訂，本次 bump 至 0.4.0）
- [x] 2.7 bump `packages/core/package.json` version 至 `0.4.0`

## 3. 一階 (`apps/medexam-tw`) wiring

- [x] 3.1 在 `apps/medexam-tw/src/services/bug-report.ts` 新增 `submitQuizInlineBugReport({ target, description, snapshot })` + `buildQuestionSnapshot()` + `QuizQuestionSnapshot` interface；payload 直接寫 `question_id` 欄位 + 合併 game_state（既有 buildAutoContext.game_state ⊕ snapshot）
- [x] 3.2 `BUG_REPORT_CATEGORIES` 已在 `@study-rpg/core` 集中擴張至 14 個值；一階 `BugReportModal` 內 `CATEGORY_LABEL` 補上 3 個新值的 Chinese label
- [x] 3.3 新建 `apps/medexam-tw/src/components/QuizBugReportSheet.tsx`：props `{ snapshot, onClose, onSubmitted, onEscapeHatch }`；4-radio target picker + 200-char textarea + 未登入 gate + 送出 + escape hatch
- [x] 3.4 在 `apps/medexam-tw/src/components/QuizModal.tsx` header `<div className="quiz-header-actions">` 內加 🐞 icon button + `bugSheetSnapshot` / `bugFullModalOpen` / `bugFullModalPrefill` state
- [x] 3.5 接 `<QuizBugReportSheet snapshot=... onClose=... onSubmitted=handleBugSubmitted onEscapeHatch=...>` + 同層 `<BugReportModal>` 接 escape hatch
- [x] 3.6 一階 `BugReportModal` 加 `initialCategory?: BugReportCategory` 與 `initialWhatHappened?: string` props；既有 SettingsPanel 呼叫不傳兩參數，行為不變
- [x] 3.7 加 CSS 到 `apps/medexam-tw/src/styles.css`：`.quiz-bug-trigger`、`.quiz-bug-sheet*`、`.quiz-bug-toast`、`.quiz-header-actions`

## 4. 二階 (`apps/medexam2-hospital-tw`) wiring

- [x] 4.1 在 `apps/medexam2-hospital-tw/src/services/bug-report.ts` 新增 `submitQuizInlineBugReport(...)` + `buildQuestionSnapshot()` + `QuizQuestionSnapshot` interface
- [x] 4.2 二階 `BugReportModal` 內 `CATEGORY_LABEL` 補上 3 個新值的 label（`BUG_REPORT_CATEGORIES` 14 值集中在 @study-rpg/core）
- [x] 4.3 新建 `apps/medexam2-hospital-tw/src/components/QuizBugReportSheet.tsx`（讀 hospital theme CSS variables `--bg-cream` / `--frame-wood-dark`）
- [x] 4.4 在 `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` 加 🐞 icon button + state hook + sheet/modal 接線
- [x] 4.5 既有 `BugReportModal`（二階）加 `initialCategory` / `initialWhatHappened` props
- [x] 4.6 Sheet 內偵測 `snapshot.inMockExam === true` 顯示 "模擬考進行中，送出後可繼續答題"（QuizModal entry 目前總是傳 false；MockRunner 入口為 follow-up change）

## 5. Game state snapshot

- [x] 5.1 `buildQuestionSnapshot(question, selectedOption, inMockExam)` helper 放在兩 app `services/bug-report.ts`（不放 QuizModal — 純資料 transform，跟 supabase service 同檔比較內聚）
- [x] 5.2 Sheet open 時透過 `setBugSheetSnapshot(buildQuestionSnapshot(...))` snapshot 一次；sheet 持有的是 immutable 值，玩家切下一題或 picker 改變不影響已 open 的 sheet
- [x] 5.3 `correctAnswer` 透過 `question.answer` 直接 attach（任何時點都讀得到，因為 Question.answer 是 content pack 內預先標好的；不揭曉給玩家 — 只進 `game_state` JSONB）

## 6. Type checks & smoke

- [x] 6.1 `pnpm -r typecheck` 全綠（7/7 projects done）
- [x] 6.2 `pnpm --filter @study-rpg/medexam-tw build` 全綠（一階 bundle 550 KB）
- [x] 6.3 `pnpm --filter @study-rpg/medexam2-hospital-tw build` 全綠（二階 bundle 760 KB）
- [x] 6.4 一階 dev server 啟動，Chrome MCP smoke：登入 → 開 quiz → click 🐞 → 4 個 radio 顯示 → 選「題目本身」+ 打字 + 送出 → Supabase dashboard 看到新 row（`category=question-error`、`question_id` 有值、`game_state` 含 `selectedOption` / `correctAnswer`）
- [x] 6.5 二階 dev server 啟動，Chrome MCP smoke：同 6.4
- [x] 6.6 未登入 regression：登出 → 開 quiz → click 🐞 → 看到 sign-in gate（不是 form）
- [x] 6.7 既有 SettingsPanel 入口 regression（一階）：登入 → 開 settings → 點「💬 回報問題 / 建議」→ BugReportModal 開、14 個 category radio 都顯示
- [x] 6.8 既有 HelpMenu 入口 regression（二階）：登入 → 開 help menu → 9th accordion → 點 open-modal button → BugReportModal 開、14 個 category radio 都顯示
- [x] 6.9 Escape hatch flow：sheet 內選 target + 打部分字 → 點「展開完整表單」→ BugReportModal 開、category 預填、`what_happened` 預填
- [x] 6.10 Mock exam regression — N/A for QuizModal scope（MockRunner 是一階獨立 route，本 change 範圍只動 QuizModal；MockRunner 內的 🐞 wiring 留給 follow-up change `add-inline-bug-report-from-mock-runner`）

## 7. Docs & archive prep

- [x] 7.1 更新 `docs/BUG_REPORTING.md` 新增「Inline quiz bug report」章節（UI flow / target → category mapping / game_state shape / question_id column / mock exam / severity default / follow-up changes）
- [x] 7.2 更新 `openspec/project.md` Roadmap，在 M4.5 行加備註「+ inline 🐞 (2026-05-19)」+ 指向本 change folder
- [x] 7.3 跑 `openspec validate add-quiz-inline-bug-report` 全綠
- [x] 7.4 跑 `/verify` 跑 end-to-end check（Chrome MCP + dead code audit + simplify）
- [x] 7.5 等使用者 explicit confirmation 再跑 `/opsx:archive`（curator rule — 不自動 commit / archive）
