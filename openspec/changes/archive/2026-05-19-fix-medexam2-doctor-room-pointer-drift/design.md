## Context

二階 hospital app 自 `wire-hospital-tycoon-engine` (commit e069348) 起，doctor↔room 指派一直維持雙向指標。當時雲端 sync 尚未實作，雙指標僅作為「兩個方向都好查」的便利。M4（cloud-sync）上線後，這個設計與分散式寫入語意衝突 — 兩個指標屬於兩條不同的 sync pipe，違反了「同一份邏輯狀態要走同一條 push pipe」的單一性原則。

實測 dogfood drift 並非孤立事件 — 任何使用者只要在 assign / unassign 後 5 秒內觸發 visibility pull（切回主畫面、tab 切換、cold-start force-pull 等），都可能複製這個 bug。Boot-time `checkAssignmentInvariants()` 偵測到 drift 但僅 `console.warn`，沒有 self-heal。

選擇修法時考慮過三個方向：

| 方向 | 改動範圍 | 殘餘 race 風險 | 採用 |
|---|---|---|---|
| **F1**：把 `rooms` 加入 hospital_state dirty hook | sync engine 一行加 watch table | 縮窄 race window 但**仍非零** — 一筆 write 在 hook fire 與 push 完成中間仍可被 pull race 蓋掉 | ❌ 治標不治本 |
| **F2**：boot-time auto-repair | 改 `checkAssignmentInvariants` 為 repairer | drift 仍會反覆出現，每次靠掃描修；user 開 modal 點半秒前 drift 可能還沒被偵測 | ❌ 反應式、不夠乾淨 |
| **F3**：消滅雙指標，單一 source of truth | 改 `assignment.ts` + 7 個 read site + helper + Dexie migration + sync apply 防呆 | 結構性消除整個 bug class | ✅ 本 change |

F3 的代價是 7 個讀取點需改寫，但有以下 cost amortizer：

1. 全部走同一個新 helper `buildDoctorByRoom`，每個 call site 只改 2-3 行
2. `RoomRow.assignedDoctorId` 欄位**保留**（不從 type 拿掉），避免 cascade 進 content package / cloud blob schema / export-import 流程
3. Dexie migration 是純 additive（只清現存非 null 值），無資料 loss 風險

## Goals / Non-Goals

**Goals**:

- 消除 doctor↔room assignment 的 dual-pointer drift 整個 bug class，不是縮小 window
- 使用者下次 reload app 時，現有 drift 自動修復（不需手動清 IndexedDB）
- 舊雲端 hospital_state blob（含非 null `assignedDoctorId`）apply 進來時不可復活 drift
- Read site 程式碼可讀性不變或更好（helper 集中、不散落 `room.assignedDoctorId ? doctorById.get(...)` pattern）

**Non-Goals**:

- 不修 `room.facilityLevel` / `roomFacility` 在 sync engine 的同類 race（留 `fix-medexam2-room-write-sync-race` follow-up）
- 不把 `RoomRow.assignedDoctorId` 欄位完全移除（保留向後相容）
- 不主動 SQL backfill 雲端的 `hospital_state.data.rooms[*].assignedDoctorId`（push 自然會把 null 寫上去）
- 不重構 cloud sync engine 的 dirty-hook 機制（只在 apply 端加防呆）
- 不解決 cloud sync 其他類別的 race condition（targeted tickets / fate cards / events 等不在範圍）

## Decisions

### Decision 1: Single source of truth = `doctor.assignedRoom`，不是 `room.assignedDoctorId`

**選 doctors 側的理由**：

