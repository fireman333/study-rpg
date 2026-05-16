## Why

二階 hospital mode 的 quiz UI（archived: `wire-hospital-quiz-ui`）在 `questionHistory` table 預留 `nextDueAt / interval / easeFactor` 三個 SM-2 欄位但**沒接 scheduler** — 每次答題 mastery 累積、但 user 永遠看不到「該複習了」訊號。對 6066Q × 14 科的考前準備 horizon，sustainable retention 仰賴 SRS surface 把舊題拉回。本 change 接上 scheduler、把預留欄位變成可運作的 due queue。

## What Changes

- **Binary SM-2 scheduler 落地**：答對/答錯後依 SM-2 公式更新 `interval / easeFactor / nextDueAt`；standard SM-2 expansion (1d → 6d → ×EF) on correct、partial reset (interval ×0.5、EF ×0.85) on wrong（偏離 Anki harsh "again" 為 dogfood-tunable 養成 game 取捨）
- **Due queue surface — banner badge + due-first picker**：每個 subject banner 旁顯示「🔴 N due」chip（N = 該科今日可做 due cards，cap 後）；點 banner 開 quiz modal 時 picker 先吐 due queue，due 用完 fallback 既有 `pickRandomQuestion` 新題流
- **Global daily cap = 20**：每日所有 subject 加總最多 surface 20 張 due card，overflow carry forward 隔天；round-robin 跨 subject 分配，避免單科獨佔
- **SRS / mastery 維持獨立 metric**：mastery (`hospital-mastery` capability) 仍記 cumulative correct rate；SRS 純讀寫 questionHistory 三欄；UI 上 banner 顯示「掌握 X%」+「🔴 N due」兩個 chip 並列
- **Specialty match 1.5× reward 不在本 change scope**（留下一個 change `wire-hospital-specialty-bonus` 處理；本 change 純接 SRS baseline）
- **不需要 schema migration**：v4 已預留全部三個欄位，純讀寫既有 column；無 v4 → v5 升版

## Capabilities

### New Capabilities

- `hospital-srs`: 二階 hospital mode 的 binary-input SM-2 scheduler + due queue surface（含 daily cap、跨 subject round-robin、banner badge、due-first picker）

### Modified Capabilities

無。一階 `srs-queue` capability 保持 archived；`hospital-quiz` / `hospital-mastery` / `hospital-scene` 完全不動 — 本 change 純 additive。

## Impact

**Code**:
- `packages/core/src/lib/srs.ts` — 新增 binary helper export (e.g. `reviewCardBinary({ correct, prev })`)，不動既有 `reviewCard()` 一階用的 0-5 quality API
- `apps/medexam2-hospital-tw/src/lib/srs-scheduler.ts` — **新增**，daily cap logic + round-robin queue 組裝
- `apps/medexam2-hospital-tw/src/lib/mastery.ts` — 修改 `recordCorrectAnswer` / `recordWrongAnswer` 接 scheduler 算 `nextDueAt / interval / easeFactor`（原本寫 null / 0 / 2.5）
- `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` 或對應 banner component — 加 due count fetch + 「🔴 N due」chip render
- `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` — picker 串接 due queue（due 有 → due-first；due 用完 → fallback `pickRandomQuestion`）

**Schema**: 無變動（v4 已預留欄位夠用）

**Dependencies / APIs**: 無新增 npm package

**Out-of-scope cross-refs**:
- Specialty match 1.5× reward — 留下個 change `wire-hospital-specialty-bonus`
- 跨 subject due 總覽 standalone `/#/review` route — dogfood backlog > 50/天 時再 propose 升 hybrid surface
- Mastery-aware SM-2 adaption — 留未來 polish change（與本 change Independent 決策一致）
