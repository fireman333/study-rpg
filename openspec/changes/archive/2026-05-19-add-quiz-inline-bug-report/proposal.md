## Why

M4.5 既有 bug report 入口（一階 SettingsPanel、二階 HelpMenu 9th accordion）對玩家有兩個 friction：(1) 答題時遇到題目錯誤 / 圖片缺失 / 詳解矛盾，要離開 QuizModal 開 settings panel、context-switch loss 大；(2) 三個必填 textarea（`what_doing` / `what_happened` / `what_expected`）對「答案標 B 但詳解推 C」這種一句話就講完的情境太重，玩家寫到一半放棄。

dogfood 期間遇到 4 題明確 OCR / 詳解錯誤（醫四小兒科 22717s2 等）但因 friction 沒走完回報流程，後來靠 git commit 訊息追溯才修。把回報入口降到 QuizModal 內、單行說明 + question_id 自動 attach，預計把這類 in-context bug 的回報率從 ~10% 拉到 ≥ 60%。

## What Changes

- **QuizModal 加 🐞 icon 入口**（兩 app 各一份）— `apps/medexam-tw/src/components/QuizModal.tsx` + `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` 右上角加 icon button，未登入顯示登入 gate（與既有 BugReportModal 行為一致）。
- **新增 `QuizBugReportSheet` component**（兩 app 各一份）— 4 顆 radio（題目本身 / 題目圖片 / 詳解 / 簡答其他）+ 單行 textarea（200 字上限）+ 送出 + 「展開完整表單」escape hatch。
- **`bug_reports` schema 延伸**（Supabase migration 0007）— 新增 `question_id text NULL` 欄位 + `bug_reports_question_id_idx` B-tree index，未來 dashboard SQL 可直接 `GROUP BY question_id` 找重複回報的題目。
- **Category enum 擴張** — 新增 3 個 category values: `question-error`, `image-broken`, `explanation-error`；既有 `other` 重用為「簡答」入口。既有 11 個 category 不動，純 ADD。
- **Question context 自動 attach + 不可 opt out** — `question_id` 寫進新 schema 欄位；`subject` / `year` / `selectedOption` / `correctAnswer` / `disputed` / `hasImage` / `inMockExam` 寫進 `game_state` JSONB。玩家透過 inline sheet 入口時不能 opt out 這些（opt out 失去回報意義）；要 opt out 必須走「展開完整表單」走原本 BugReportModal 路徑。
- **既有 SettingsPanel / HelpMenu 入口不動** — 純 ADD 一條新入口，回歸測試確保兩個 app 既有入口仍可用。

## Capabilities

### New Capabilities

無 — 純擴展 `bug-reporting` capability。

### Modified Capabilities

- `bug-reporting`:
  - ADD requirement「Inline quick-report flow from QuizModal」+ scenarios
  - ADD requirement「Question context auto-attach (non-opt-out for inline flow)」+ scenarios
  - MODIFY requirement「In-app submission modal」— category enum 新增 3 個值；新增第三個入口（QuizModal 🐞）

## Impact

- **Schema 變動**：Supabase migration `0007_bug_reports_question_id.sql`（新欄位 + index）。`upsert_lww` 不需要動（bug_reports 不在 sync 範圍）。
- **新檔**：
  - `supabase/migrations/0007_bug_reports_question_id.sql`
  - `apps/medexam-tw/src/components/QuizBugReportSheet.tsx`
  - `apps/medexam2-hospital-tw/src/components/QuizBugReportSheet.tsx`
- **改動檔**：
  - `apps/medexam-tw/src/components/QuizModal.tsx`（+ 🐞 button + state hook）
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`（同上）
  - `apps/medexam-tw/src/services/bug-report.ts`（新增 `submitQuizInlineBugReport()` helper）
  - `apps/medexam2-hospital-tw/src/services/bug-report.ts`（同上）
  - `packages/core/src/types.ts`（新增 `QUIZ_BUG_TARGETS` const + `QuizBugTarget` type；export 給兩 app 共用）
  - `packages/core/src/index.ts`（re-export）
  - `docs/BUG_REPORTING.md`（新增 inline flow 章節）
- **不動檔**：
  - `apps/*/src/components/BugReportModal.tsx`（既有 modal 不動，僅作為「展開完整表單」escape hatch 重用）
  - `apps/*/src/services/console-error-buffer.ts`（buffer 在 app 啟動時 init，inline flow 沿用）
- **Out of scope（明確留給未來 change）**：
  - 自動 dedupe / triage 邏輯（先存到 DB 就好）
  - 截圖上傳（既有 bug-reporting spec 已標 follow-up）
  - 對 explanation / option 的 user-contributed inline edit
  - Mock exam 內的 🐞 行為 — design.md 釐清
- **驗收面**：
  - Chrome MCP smoke 兩 app 各跑一輪：點 🐞 → picker 顯示 → 選「題目本身」+ 打簡答 + 送出 → Supabase dashboard `bug_reports` 看到新 row（`category=question-error`、`question_id=<actual>`、`game_state` 含正確 metadata）
  - 未登入點 🐞 → 看到 sign-in gate
  - `pnpm -r typecheck` 全綠
  - 既有 SettingsPanel / HelpMenu 入口 regression 測試