1. Doctors 是「多」的一方，rooms 是「少」（最多 3+3+2 = 8 個 room 在 醫學中心 tier）。從多對一的 FK 設計傳統，FK 放在 many 側
2. Doctors 是 collection adapter，每筆獨立 LWW，push pipe 比 hospital_state 容錯（hospital_state 是 singleton blob，任何欄位更新都 force 整包 push 與 pull）
3. 一個 doctor 永遠只在 0 或 1 個 room；一個 room 永遠最多 1 個 doctor — 兩種方向都能表達 1:0..1 關係，但 doctor 側資料天然有 `obtainedAt` 排序，跨同 room 的多 doctor 衝突時可以用 `obtainedAt` 最新者解開（如「兩個 doctor 同時被指派同一個 room」這種 race 殘留）

**Alternative considered**：以 `room.assignedDoctorId` 為 source。否決 — rooms 的容量會隨 tier 升級增減（透過 `room-extension` 服務），rooms 也是 hospital_state singleton 的 passenger，比 doctors 表更容易在 pull 時被整包蓋掉。讓「比較不穩定」的那邊當 SOT 反而擴大問題。

### Decision 2: `RoomRow.assignedDoctorId` 欄位保留，永遠 null

**為什麼不直接拿掉**：

1. `RoomRow` type 來自 `@study-rpg/content-medexam2-tw`，移除欄位會 cascade 進該 npm package（M3 已 publish v0.2.0），影響 fork 的二階 content pack
2. Cloud blob `hospital_state.data.rooms[*]` 結構需向後相容（舊 client / 舊 cloud row 仍可能帶這欄）
3. Export/import JSON（M4.5 feature）保留 schema 完整性

**Apply-side 防呆**：`writeHospitalStateBlob` 在 apply rooms 時無條件 force `assignedDoctorId: null`，這層保證即使雲端 blob 有遺留值也不會復活 drift。Pseudo：

```ts
const sanitizedRooms = blob.rooms.map(r => ({ ...r, assignedDoctorId: null }))
await db.rooms.bulkPut(sanitizedRooms.map(stamp))
```

**型別層提醒**：在 `RoomRow.assignedDoctorId` 欄位 JSDoc 加 `@deprecated` 標記，提醒未來開發者 — 但欄位本身保留可讀。

### Decision 3: Helper API shape — `buildDoctorByRoom(doctors) → Map<roomId, DoctorRow>`

**為什麼選 Map 而不是 lookup 函式**：

1. React 元件 / Hook 慣用 `useMemo` cache derived map，一次建立、多次查詢
2. Map.get(roomId) 比 `doctors.find(d => d.assignedRoom === roomId)` O(n) → O(1) — 在 tick loop / RoomCard render 都頻繁讀取
3. 之後若要批量 iterate 所有 assigned 醫師，仍可 `[...map.values()]`

**API**：

```ts
// apps/medexam2-hospital-tw/src/lib/room-doctor-map.ts
export function buildDoctorByRoom(
  doctors: ReadonlyArray<DoctorRow>,
): Map<string, DoctorRow> {
  const m = new Map<string, DoctorRow>()
  for (const d of doctors) {
    if (d.assignedRoom !== null) {
      // Race safety: if two doctors point at same room (post-pull drift before
      // repair runs), keep the one with the later obtainedAt. This is a
      // last-line defense; checkAssignmentInvariants() should have repaired
      // already by app boot.
      const existing = m.get(d.assignedRoom)
      if (!existing || d.obtainedAt > existing.obtainedAt) {
        m.set(d.assignedRoom, d)
      }
    }
  }
  return m
}

export function getAssignedDoctor(
  roomId: string,
  doctorByRoom: Map<string, DoctorRow>,
): DoctorRow | null {
  return doctorByRoom.get(roomId) ?? null
}
```

Call site pattern：

```ts
// Hospital.tsx (前)
const doctorById = useMemo(() => /* ... */, [doctors])
const doctor = room.assignedDoctorId ? doctorById.get(room.assignedDoctorId) ?? null : null

// Hospital.tsx (後)
const doctorByRoom = useMemo(() => buildDoctorByRoom(doctors), [doctors])
const doctor = getAssignedDoctor(room.id, doctorByRoom)
```

