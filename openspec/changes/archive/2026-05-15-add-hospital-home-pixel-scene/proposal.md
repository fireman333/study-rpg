## Why

二階 home (`/study-rpg/hospital/#/`) 目前是純文字介面：「醫院：診所　(聲望 0 / 1,000 → 區域醫院)」+ 營收 / 聲望數字。沒有任何視覺化呈現 hospital 規模感、tier 升級的成就感、或招募到的 doctors 在「醫院內」運作的具象感。GBA-era pixel RPG 的核心吸引力是「角色 + 場景 + 養成 progression 可被眼睛看到」，目前缺這塊 → 玩家無法立即感受到 tier 升級的 visual reward，doctor 招募進來只是 roster 上的條目而非「真的在醫院上班」。

## What Changes

- **新 React component `<HospitalScene>`**：渲染在二階 home (`/study-rpg/hospital/#/`)，位置在 top bar 之下、status text 之上（擴充式 layout，不替換現有 text，可後退）
- **3 張 tier-specific pixel scene PNG**：`hospital-tier1-clinic.png` / `hospital-tier2-regional.png` / `hospital-tier3-medical-center.png`，視角均一（建議 top-down 3/4 isometric）、規模 + 細節遞增（診所 1 棟 → 區域醫院 2-3 棟 → 醫學中心 4-5 棟 + 直升機停機坪）
- **Doctor sprite render rule (subject-bound)**：每張 scene 預先標記 N 個 doctor slot 座標（hard-coded in theme config），對應科別 → room mapping（reuse `wire-hospital-reputation` 的 affinity table）。Roster 內有 assigned doctor 該 slot 顯示對應 sprite，沒有則 slot 空
- **Slot 數量階梯**：tier 1 = 1-2 slot、tier 2 = 3-5 slot、tier 3 = 6-8+ slot（隨 hospital 規模解鎖）
- **Interactivity**：點 building 區（or 整張 scene）→ 觸發既有 / 新建 `<UpgradeModal>` 顯示當前 tier + 下一 tier 解鎖條件 + 升級進度 bar + 升級 button。Doctor sprite + room 在 MVP 不可點
- **Tier transition**：`hospital.tier` state 變化時 scene asset 自動切換（MVP 瞬切；cross-fade 動畫 stretch）
- **Asset pipeline**：3 個 scene PNG 走 codex `$imagegen`（同 doctor / mentor sprite pipeline），放 `packages/theme-pixel-hospital/sprites/scenes/`
- **Responsive**：mobile (< 768px) 等比縮放鋪滿寬度、desktop / tablet 置中 + max-width

## Capabilities

### New Capabilities

- `hospital-scene`: 二階 home 的 pixel art 場景視覺系統 — tier-based scene asset、subject-bound doctor slot rendering、building click → upgrade modal

### Modified Capabilities

- `theme-pack-contract`: 新增 theme spec field `scenes: { tier1, tier2, tier3 }`（scene asset path）+ `doctorSlotPositions: { tier1, tier2, tier3 }`（每 tier 的 doctor slot 座標 + 對應科別 mapping）— 為**非破壞性新增**，optional fields

註：`clinic-level-up` 不列入 Modified — `hospital.tier` state 反應性已是現行行為，`<HospitalScene>` 純消費者、不改 level-up 規範

## Impact

- **新 component**：`apps/medexam2-hospital-tw/src/components/HospitalScene.tsx`、可能 `UpgradeModal.tsx`（若尚不存在）
- **新 assets**：`packages/theme-pixel-hospital/sprites/scenes/hospital-tier{1,2,3}-*.png`（codex 生成、~3 × 384×384 PNG）
- **Modified files**：
  - `apps/medexam2-hospital-tw/src/routes/HomePage.tsx`（加入 `<HospitalScene>`）
  - `packages/theme-pixel-hospital/src/index.ts`（exports + scene + slot config）
- **Storage / persistence**：無新欄位（`hospital.tier` 已存在）
- **Wall time**：3-5 hr total（asset gen 30-90 min parallel batch + React component 1-2 hr + theme config 30 min + Chrome MCP responsive verify 30 min）
- **Dependency**：codex CLI 可用 + Codex Plus quota（trial entry 至 2026-06-07）；需 `clinic-level-up` (✓ archived) + `wire-hospital-reputation` (✓ archived) 已 lock
- **Not Breaking**：純擴充。`?scene=off` query param 可作 emergency fallback feature flag（asset 載入失敗時降級回純 text home）
