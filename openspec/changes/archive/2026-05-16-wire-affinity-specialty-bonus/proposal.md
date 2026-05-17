## Why

`wire-hospital-specialty-bonus` (archived 2026-05-16) 把 tier-based specialty multiplier 接上 mastery — 同科 partner 答對時 `mastery.correct += rarity-tiered multiplier`（P1 = 1.5、P5 = 1.05）。但 affinity 累積（控制 recruitment banner 解鎖）走的是另一條 path，目前**永遠 +1 / 不分 partner rarity**。同一個 `recordCorrectAnswer` transaction 內，mastery 跟 affinity 對「同科 rare partner」的反應不對稱 — 玩家看 mastery 數字跳 1.5 但 affinity 還是 +1，會直覺問「那 partner 對 recruitment 進度有幫助嗎？」答案目前是 No，違反「rare 同科 doctor 全方位加速 hospital growth loop」的設計意圖。

## What Changes

- **新 capability `affinity-specialty-bonus`**：定義 affinity 增量也套 tier-based multiplier 的 mechanic
- **Multiplier source**：**重複利用** `packages/content-medexam2-tw/src/specialty.ts` 的 `SPECIALTY_MATCH_MULTIPLIER` 表 + `getSpecialtyMultiplier()` helper — **不新增 table、不新增 enum、不複製 constants**（單一 source of truth，dogfood tuning 只動一個檔）
- **套用範圍擴張**：`recordCorrectAnswer` 內現有 multiplier 計算結果同時傳給 affinity upsert
  - `affinity.correctCount` 從 int 變 float（schema `number` JS native 雙精度、無 migration、跟 `wire-hospital-specialty-bonus` 對 mastery.correct 的處置一致）
  - Wrong answer 永不影響 affinity（既有 spec by recruitment-gacha 保留：affinity never decrement）
  - Cross-subject partner 仍 `+1.0`（multiplier = 1.0、與既有行為等價）
  - No-partner correct 仍 `+1.0`（同上）
- **Recruitment threshold 不動**：閾值仍是現有 integer（10 / 25 / 50 等）；float affinity vs int threshold 比較 JS native 處理；rare 同科 partner 解鎖更快是有意 gameplay 改動
- **顯示精度**：`RecruitmentBanner` 顯示 affinity 改為 `Math.round(affinity * 10) / 10`（同步 mastery percentage 的 game-y feel — 看得到「3.5 / 10」、清楚 bonus 在 accumulate）；integer 值仍顯示 integer（不強加 `.0`）

## Capabilities

### New Capabilities

- `affinity-specialty-bonus`: 二階 hospital mode 的 affinity 累積套 tier-based specialty multiplier mechanic（含顯示精度規則）

### Modified Capabilities

無。本 change 純 additive — `hospital-specialty-bonus` Req 3「Mastery-only application scope」會被本 change 隱含 superseded，但**不改既有 spec 文字**（archive 紀錄不可動）；新 capability `affinity-specialty-bonus` 的 Requirements 直接覆蓋執行行為，main spec 兩者並存代表「mastery + affinity 都套 multiplier」的最終真值。

## Impact

**Code**:
- `apps/medexam2-hospital-tw/src/lib/mastery.ts` — `recordCorrectAnswer` 既有 `multiplier` 計算複用；`db.affinity.put` 從 `+ 1` 改為 `+ multiplier`
- `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx` — `{affinity}` 顯示改 `Math.round(affinity * 10) / 10`（integer 仍顯示 integer）

**Schema**: 無變動（`affinity.correctCount` 已是 JS `number` = double float；pre-existing int 自然升 float）

**Dependencies / APIs**: 無新增 npm package；`@study-rpg/core@0.2.0` API surface 不擴張；`packages/content-medexam2-tw` 不新增 export（純復用既有 `SPECIALTY_MATCH_MULTIPLIER` / `getSpecialtyMultiplier`）

**Gameplay**:
- 同科 P1 partner 連續答對：affinity 從 +10 達標變成 +6.7 達標（10 / 1.5 = 6.67）→ banner 解鎖快 ~33%
- 同科 P5 partner 連續答對：affinity 從 +10 達標變成 +9.52 達標（10 / 1.05）→ 解鎖快 ~5%
- Cross-subject / no-partner：完全不變
- 是否需要重新校準 threshold：**本 change 不動**，留待 dogfood telemetry（與 `wire-hospital-specialty-bonus` mastery > 100% 一起觀察）

**Out-of-scope cross-refs**:
- Cluster-aware matching（內科 cluster 部分加成）— 仍待 `extend-specialty-cluster-match` 獨立 change
- Mastery > 100% UI cap — 仍待 `polish-mastery-percent-cap` 獨立 change
- SRS interval × specialty bonus — 仍 locked OFF by `hospital-srs` Req 6
- XP rewards × specialty bonus — 不在本 scope，留下個 change
- Threshold 重新校準 — 等 dogfood 資料再決定