### Decision 4: `checkAssignmentInvariants()` 從 logger 升級為 active repairer

新行為：

1. 任何 `room.assignedDoctorId !== null` → reset to `null`
2. 多 doctor 指向同一 `roomId` → 保留 `obtainedAt` 最大者，其他 reset `doctor.assignedRoom = null`
3. `doctor.assignedRoom` 指向不存在的 `room.id` → reset to `null`
4. 全部寫入包進同一個 Dexie transaction（`rw` mode）
5. 每次修復同時 `console.info` 修了什麼（telemetry，便於 dogfood 觀察是否真的有再發生）
6. 回傳 `{ scanned, repaired, repairedDetails }` 給 caller 做 sync error toast 或 dev panel 顯示

**觸發點**：

- App boot (`App.tsx` 內既有的 `checkAssignmentInvariants()` 呼叫升級為 repair mode)
- 每次 cloud pull 完成後（在 `sync/engine.ts` 的 `pullNow` resolve 之後 fire `repair` event；最簡單做法是 visibility-pull 完成後從 `useSync` hook 觸發）

**為什麼不在每次 assign / unassign 後再跑**：assign / unassign 本身已是原子寫入，後置 repair 反而徒增 IO。Repair 只在「外部來源（雲端 / migration / dev tools）可能引入 drift」的事件後跑。

### Decision 5: Dexie schema v12 = 一次性 force-null migration

v12 store schema **不變**（不加 / 拿欄位），只跑 `.upgrade(async tx => {...})` hook：

```ts
this.version(12)
  .stores({ /* 同 v11，不變 */ })
  .upgrade(async (tx) => {
    const roomsTable = tx.table<RoomRow, string>('rooms')
    await roomsTable.toCollection().modify((r) => {
      if (r.assignedDoctorId !== null) r.assignedDoctorId = null
    })
  })
```

`doctors` 表不動（`assignedRoom` 已是真實狀態）。**注意**：v12 upgrade 後，如果使用者本地 doctors 表本來就有 drift（doctor.assignedRoom 指向非該 doctor 真正指派的 room），這個 upgrade **不會修**，要靠後續的 `checkAssignmentInvariants()` repair。這是預期行為 — 我們相信 doctors 側比 rooms 側可靠（理由見 Decision 1）。

**可選**：加 `doctors` 表 `assignedRoom` 索引（`'&id, subjectId, rarity, obtainedAt, assignedRoom'`）讓 `unassignDoctor(roomId)` 的反查走索引。考慮到 doctors 表最大 ~30 筆（國家級教學醫院上限），不加索引也 fine。建議**先不加**，等 dogfood telemetry 顯示慢再加。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 7 個 read site 改寫漏掉一處 → 該畫面仍讀 `room.assignedDoctorId` → 顯示永遠空 | tasks.md 列完整 file/line checklist；改完跑 `grep -rn "assignedDoctorId" apps/medexam2-hospital-tw/src/` 應該只剩 sync layer + schema 兩處 |
| `buildDoctorByRoom` 的 race-safety 邏輯（兩 doctor 同 room 取 obtainedAt 較新者）若沒被測試覆蓋，可能 silently 吃掉一位醫師的指派 | spec scenario 明確要求；tasks.md 列 unit test 任務 |
| Force-null on cloud pull 若雲端某天恢復寫值，會把使用者沒 expected 的更新吃掉 | 不會發生（本 change 同時 deploy app 與 sync logic，沒有「app 老但雲端新」場景）；長期靠 spec 明文約束 |
| Dexie v12 migration 在某些瀏覽器掛掉 → 使用者卡在升級不來 | upgrade hook 本身只跑 `.modify(...)`，純 in-place 更新，不刪表不加 index；風險極低。Dexie 對 upgrade hook 有 catch；catch 路徑進 sync error toast |
| 使用者本地有「正當 drift」（assignedRoom 指向他剛在另一個裝置上才建好的 room） — repair 誤判為孤兒 | doctor.assignedRoom 指向**不存在於本地 rooms 表的** room.id 才視為孤兒。Cloud sync pull 應該已把 rooms 補齊（hospital_state singleton 是先於 doctors 還是後 apply？確認順序見 Open Questions） |
| 第 1 次跑 repair 的時候，使用者剛開 app + cloud pull 還沒到 → repair 跑在「本地舊 rooms + 本地舊 doctors」上 → 把某些其實沒 drift 的醫師清成 null | repair scope 限定「明確矛盾」（doctor.assignedRoom 指向 room.assignedDoctorId 不等於該 doctor.id 的 room）— 在新版單一 source 設計下，**rooms.assignedDoctorId 永遠是 null**，所以 repair 唯一動的是上述「指向不存在 room 的孤兒」一類，誤殺風險小 |

