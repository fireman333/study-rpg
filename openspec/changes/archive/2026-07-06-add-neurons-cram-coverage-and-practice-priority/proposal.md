## Why

`/cram` 考前猜題目前是一份純誠實的高頻考點清單，讀起來是「還要讀什麼」的 deficit 視角，考前反而加重焦慮。同一份清單只要疊上玩家自己的足跡（哪些高頻考點已答對過），就能翻成「這些高頻考點我已掌握」的正向自證安心面 —— 零 schema、純 derived。

同時，上一個 change（`wire-neurons-cram-prescription-bridge`, D+C）讓「練考前高頻考點 → 推進今日處方箋」成為可見閉環，但因為 cram 練習池會被 QuizModal 洗牌，今日處方箋 snapshot 內的題被打散，「🩹 連結已固化」payoff 命中率低、示範時容易撲空。這兩件事都屬「讓 D 的正向訊號可靠可見」，共用 `questionHistory` 讀取，適合打包。

## What Changes

- **考點覆蓋正向印記（Idea 1, P1）**：考古清單每項若其 `sourceQuestionIds` 有 ≥1 題在 `questionHistory` 中 `lastResult === 'correct'` → 顯示低調的「✓ 已固化過」小 chip；未覆蓋項**什麼都不顯示**（無 chip、無灰占位、無 % / 分母 / 「還差幾題」）。純 derived（既有 `useQuestionHistory()`），零新 write path、零 meta key、零 Dexie schema。
- **cram 練習池 snapshot-first 排序（Idea 2, P2；修 risk #1）**：從 `/cram` 開練習時（section CTA 與抽屜「答 1 題看看」），建 pool 先 shuffle 再 stable-partition 把「今日處方箋 snapshot 內的題」排到最前，並對 `QuizModal` 傳 `preserveOrder` 讓排序不被再洗掉，使答前幾題就可靠 credit 今日處方箋、觸發既有 payoff。不動 snapshot / target、不注入新題；今日尚無 plan 時退回原 shuffle（零行為改變）。
- **兩處 spec 對齊（非行為變更）**：(1) on-ramp requirement 補一句 exception clause —— practice 仍不發 XP / gacha / game-streak，但會 credit 今日處方箋修煉（對齊 `wire-neurons-cram-prescription-bridge` 既有行為）；(2) nit —— spec 的 CTA 文字「練 N 題」同步為實作的「練幾題」。

## Capabilities

### New Capabilities
<!-- 無新 capability：兩個需求都落在既有 neurons-cram-tab capability 內。 -->

### Modified Capabilities
- `neurons-cram-tab`: ADDED 一條考點覆蓋正向印記 requirement（正向、無分母、無缺口占位的誠實約束）；MODIFIED on-ramp requirement —— 練習池 snapshot-first 排序、prescription-crediting exception clause、CTA 文字同步。

## Impact

- **程式碼**：
  - `apps/neurons-tw/src/routes/CramPage.tsx` —— coverage chip 渲染 + 練習池排序 + `preserveOrder`。
  - `apps/neurons-tw/src/lib/services/prescription.ts` —— 新增 read-only「今日 plan snapshot ids」accessor（只讀不建 plan；今日無 plan 回 null）。
  - `apps/neurons-tw/src/__tests__/` —— 新增 accessor + 排序純函式的 unit test。
- **Spec**：`openspec/specs/neurons-cram-tab/spec.md`（ADDED 1 requirement + MODIFIED on-ramp requirement）。
- **零風險面**：無 Dexie schema bump、無 R2 SCHEMA_VERSION 變動、無 sync allowlist 變更、無新 meta key、無新對外資產。純 client-side derived UI + 既有 pool 重排。
