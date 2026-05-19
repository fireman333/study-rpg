## Why

兩個 dogfood 回報合一個 batch hotfix（per `CLAUDE.md` § Bug Triage Workflow，L2 batch — 同子系統 / UX-only 修法）：

1. **命運卡仍鎖在醫學中心** — owner 表示他想讓玩家在更早 tier 就能抽，但目前 `FATE_TIER_UNLOCKED = new Set(['醫學中心', '國家級教學醫院'])` 仍 hardcode 在 `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx:35`，spec 也仍要求 gate。Endgame 「reputation 溢出 sink」的設計初衷其實在任何 tier 都成立（區域醫院的 reputation 也會溢出，因為 cap 不會隨 tier 縮放）；不需要 gate 在最後一階。
2. **急診照會 dialog 連續吃題** — owner 玩家回報「第一題還沒寫完，第二個照會就跳出來，第一個就不見；第二題寫完又自動跳掉，來不及看詳解」。Root cause 兩段：
   - (a) `ERConsultDialog.tsx:49-51` 的 `useEffect` 無條件用新的 `dbActive` 覆蓋 `sticky`。tick 在 `answerERConsult` 清掉 `erConsultActive` 後立刻可以 roll 下一題，新 active 直接蓋掉玩家正在讀的 Q1 解析。
   - (b) 答對 path 的 `setTimeout(onClose, 2000)`（line 129）只給 2 秒讀詳解，遠遠不夠 — 答錯 path 已經改成 user-dismissed（commit ff9db2b），答對 path 沒同步調整，造成體感不一致。

兩個都是純 UX bug、沒 schema migration、沒影響 sync engine、沒新 Supabase 表，適合單一 batch hotfix change。

## What Changes

**Bug 1 — 命運卡 ungate**：
- 移除 `FateCardPage.tsx` 的 `FATE_TIER_UNLOCKED` set + `tierUnlocked` 變數 + 鎖定 banner（lines 166-173） + 抽卡 button `disabled` 條件裡的 `!tierUnlocked` 與按鈕文字 `🔒 鎖定中`。
- 留 `insufficient`（聲望不足）gate — 這仍是合理的 client-side 防呆。
- 移除 `useMilestoneTips.ts` 的 `tier_unlocked_fate_cards` 提示（line 92-93）— tier 不再 unlock 任何東西。
- 移除 `hospital-tutorial` spec line 171 的「First time tier upgraded to 醫學中心 → 命運卡解鎖」milestone tip — 已不適用。
  - **本 change scope**：只 delta `hospital-fate-cards` spec 移掉 gate requirement；`hospital-tutorial` spec 的 milestone tip 變化 inline 在 code 修改不寫 spec delta（tutorial spec 本身的 milestone tip table 是 informative reference、非 testable scenario）。

**Bug 2 — ER 急診照會 dialog 修復**：
- `ERConsultDialog.tsx` 的 `useEffect` 加 guard：`if (dbActive && sticky === null) setSticky(dbActive)`。新 dbActive 在玩家還沒關閉當前 sticky 時不會覆蓋 — 等到 `onClose` 設 `sticky = null` 後，effect 重跑才會 adopt 下一題（deps 加上 `sticky`）。
- 移除 `setTimeout(onClose, 2000)`（line 129）。答對 path 改成 user-dismissed — 既有 `關閉` 按鈕在 line 253-264 已經對 `revealed === true` 都顯示，不需新增 UI。Toast 仍顯示獎勵 delta、跟 dialog 一起關閉。
- 對應 spec delta：
  - 改 line 147 描述「auto-close after 2 seconds」 → 「user-dismissed via 關閉 button」。
  - 改 Scenario "Correct answer dialog auto-closes after 2 seconds"（line 194-198） → "Correct answer dialog stays open until user clicks 關閉"。
  - 新增 Requirement / Scenario：「Dialog SHALL NOT replace the current sticky question while user has not closed」。

## Capabilities

### Modified Capabilities

- `hospital-fate-cards`: 移除 tier gate requirement + 2 scenarios（pre-醫學中心 不可達 / 醫學中心 才看到 nav）。命運卡在任何 tier 都可用，僅 reputation 不足會 block 抽卡。
- `er-consultation`: dialog lifecycle 兩處改：(a) 答對 path 從「2 秒 auto-close」改為「user 按 關閉」；(b) 新增「sticky 在玩家手動關閉前不會被新 active 覆蓋」requirement。

## Impact

**Code**:
- 改 `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx`（移除 5 個 gate-related code site）
- 改 `apps/medexam2-hospital-tw/src/lib/useMilestoneTips.ts`（移除 1 個 milestone tip block）
- 改 `apps/medexam2-hospital-tw/src/components/ERConsultDialog.tsx`（修 useEffect、移除 setTimeout）

**Schema**: 無

**Dependencies**: 無

**Spec deltas**:
- `openspec/specs/hospital-fate-cards/spec.md`：REMOVE 1 requirement + 2 scenarios（gate）
- `openspec/specs/er-consultation/spec.md`：MODIFY 1 requirement description + 1 scenario；ADD 1 requirement + 1 scenario（sticky guard）

**Not in scope**:
- Bug 3（110-2-醫學四-皮膚科-Q34 圖）— pending owner 視覺確認到底是 404 還是圖內容錯。Data + render path 已確認 OK。若圖內容錯，會另外開 `fix-q34-image` change 跑 re-extract。
- `hospital-tutorial` spec 的 milestone tip table 沒寫成 spec delta（informative table、非 testable scenario）；只在 code 改掉 useMilestoneTips.ts 對應 block。
