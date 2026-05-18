## Why

招募到的醫師目前都用 auto-generated 樣板名（例「外科 醫師 #3」），玩家無法替自己的 P1 / P2 SSR 取個人化名字，情感連結弱。讓玩家自定名字是 RPG 養成核心的低成本、高體感升級——schema 早就有 `name: string` 欄位，純 UI + service-layer 改動即可。

## What Changes

- 在 `DoctorRoster` 醫師卡片新增「✏️ 改名」入口，開啟改名 modal
- 新 service `renameDoctor(id, newName)`：trim、長度上限 20 字元、非空、純空白拒絕、whole-row `db.doctors.put` 寫回 Dexie，自動觸發 cloud sync mark-dirty
- 改名 modal 提供「還原預設名」按鈕，回 auto-generated `${subject.displayName} 醫師 #${seq}` 格式
- 自定名沿用既有 `name` 欄位，無 schema migration、無 Dexie version bump、無 Supabase migration
- 所有既有讀 `doctor.name` 的 8 處（roster card / RoomCard / AssignDoctorModal / HospitalScene sprite alt / QuizModal / RecruitmentResultModal / TrainingPage 確認 + retire 對話）透過 `useLiveQuery` 自動 reactive 反映新名

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `recruitment-gacha`: 既有 spec 寫死 `doctor.name` 等於 `"<displayName> 醫師 #<seq>"`；改為「招募時預設為該格式、玩家可於名冊任意時間自定義改名 / 還原預設」。Roster 顯示要求新增改名 UI affordance

## Impact

- **Code**:
  - `apps/medexam2-hospital-tw/src/services/`：新增 `rename-doctor.ts`（含 validation）
  - `apps/medexam2-hospital-tw/src/pages/DoctorRoster.tsx`：卡片新增 ✏️ 按鈕、開 modal
  - `apps/medexam2-hospital-tw/src/components/`：新增 `RenameDoctorModal.tsx`
  - CSS：modal 樣式、卡片按鈕 hover
- **Schema / DB**: 不動（`DoctorRow.name` 已存在）
- **Cloud sync**: 不動（`hospital_doctors.data` JSONB whole-row snapshot，改名自動 mark dirty + LWW）
- **Spec**: 修改 `openspec/specs/recruitment-gacha/spec.md`，補上 rename capability 區塊
- **依賴**: 無新增 npm package
- **影響範圍**: 僅二階 medexam2-hospital-tw app；一階 medexam-tw 不受影響
