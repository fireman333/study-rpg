## Why

二階 hospital app 的 doctor↔room 指派目前持有兩個指標 — `room.assignedDoctorId`（forward）與 `doctor.assignedRoom`（reverse）— 並要求兩者同步維持。`assignment.ts` 用單一 Dexie transaction 寫入兩邊，本地原子性正確；但 cloud sync 把這兩個指標**拆到兩條獨立的 push pipe**：

- `hospital_doctors`（collection adapter）的 Dexie hook 掛在 `doctors` 表 → assign 後 ~3 秒推送
- `hospital_state`（singleton blob，`rooms` 是 passenger）的 Dexie hook 只掛在 `gameCounters` 表 → 等下次 5 秒 tick 才推送

實測 dogfood 戶頭 `tony85314@gmail.com` 已固定產生 drift：3 位醫師的 `assignedRoom` 指向 `outpatient-1/2/3`，但 3 個房間的 `assignedDoctorId` 全部為 `null`。後果：

- Hospital tab 讀 `room.assignedDoctorId` → 顯示「房間 0/3」
- HomePage HospitalScene 讀 `doctor.assignedRoom` → 顯示 3 位醫師在診間
- AssignDoctorModal `getUnassignedDoctors()` filter `assignedRoom === null` → 列表空 → **使用者無法重新指派、完全鎖死**
- Tick revenue 用 `room.assignedDoctorId` → 看到 0 → 不給營收，但薪水照扣（區域醫院以上）

`checkAssignmentInvariants()` boot scanner 偵測到 drift 但只 `console.warn`，沒救援動作。

Root cause 屬「雙 source-of-truth 在分散式寫入下無法保持同步」一類 — 補修 sync hook 只能縮小 race window，無法消除。最乾淨的修法是消滅雙指標，改用 `doctor.assignedRoom` 為單一 source of truth，read site 即時 derive。

## What Changes

- **BREAKING (內部 API)**：`room.assignedDoctorId` 欄位保留在 `RoomRow` 型別與 IndexedDB schema（避免 cloud blob schema 與 export/import JSON cascade），但 app code **永遠不再讀也不再寫**。新值永遠 `null`。
- `assignment.ts` 重寫：
  - `assignDoctor(roomId, doctorId)` 只寫 `doctor.assignedRoom`；不再寫 `rooms` 表
  - `unassignDoctor(roomId)` 改為反向查 `doctors.where('assignedRoom').equals(roomId)`，再清該醫師的 `assignedRoom`
  - `checkAssignmentInvariants()` 從 logger 升級為 **active repairer**：偵測到 `room.assignedDoctorId !== null` 一律 reset 為 `null`；偵測到 doctors 重複指向同一個 room 時保留 `obtainedAt` 最新者、其他 reset 為 `null`；偵測到 `doctor.assignedRoom` 指向不存在的 room.id 時 reset 為 `null`
  - 新增 `repair` mode 在 app 啟動與每次 cloud pull 完成後跑
- 新建 helper `apps/medexam2-hospital-tw/src/lib/room-doctor-map.ts` 集中 derive 邏輯，避免 7 個讀取點各寫一份：
  - `buildDoctorByRoom(doctors: DoctorRow[]): Map<string, DoctorRow>` — 用 `doctor.assignedRoom` 反查表
  - `getAssignedDoctor(roomId: string, doctorByRoom: Map<string, DoctorRow>): DoctorRow | null`
- 所有讀 `room.assignedDoctorId` 的點（Hospital.tsx / HomePage.tsx / StudySessionPage.tsx / tick.ts / RoomCard.tsx 等）改用上述 helper
- `services/retire.ts` 簡化：不再掃 rooms 清 orphan，只要把醫師的 `assignedRoom` 設 null
- `services/room-extension.ts` 新增房間時不再 init `assignedDoctorId` 欄位（schema migration v12 一次性把所有 rooms 該欄位設為 null）
- `lib/sync/tables.ts` 的 `writeHospitalStateBlob` 在 apply 雲端 rooms 時 **defensively force `assignedDoctorId: null`**，防止舊雲端 blob 復活 drift
- Dexie schema v12 一次性 migration：所有現存 rooms.assignedDoctorId = null

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `hospital-tycoon-engine`: 「Doctor assignment SHALL be atomic across `Room.assignedDoctorId` and `Doctor.assignedRoom`」需求重寫為「Doctor assignment SHALL use `Doctor.assignedRoom` as the single source of truth」；assign / unassign scenario 改為單側寫入；新增「invariant repair on boot + after cloud pull」「cloud blob defensive null on apply」「read sites derive via helper」三項需求。Room 資料模型需求補充欄位語意（assignedDoctorId 保留但 deprecated）。Tick loop / Hospital UI / HomePage 顯示等需求中提到 `room.assignedDoctorId` 之處改寫為 derived。

## Impact

**Files modified**:
- `apps/medexam2-hospital-tw/src/lib/assignment.ts` — `assignDoctor` / `unassignDoctor` / `checkAssignmentInvariants` 重寫
- `apps/medexam2-hospital-tw/src/db/schema.ts` — 加 Dexie v12 upgrade hook；可選加 `doctors` 的 `assignedRoom` 索引
- `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` — `writeHospitalStateBlob` 套 force-null
- `apps/medexam2-hospital-tw/src/pages/Hospital.tsx` — 改 helper
- `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` — 改 helper（line 62 / 200-216 / 204）
- `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` — 改 helper（line 43 / 56-79 / 185）
- `apps/medexam2-hospital-tw/src/lib/tick.ts` — 改 helper（line 142）
- `apps/medexam2-hospital-tw/src/services/retire.ts` — 簡化（line 34-43）
- `apps/medexam2-hospital-tw/src/services/room-extension.ts` — line 117 不再寫 `assignedDoctorId`
- `apps/medexam2-hospital-tw/src/App.tsx` — `checkAssignmentInvariants()` 從 logger-only 改成跑 active repair
- 任何呼叫 `assignment.assignDoctor` / `unassignDoctor` 的 component（主要是 `AssignDoctorModal.tsx`）— signature 不變、行為不變，不需改

**Files NEW**:
- `apps/medexam2-hospital-tw/src/lib/room-doctor-map.ts` — derive helper

**Cloud schema**:
- 不變。`hospital_state.data.rooms[*].assignedDoctorId` 欄位繼續存在；app 永遠寫 null。舊雲端 blob 有非 null 值時 apply 邏輯 force null（不會復活 drift）。

**Migration**:
- Dexie v12 upgrade hook 一次性修正本地 drift
- 第一次啟動新版的使用者：`checkAssignmentInvariants()` repair 會清理任何殘留 drift
- 雲端不需 migration（push 流程自然把 null 寫上去）

**Out of Scope**:
- Facility upgrade race（room.facilityLevel / roomFacility 改了但 hospital_state 等 tick 才推）— 同一個 root cause class（split-write race），但不在本 change 範圍。後果輕（最多多賺一次 facility upgrade 倍率），對使用者體驗影響遠小於 assignment drift。留 follow-up change `fix-medexam2-room-write-sync-race`。
- 雲端 backfill：不主動寫 SQL 把現有 `hospital_state.data.rooms[*].assignedDoctorId` 改 null。靠 app 端 force-null on apply + 下次 push 自然清掉。
- `RoomRow.assignedDoctorId` 欄位完全移除：保留為向後相容（type、cloud blob、export/import JSON）。
