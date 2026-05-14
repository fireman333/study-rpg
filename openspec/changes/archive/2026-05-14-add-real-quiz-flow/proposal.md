## Why

App 目前 "模擬答對" / "模擬答錯" 按鈕只是 stub — 不顯示題目、不消費 418 題藥理庫存（雖然 build script 已輸出 `public/content/medexam-tw/questions.json`）。玩家 vibe-check 不到「真的在做考古題」感覺，content pack 等於虛擬資產。

本 change 把 quiz 從 stub 升級為**真實題目顯示 + 答題 → 即時 feedback + 詳解 + reward**。MVP scope：daily practice 模式 5 題（不限時、不算 SRS），點開答完關閉。Mini-boss / SRS / 計時 boss 留 M2。

## What Changes

- **Load content pack at mount**：`apps/medexam-tw/src/App.tsx` 用 `getContentPack()` from `@study-rpg/content-medexam-tw` 抓 `questions.json` + `subjects.json` + `meta.json`，存 React state
- **New component `QuizModal.tsx`**：
  - 接 `questions: Question[]` + `subject?: SubjectId`
  - 隨機抽 5 題（or N，後續配置）
  - 每題渲染：題幹 + 4 個 MCQ option（A/B/C/D）
  - 點 option → 立即 feedback（綠✓ / 紅✗）+ 顯示 `### 詳解` markdown
  - 顯示「下一題」按鈕 → 進下一題；最後一題 → 「完成」按鈕關閉
  - 答完 5 題回 App，trigger existing `answerQuiz(correct)` × N（保留 +XP + 屬性 + 抽卡 loop）
- **Replace stub buttons**：「✓ 模擬答對 / ✗ 模擬答錯」改成 「📚 開始答題（5Q 藥理）」 → 開 QuizModal
- **保留 Mini-boss stub**：仍保留 stub 形態（30Q 模擬通關），M2 升級為真實 boss UI
- **非 breaking**：所有既有 reward / loot / equip flow 不動

## Capabilities

### New Capabilities
- `quiz-runner`: 從 content pack 抽題、渲染 MCQ、收答、即時 feedback、串到 reward

### Modified Capabilities
（無）

## Impact

- **Files**: `apps/medexam-tw/src/App.tsx`（fetch + state + button replace）、`apps/medexam-tw/src/components/QuizModal.tsx`（新）、styles.css（modal + feedback states）
- **APIs**: 無 breaking
- **Dependencies**: 無新增；`@study-rpg/content-medexam-tw` 已在 workspace
- **Cost**: 0 — 純 client-side
- **Tests / verify**: Chrome MCP — 確認 questions.json fetch、modal 開啟、5 題 cycle、詳解顯示、答完 reward 入帳
- **Risks**: 詳解 markdown 渲染（含換行、option 字典 reference）若 raw 顯示會醜；MVP 先 plain text + `white-space: pre-line`，M2 加 marked / react-markdown
- **Out of scope**: 計時、SRS 出題優先、跨 session 答題歷史 — 全部 M2
