## Why

`hospital-management-mode` capability（spec locked 2026-05-15 via `add-hospital-mode-scaffold`）刻意把所有抽卡相關數值留白 — per-rarity drop weight、pity threshold、P2/P3/P4 powerMultiplier、per-subject affinity threshold — 全部標記「deferred to `wire-recruitment-gacha`」。`ingest-medexam2-tw-corpus` 已 ship（6066 Q / 14 科 / `subjects.json` 帶 per-subject totalQuestions），現在是 lock 這些數值、把抽卡 loop 接上、讓 M_2nd app 第一次「可玩」的時候。

本 change 把抽卡子系統接到 `apps/medexam2-hospital-tw/` — 14 科 banner UI、binary 親密度 gate、P1–P5 weight 表、保底機制、醫師卡 schema。沒有抽卡就沒有 doctor，沒有 doctor 後面 `wire-hospital-tycoon-engine` 沒東西可 tick。

## What Changes

- 新增 `packages/content-medexam2-tw/src/recruitment.ts`：14 科 banner 定義 + per-subject `threshold` 表（baseline 公式：`Math.ceil(subject.totalQuestions × 0.05)`，4–66 之間，所有 14 科明文列出 final value，無 runtime 計算）
- 在 `@study-rpg/core` 新增 generic gacha 介面 `lib/gacha.ts`（**不**改動既有 `lib/loot.ts` enum — 維持 `N/R/SR/SSR/UR` 不 break 一階 app）：
  - `rollGacha(catalog, stats, weights, opts)` — 跟 loot.ts 同 30/100 pity 邏輯，但 rarity tier 接受 generic string array 而非 hard-coded enum
  - 既有 `rollLoot` 在 loot 系統繼續用，改成 thin wrapper 呼叫 `rollGacha`（zero-diff for existing callers）
- 新增 capability `recruitment-gacha`：定義抽卡 contract（per-subject affinity counter / banner gate / P1–P5 weights / pity / 醫師卡 schema / ticket 消耗）
- `apps/medexam2-hospital-tw/` 新增：
  - `HomePage`（替換 placeholder「Hello, World」）顯示 14 科 banner grid + 親密度進度條 + 抽卡 ticket 數
  - `RecruitmentBanner` component — locked/unlocked 兩態 + roll button
  - `RecruitmentResultModal` — 抽卡動畫 + 詳情卡面
  - `DoctorRoster` page — 已招募醫師列表（佔位，不接 room assignment — 留 `wire-hospital-tycoon-engine`）
- `apps/medexam2-hospital-tw/` 新增 Dexie schema（version 1）：
  - `affinity` table（key: `subjectId`, value: `correctCount`）
  - `doctors` table（key: `id`, value: doctor instance）
  - `gachaStats` table（單列：`rollsSinceLastP2`, `rollsSinceLastP1`, `totalRolls`）
  - `tickets` table（單列：`available: number` — 初始 `10`，未來 `wire-hospital-tycoon-engine` 接日結算 +N）
- Quiz runner（二階 app）答對時 `affinity[subject] += 1`；首次跨越 threshold 觸發 in-app notification「<科別> 招募解鎖」
- Ticket 起始 10 張（dogfood baseline，方便試抽）；每日 +1（client-side date diff，不接後端）；上限 99

**Out of scope**（明確留給後續 changes）：

- Doctor room assignment / room throughput 計算 → `wire-hospital-tycoon-engine`
- Hospital level upgrade UI（診所 → 區域 → 醫學中心）→ `wire-clinic-level-up`
- Reputation 公式 → `wire-hospital-reputation`
- Doctor sprite roster 14 科 × P1–P5 美術 → `add-doctor-sprite-roster`（本 change 用 placeholder「醫師-<科別>-P<N>.png」or 顏色方塊）
- 二階 quiz runner 詳解 UI（OE citation 點擊 / P1–P5 confidence 視覺化）→ `wire-quiz-runner-medexam2`
- GH Pages deploy → `add-medexam2-gh-pages-deploy`

## Capabilities

### New Capabilities

- `recruitment-gacha`: 二階 hospital app 的招募抽卡子系統 — 定義 per-subject affinity counter / banner unlock gate / P1–P5 rarity weight table / pity threshold / doctor card schema / ticket consumption contract。Lock 所有 `hospital-management-mode` 留白的數值。

### Modified Capabilities

無 — `hospital-management-mode` 的 requirements 不變（本 change 是 fulfill 它創造的契約：把 "deferred to wire-recruitment-gacha" 的數值在新 capability 內具體化，hospital-management-mode 的 SHALL 條款不需改動）。

## Impact

- **新檔**：`packages/core/src/lib/gacha.ts`、`packages/content-medexam2-tw/src/recruitment.ts`、`apps/medexam2-hospital-tw/src/{pages,components,db}/*`、`openspec/specs/recruitment-gacha/spec.md`
- **改 file（minor）**：`packages/core/src/lib/loot.ts`（內部改成呼叫 `rollGacha`，外部 API 不變）、`packages/core/src/index.ts`（export `rollGacha`）、`apps/medexam2-hospital-tw/src/App.tsx`（router 接 HomePage / DoctorRoster）
- **無 breaking**：一階 `apps/medexam-tw/` 的 loot 系統、Dexie schema、API 都不變（gacha refactor 是 internal）
- **新 dependency**：無（用既有 Vite / React / Dexie / Framer Motion）
- **Risk**：medexam2 quiz runner 尚未接 — 親密度累積暫時用「進入 quiz mode 後手動標記答對」mock（拆獨立 task），等 `wire-quiz-runner-medexam2` 接好真實 quiz 後自動 wire up
- **Telemetry**：每次 roll 記入 `gachaStats.totalRolls` + 結果 rarity；dogfood 一週後依分佈調 weights（per project.md「Loot 不平衡」mitigation）
