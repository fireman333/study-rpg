## Why

二階玩家回報希望有「錯題」功能 — 自動追蹤最近答錯的題、方便主動回頭翻閱複習。目前 SRS due queue 是「演算法推送」(今天該複習什麼)，沒有「玩家主動瀏覽自己答錯過什麼」的清單入口。手動 `/bookmarks` 雖然存在，但需要玩家在 quiz 中主動按 ★，許多答錯但忘記標的題就此沉沒。

新增一個自動進出的「錯題」清單，跟現有手動收藏並列為 `/bookmarks` 頁的兩個 tab — 解決上述 gap，同時用「ephemeral 自動追蹤 + 手動 promote 成永久收藏」的雙層設計，讓玩家在答錯當下就能決定是否要把這題釘成永久 reference。

完整設計釐清見 grill summary：`~/.claude/scratch/grilled-錯題功能設計-融入收藏題目-2026-05-19.md`。

## What Changes

- 新增「最近答錯題」清單：定義為 `hospital_question_history` 的 derived view (`WHERE lastResult = 'wrong'`)。玩家答錯一題 → 自動出現在清單；下次答對同一題 → 自動消失。狀態 = 最近一次 attempt 的結果翻轉。
- `/bookmarks` 頁從單一清單改為**雙 tab 結構**：`[手動收藏 | 錯題]`，預設 landing tab 為「手動收藏」。
- 錯題 tab 頂部固定一行 **helper text** 說明 ephemeral 性質（「下次答對會自動離開此清單」）+ 引導玩家「點任一題的 ★ 加入手動收藏」永久保留。
- `QuizModal` 的答錯回饋畫面新增 **inline ★ 按鈕**，讓玩家在當下決定是否將這題也加進「手動收藏」(自動已加入錯題清單、按鈕額外控制手動收藏狀態)。
- Dexie schema v11：`questionHistory` store 加 compound index `[lastResult+lastAnsweredAt]` 讓 read-time filter 用 index、無 full scan。
- **無 Supabase migration、無新 cloud table、無新 Dexie store** — 錯題清單純粹是 `hospital_question_history`（已 sync）的 derived view，cross-device「答對自動移除」透過 history sync 自然繼承。
- Scope **只做二階**(`apps/medexam2-hospital-tw`)；一階 `medexam-tw` 連手動收藏都沒做，本 change 不 port。

## Capabilities

### New Capabilities

- `wrong-answer-list`: 自動追蹤玩家在 hospital quiz 中最近答錯的題、提供瀏覽 + promote 到手動收藏 + 從 history 匯入 backfill 的能力。Spec 涵蓋 add/remove trigger 規則、tab UI、helper text 內容、backfill 按鈕語意、跟 SRS due queue 的 non-overlap 邊界。

### Modified Capabilities

- `question-bookmarks`: `/bookmarks` 頁 UI 結構從單清單擴成雙 tab。原本「列出所有 bookmark 行、最新在前」的需求調整為「在『手動收藏』tab 內列出 bookmark 行」；新增「tab 切換 / default landing tab / 兩 tab 共用 ExplanationMarkdown render」相關 scenario。
- `hospital-quiz`: `QuizModal` 答案揭曉區新增 inline ★ 按鈕（手動收藏 toggle）。錯題清單因走 derived view 路線（apply 階段 pivot 後決定），quiz 邏輯本身**不需新增 trigger** — 既有 `recordWrongAnswer` / `recordCorrectAnswer` 在 mastery.ts 寫 `lastResult` 進 history 已足夠驅動。

## Impact

**Code**:
- 新建 / 改檔 `apps/medexam2-hospital-tw/src/pages/BookmarksPage.tsx`（雙 tab 結構）
- 改 `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`（inline ★ 按鈕；無 trigger 新增）
- 改 `apps/medexam2-hospital-tw/src/db/schema.ts`（Dexie v11 加 questionHistory compound index）
- 新建 `apps/medexam2-hospital-tw/src/services/wrong-answers.ts`（useWrongAnswers live query helper）

**Schema**: **無 Supabase migration**（錯題清單是既有 `hospital_question_history` 的 derived view）

**Dependencies**: 無新 npm package；既有 Dexie / Supabase / React infra 足夠

**Smoke test (Chrome MCP)**: full 4-step path — answer wrong → 錯題 tab 出現該題 + helper 可見 → 按 ★ → 手動收藏 tab 也出現該題 → answer right → 錯題 tab 消失但手動收藏仍在

**No cloud cost impact**: 純 client-side derive，無 cloud table 額外負擔
