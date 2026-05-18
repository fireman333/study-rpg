## Context

M4.5 shipped 2026-05-18 提供 in-app bug report pipeline，但兩個既有入口（一階 `SettingsPanel.tsx` 新 section、二階 `HelpMenu.tsx` 9th accordion）都在「答題情境外」。實測 dogfood 期間遇到 4 題 OCR / 詳解錯誤（醫四小兒科 22717s2 等），玩家答完往下 grind、忘記回頭走 settings 寫 report，最後是作者翻 git log 補修。Bug 回報 friction = (a) context-switch（離開 QuizModal）+ (b) 3 個必填 textarea。

`bug_reports` schema (migration 0004) 目前欄位：`id`、`user_id`、`app`、`category`（11 enum values）、`severity`、`what_doing`、`what_happened`、`what_expected` (NULL ok)、`reproducibility` (NULL ok)、`contact` (NULL ok)、`opt_in_followup`、`route`、`game_state` JSONB、`app_version`、`commit_sha`、`user_agent`、`viewport` JSONB、`recent_console_errors` JSONB、`submitted_at`、`status`。

四個 stakeholder：
1. **玩家**（一階 / 二階 dogfooder）— 想 30 秒內回報、不離開答題情境
2. **作者（owner）** — 看 Supabase dashboard SQL 處理回報，未來想加「同題 ≥3 回報自動 flag」需要 `question_id` 欄位
3. **OpenSpec workflow** — `bug-reporting` capability 純擴展、不破壞既有 SettingsPanel/HelpMenu 入口
4. **未來的 fork 開發者**（M3 起 `@study-rpg/core` npm 公開）— inline report 概念是 quiz engine-level pattern，應放 core 的 type 但 UI 留在 app

## Goals / Non-Goals

**Goals:**
- 答題情境內 30 秒完成回報（4 顆 radio + 1 行打字 + 送出）
- 自動 attach 完整 question context（question_id、subject、year、selectedOption、correctAnswer、disputed、hasImage、inMockExam）讓作者不用追問
- 玩家不能 opt out question context（這是 inline 入口的核心，沒了就跟 settings 入口一樣）
- 不破壞既有 SettingsPanel / HelpMenu 入口（regression-free）
- Schema 變動最小（1 個新欄位 + 1 個 index）

**Non-Goals:**
- 不做 dedupe / auto-triage 邏輯（先存進 DB，dashboard SQL 手動查）
- 不做截圖上傳（既有 spec 已標 follow-up）
- 不在 inline sheet 內提供完整 11 textarea 的 opt-out UI（要 opt out → 走「展開完整表單」）
- 不對 explanation / option 提供 user-contributed edit（純回報、不修）
- 不上 cloud sync（bug_reports 不在 LWW sync 範圍）

## Decisions

### D1: Lightweight `QuizBugReportSheet` vs reuse `BugReportModal`

**Decision**: 新做 `QuizBugReportSheet` component（兩 app 各一份），不重用 `BugReportModal`。

**Why**:
- `BugReportModal` 是 11-category radio + severity + 3 textarea + 6 opt-out checkbox 的全功能表單，玩家在答題中途撞到一行錯誤就要走完整流程 friction 太高。
- Sheet 是「縮減版子集」：4 個 target radio（自動 map 到 category）+ 1 行 textarea + 自動 attach（無 opt-out UI）。玩家想要完整 UI → 「展開完整表單」按鈕觸發 `setShowFullModal(true)` 開既有 `BugReportModal`，bridging 不是 friction。
- 兩個 component 各自的 props / state 簡單，避免在一個 component 內維護 inline / full 兩種 mode 的條件渲染複雜度。

**Alternatives considered**:
- (a) BugReportModal 加 `mode: 'inline' | 'full'` prop — 拒：增加既有 component 的測試表面、且 inline mode 的「不能 opt out」邏輯跟 full mode 衝突。
- (b) 只用 inline sheet、不提供 escape hatch — 拒：少數玩家可能想填完整 3 段，斷掉 fallback 路徑不友善。

