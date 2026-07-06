## Why

考前焦慮的高峰在「今天做完了、但還是覺得不夠」的那一刻。今日處方箋卡已經把「還要做什麼」收斂成兩件小事，但完成後缺一個把玩家自己累積的正向足跡「收束」給他看的安心面 —— 一個不談還缺什麼、只映照已固化成果、並溫柔許可今晚休息的收尾儀式。這是 handoff backlog 的 flagship「化解考前焦慮」形態（Idea 3, P2 頂級），設計已透過 `/grill quick` + Codex (gpt-5.5) 會診逐字鎖定 guardrail 文字。

## What Changes

- **新增 考前收斂 calm view**：一個 dayComplete-gated 的被動安心面板，從今日處方箋卡既有的「考前？」區塊展開，只在**當日處方箋兩線都完成後**浮現（未完成者看不到 → 天然無空狀態、無缺口占位）。
- **內容（精瘦版 — 只放卡片尚未顯示的新內容；逐字鎖定，只渲染正向、無分母）**：
  - 覆蓋計數（**唯一新訊號**）：「你已答對過 **{M}** 個高頻考點的題目。」（cram 考點 ∩ questionHistory `lastResult==='correct'` 的**去重考點數**，無覆蓋率/分母/「還差」）
  - 非行動性收尾句（無 CTA）：「今晚可以停在這裡，讓連結慢慢固化。」
  - 卡片既有的「已固化 X 天」（`completedDayCount`）與 NG-0717 分支 buds **不在 calm view 內重述**（避免 Codex 警告的「數字堆疊成就牆」）。
- **情緒定位**：純被動展示 + 一句收尾語，**零 CTA**（不把安心面變回任務感/deficit）。
- **誠實 build-time lint**：比照既有 cram validator，對 calm view 的**靜態文案字面**加禁詞守衛（連續 / 掌握 / 覆蓋 / 覆蓋率 / % / X/Y / 還差 / 剩下 / 保證 / 必中 / 今年一定考 / 「會派上用場」）。動態插入的只有純數字 `{N}/{M}/{K}`，永不插入分母。

## Capabilities

### New Capabilities
<!-- 無新 capability：calm view 是今日處方箋卡的 dayComplete 收束延伸，落在既有 neurons-daily-prescription。 -->

### Modified Capabilities
- `neurons-daily-prescription`: ADDED 一條 考前收斂 calm view requirement（dayComplete-gated、被動、逐字文案、只正向無分母、零 CTA），以及高頻考點覆蓋計數的 derived 定義。

## Impact

- **程式碼**：
  - `apps/neurons-tw/src/components/DailyPrescriptionCard.tsx` —— dayComplete 時於「考前？」區展開 calm view（新 collapse 子狀態，device-local）。
  - 新 derived helper（pure）：cram push items ∩ consolidated question ids → 覆蓋考點去重計數；card 透過 hook/prop 取得（維持 card presentation-only 契約）。
  - `apps/neurons-tw/src/__tests__/` —— calm-view 覆蓋計數純函式 + 文案禁詞測試。
  - 既有 cram build validator（或新增 calm-copy lint）—— 對 calm view 靜態文案加禁詞守衛。
- **Spec**：`openspec/specs/neurons-daily-prescription/spec.md`（ADDED 1 requirement）。
- **零風險面**：無 Dexie schema、無 R2 SCHEMA_VERSION、無 sync allowlist、無新 meta key、無新對外資產。純 derived（completedDayCount + getImprints + questionHistory ∩ cram）+ 既有卡片的收束延伸。
- **設計來源**：`~/.claude/scratch/grilled-neurons-cram-calm-view-2026-07-06.md`（grill + Codex 會診結論）。