## Migration Plan

**Deploy 順序**：

1. Merge change → `pnpm -r build` → CI 自動 deploy GitHub Pages
2. 使用者下次開 app（瀏覽器 reload）：
   - Dexie v12 upgrade 跑 — 所有 `rooms.assignedDoctorId` 設 null
   - `App.tsx` 內 `checkAssignmentInvariants()` 跑 active repair — 若有殘留 drift（e.g. doctor 指向不存在 room）也清掉
   - Cloud sync first pull — 若雲端 hospital_state 仍有非 null `assignedDoctorId`，apply 時被 sanitize 為 null
   - Cloud sync first push — 把本地 sanitized rooms 寫回雲端
3. 之後雲端的 hospital_state.data.rooms[*].assignedDoctorId 自然全變 null

**Rollback**：

- 把 commit revert，re-deploy 舊版 → 使用者瀏覽器拉舊版 JS
- IndexedDB Dexie 不能 downgrade（v12 不能變回 v11）；舊版 JS 仍能讀 v12 schema（因為 store schema 不變），只是 v12 upgrade 已把 rooms.assignedDoctorId 全清為 null。舊版 JS 讀到全 null → Hospital tab 顯示空 → 但這時舊版 JS 也會看到 doctor.assignedRoom 有值（drift 反向），同樣 stuck — **rollback 救不了已升級的使用者**
- 因此 rollback 策略 = ship hotfix 補修，不真的 downgrade

**第二輪驗證**（在 dogfood 戶頭跑）：

1. Cloud pull → 確認 `rooms.assignedDoctorId` 全 null（IndexedDB devtools）
2. 開 Hospital tab → 確認 3 位醫師正常顯示在房間
3. 開 AssignDoctorModal → 確認可以 unassign 把醫師釋放
4. Reload → 重複 1-3，確認不會 drift

## Open Questions

1. **Cloud pull 中 hospital_state 與 hospital_doctors 的 apply 順序**？若先 apply hospital_state（包含 sanitized rooms）再 apply doctors，沒問題；若反過來 — doctors 進來但 rooms 還沒同步 — `checkAssignmentInvariants()` repair 時可能誤判孤兒。需在 sync/engine.ts pullNow 流程驗證。**Action**：實作時讀 engine.ts pull 順序，若 hospital_doctors 先於 hospital_state，把 repair 延後到 pull 完整 resolve 之後。
2. **AssignDoctorModal 的 `currentDoctor` prop**：目前由 `Hospital.tsx` 從 `room.assignedDoctorId` 算出傳入。改成 `doctorByRoom.get(room.id) ?? null` 後 prop 語意不變、callsite 一行改動。但若有其他人呼叫 `AssignDoctorModal`（grep 結果只有 `Hospital.tsx`），不需擔心。
3. **是否要為 helper 寫獨立 unit test**？helper 邏輯簡單但有 race-safety branch（兩 doctor 同 room 取 obtainedAt 較新者）。傾向加，但若團隊習慣只跑 e2e 也接受。**Default**：tasks.md 列 unit test 任務，使用者可在 review 時砍掉。