### D2: Schema migration 0007（新欄位）vs JSONB-only

**Decision**: 走 migration 0007，新增 `question_id text NULL` 欄位 + `bug_reports_question_id_idx` B-tree index。

**Why**:
- 未來 `/bug-reports` skill 或 dashboard SQL 要做「同題重複回報」aggregation 時，`question_id` 是 first-class column 走 index 快、SQL 簡單（`GROUP BY question_id HAVING count(*) >= 3`）。
- JSONB extract（`game_state->>'question_id'`）需要 GIN index 才快、且 SQL 不直觀。
- Schema 變動成本：1 個 `ALTER TABLE` + 1 個 `CREATE INDEX`、無 data migration（既有 row `question_id` 留 NULL）。
- `bug_reports` 不在 cloud sync LWW 範圍，schema 變動不影響 `upsert_lww` whitelist。

**Alternatives considered**:
- JSONB-only — 拒（理由如上）。
- 同時新增 `bug_subtype text` enum 欄位（`question` / `image` / `explanation` / `simple`）— 拒：跟 `category` 重疊（3 個新 category 已表達 target），多一欄純冗餘。

### D3: Category enum 擴張（11 → 14）

**Decision**: 新增 3 個 category values（`question-error`、`image-broken`、`explanation-error`），既有 `other` 重用為「簡答其他意見」。

**Why**:
- 4 個 inline target option 各 map 到 1 個 category，dashboard SQL `WHERE category = 'image-broken'` 找所有圖片回報。
- 「簡答」走既有 `other`，不污染 enum 也保留語意（玩家透過 settings 入口選 `other` 也是同樣意思）。
- 14 個 category 對 11 個玩家手選的入口仍 fits 一個 radio group（既有 SettingsPanel 入口照樣顯示全 14）。

**Alternatives considered**:
- 完全新做 `bug_target` enum 跟 `category` 並存 — 拒（D2 同邏輯，欄位冗餘）。
- 不擴張 enum、4 個 target 都 map 到 `other` 然後在 `what_happened` prefix `[題目]` / `[圖片]` 等 — 拒：dashboard SQL filter 困難、未來 dedupe 也卡。

### D4: Question context attach — 不可 opt out

**Decision**: 透過 inline sheet 送出的 row，`question_id` 欄位永遠寫入；`game_state` 永遠包含 `subject` / `year` / `selectedOption` / `correctAnswer` / `disputed` / `hasImage` / `inMockExam`。UI 不顯示 opt-out checkbox。要 opt out → 走「展開完整表單」走 `BugReportModal`。

**Why**:
- Inline 入口的核心價值就是「我在這題遇到問題」— 把 question_id 拿掉跟走 settings 入口同樣 friction，違背 design intent。
- 既有 spec「Auto-attached context with per-field opt-out」保留 — 那條規範的是 `BugReportModal` UI（settings/help-menu 入口）；inline sheet 走獨立 UI、獨立 spec requirement。
- 一般 auto-context（`app_version` / `commit_sha` / `route` / `user_agent` / `viewport` / `recent_console_errors`）走預設 on，不顯示 checkbox 但 backend 永遠 attach（同 settings 入口的 default state，少了 opt-out UI）。

**Alternatives considered**:
- 加 toggle「不附上題目資訊」— 拒：把 inline 入口降級成 settings 入口的子集，沒提供新價值。
- 完全不顯示「展開完整表單」escape hatch — 拒：偶爾玩家確實想 opt out 整段 context（例：suspicion 是 supabase auth state、不想送 game_state），保留 fallback。

### D5: Mock exam 期間的 🐞 行為

**Decision**: Mock exam 期間 🐞 icon **仍可用**，但 sheet 開啟時：(a) 自動 attach `game_state.inMockExam = true`；(b) sheet 內顯示 inline notice「模擬考進行中，送出後可繼續答題」（不暫停 stopwatch、不影響 SRS enqueue）。

