## Why

目前所有 rarity tier 的醫師都用統一預設名格式 `<科> 醫師 #<seq>`，rarity 差異只反映在 `RARITY_LABELS`（夯 / 頂級 / 人上人 / NPC / 拉完了）跟 powerMultiplier，看名字看不出階層。

台灣醫院文化的職稱階梯（大P → 主任 → Senior V → Young V → R）天然對映 P1–P5 五階，玩家 onboarding 時看到 P1 「大P」、P5 「R」更直觀理解角色強弱與身分；同時呼應 `priority_levels.md`「夯到拉」程度分級的全域語氣。

## What Changes

- 新增 `DEFAULT_DOCTOR_TITLE_BY_RARITY: Record<Rarity, string>` export 在 `@study-rpg/content-medexam2-tw/recruitment`：
  - P1 → `大P`
  - P2 → `主任`
  - P3 → `Senior V`
  - P4 → `Young V`
  - P5 → `R`
- 招募 service（`recruitment.ts`）與起手 service（`starter-pull.ts`）建立 doctor row 時，`name` 預設改為 `${displayName} ${title} #${seq}`，`title` 來自上述 mapping
- `restoreDefaultDoctorName` service（剛 ship 的 `add-doctor-rename` change 引入）更新對映邏輯：讀 doctor.rarity，套同一 mapping 還原樣板
- 既有玩家先前抽到的醫師（已存在 Dexie / Supabase 的 row）**不主動 migrate**——`name` 保持原本「醫師」字樣，避免靜默改寫使用者已熟悉的角色名；玩家若想統一風格，可在名冊「還原預設名」手動觸發新樣板
- 修改 `recruitment-gacha` spec 的 `Newly recruited doctor stored with all fields` requirement + `Player SHALL be able to rename any doctor in the roster` requirement（後者描述 restore default 行為），補上 tier-based title 規則與 scenarios

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `recruitment-gacha`: 既有 spec 寫死「醫師」字樣於 doctor row 創建 / restore default 流程；改為「依 rarity tier 套對應 title」

## Impact

- **Code**:
  - `packages/content-medexam2-tw/src/recruitment.ts`: 新增 `DEFAULT_DOCTOR_TITLE_BY_RARITY` const
  - `apps/medexam2-hospital-tw/src/services/recruitment.ts`: 改 `name` 生成邏輯
  - `apps/medexam2-hospital-tw/src/services/starter-pull.ts`: 同上
  - `apps/medexam2-hospital-tw/src/services/rename-doctor.ts`: `restoreDefaultDoctorName` 讀 rarity 套 mapping
- **Schema / DB**: 不動（`DoctorRow.name` 一直是 mutable string）
- **Cloud sync**: 不動（whole-row JSONB）
- **Spec**: 修改 `openspec/specs/recruitment-gacha/spec.md`
- **既有玩家資料**: 不 migrate；既有醫師保留「醫師」名直到玩家手動 restore default
- **影響範圍**: 二階 medexam2-hospital-tw app + content-medexam2-tw 內容包；一階 medexam-tw 不受影響