**Why**:
- Mock exam mode 是「壓力測試 + 進度紀錄」情境，但題目本身有錯誤是普世問題不該因 mode 不能回報。
- 模擬考 stopwatch 暫停成本（要重新 init / 紀錄 paused_at）大於收益，且 sheet 操作 < 30 秒，stopwatch 多跑這段時間影響很小。
- `inMockExam` flag 進 game_state，作者 dashboard 看到時可判斷「這題在模考模式被回報、優先 fix」。

**Alternatives considered**:
- 模考期間 disable 🐞 icon — 拒：見上方理由。
- 模考期間自動暫停 stopwatch — 拒：成本高、且玩家可能恰好用 sheet 期間「想一下」，不該被當作答題思考時間。

### D6: Component duplication across 2 apps vs promote to `@study-rpg/core`

**Decision**: `QuizBugReportSheet` UI component 在兩 app 各維護一份；只把 `QUIZ_BUG_TARGETS` const + `QuizBugTarget` type + `submitQuizInlineBugReport()` payload type 提到 `@study-rpg/core`。

**Why**:
- UI 風格（pixel font、CSS variables、color theme）跟 host app theme pack（`theme-pixel-medical` vs `theme-pixel-hospital`）強耦合，promote 到 core 會逼 core 引入 React 視覺依賴、違反 core 「content-agnostic」契約。
- Const + type 是純資料、無 React 依賴，放 core 共用零成本（`@study-rpg/core@0.2.0` 已 npm publish，可直接 export 新 type）。
- 兩 app QuizModal 已是 87% 不同實作（一階靠 reading session、二階靠 hospital tycoon），sheet 也跟著 diverge 是合理的、不是過早 abstraction。

**Alternatives considered**:
- 整個 `<QuizBugReportSheet />` 進 core — 拒：違反 core content-agnostic 契約、且兩 app theme variable 系統不同。

### D7: `category` enum 擴張的 schema enforcement

**Decision**: Postgres `bug_reports.category` 用 `text` + check constraint（既有 schema 設計）；migration 0007 同步 `ALTER TABLE bug_reports DROP CONSTRAINT bug_reports_category_check; ADD CONSTRAINT bug_reports_category_check CHECK (category IN (...));`。前端 TS const `BUG_REPORT_CATEGORIES` 同步擴張到 14 個值。

**Why**:
- Check constraint 是 enum 的最後一道防線（防前端 bug 寫入無效值）。
- 三個新值（`question-error` / `image-broken` / `explanation-error`）必須在 constraint 內，否則 inline submit 直接被 Postgres 拒。
- Migration 把 DROP + ADD 放同個 migration 內、確保原子性。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Migration 0007 失敗（Supabase 上 `bug_reports` table 不存在或 schema drift） | 先 manual 跑一次 `supabase db push`、檢查 dashboard 看到新欄位；TS code 用 try/catch 包 `submitQuizInlineBugReport()` 失敗時降級到「展開完整表單」並 fallback insert（`question_id` 不寫但 row 仍進） |
| 玩家誤觸 🐞 中斷答題 flow | 🐞 icon 放右上角、size 24px（不會誤點區）+ 第一次 click 後 sheet 是 modal（不是 popover），ESC / 點外面 dismiss |
| Inline sheet 送出後玩家想改 — 既有 BugReportModal 也不支援 edit（資料一進 supabase 就 immutable）| 送出後顯示「已送出 ✓ 感謝你！」3 秒 toast，重複 click 🐞 開新 sheet（每次 send 一筆新 row，dashboard side dedupe） |
| `question_id` 在 `question_history` table（hospital-quiz spec）vs `bug_reports.question_id` 命名衝突 | 兩個 column 在不同 table、無 join 衝突；`bug_reports.question_id` 只是 metadata（不是 FK），未來想 join 用 application-level SQL OK |
| Category enum 從 11 → 14 後 dashboard SQL 既有 query 可能漏掉新 3 個 value | 既有 query（`/bug-reports` skill 還沒實作）都用 `category IN (...)` 寫 enum list 風險低；既有 BugReportModal 的 11 個 radio UI 也擴張到 14 個，settings 入口同步可用 |
| Sheet 開啟時 reading session timer / hospital tycoon idle tick 仍在跑 | 設計如此（D5）— 不暫停 game state，sheet 操作 < 30 秒影響可忽略 |
| 兩 app code drift（一份 sheet / 兩份維護）| 透過 `@study-rpg/core` export `QUIZ_BUG_TARGETS` const + `QuizBugTarget` type 保證 enum 一致；UI drift 可接受（D6） |

## Migration Plan

**Phase 1 — Schema**:
1. 在 `~/coding-scratch/study-rpg-m2/supabase/migrations/0007_bug_reports_question_id.sql` 新增 migration（`ALTER TABLE` + `CREATE INDEX` + `DROP CONSTRAINT` + `ADD CONSTRAINT`）
2. 跑 `supabase db push`（或 paste 進 dashboard SQL editor）
3. 用 sanity SQL 確認新欄位 + index 存在：
   ```sql
   \d+ public.bug_reports
   select indexname from pg_indexes where tablename = 'bug_reports';
   ```

**Phase 2 — Core types**:
4. `packages/core/src/types.ts` export `QUIZ_BUG_TARGETS` const + `QuizBugTarget` type
5. `packages/core/src/index.ts` re-export
6. `pnpm --filter @study-rpg/core build`
7. Bump `@study-rpg/core` to `0.3.0`（minor，因為 add new export 非 breaking），publish 走 M3 既有 release pipeline（或暫時 workspace:* 開發 + 後續 archive 時 publish）

**Phase 3 — App wiring**:
8. 兩 app `services/bug-report.ts` 新增 `submitQuizInlineBugReport()` 函式
9. 兩 app 新做 `QuizBugReportSheet.tsx`
10. 兩 app `QuizModal.tsx` 加 🐞 button + sheet state hook
11. 兩 app `BUG_REPORT_CATEGORIES` const 擴張到 14 個值（既有 BugReportModal 同步取得新 radio）
12. `pnpm -r typecheck` 全綠

**Phase 4 — Verify**:
13. 一階 dev server `pnpm --filter @study-rpg/medexam-tw dev`，Chrome MCP smoke：登入 → 開 quiz → 點 🐞 → 4 個 radio 顯示 → 選「題目本身」+ 打字 + 送出 → Supabase dashboard 看到新 row
14. 二階 dev server `pnpm --filter @study-rpg/medexam2-hospital-tw dev`，Chrome MCP smoke：同上
15. 未登入 regression：登出 → 點 🐞 → 看到 sign-in gate
16. 既有 SettingsPanel / HelpMenu 入口 regression：開 settings → 點「💬 回報問題 / 建議」→ BugReportModal 仍正常顯示（已包含 3 個新 category radio）
17. Mock exam regression（二階）：進 mock exam → 點 🐞 → sheet 開、stopwatch 不暫停、送出後 stopwatch 持續、`game_state.inMockExam = true`

**Rollback strategy**:
- Phase 2-3 code 可純 git revert + `pnpm install` rollback
- Phase 1 schema 不需要 rollback（新欄位 NULL 對既有 SettingsPanel/HelpMenu 入口透明、check constraint 擴張對既有 row 兼容）
- 如真要 rollback schema：`DROP INDEX bug_reports_question_id_idx; ALTER TABLE bug_reports DROP COLUMN question_id;`，但因為新 row 已寫入 `question_id` 會 lose data，不建議

## Open Questions

無 — D1~D7 已涵蓋既知決策。Mock exam 行為（D5）若 dogfood 不符預期，後續開 follow-up change 調整（例如 `disable-bug-report-during-mock-exam`）。
