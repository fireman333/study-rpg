## Context

二階 hospital mode 中，每個招募 / 培訓出來的醫師都有個 auto-generated 樣板名（`"<subject.displayName> 醫師 #<seq>"`，例「外科 醫師 #3」、「內科 醫師 #11」）。這個格式在 [recruitment.ts:75](apps/medexam2-hospital-tw/src/services/recruitment.ts:75) 跟 [starter-pull.ts:43](apps/medexam2-hospital-tw/src/services/starter-pull.ts:43) 兩個入口分別生成。

`DoctorRow.name: string` 從 Dexie v1（[schema.ts:31-46](apps/medexam2-hospital-tw/src/db/schema.ts:31)）就是 mutable field，cloud sync `hospital_doctors` 表用 JSONB whole-row snapshot（[tables.ts:170-220](apps/medexam2-hospital-tw/src/lib/sync/tables.ts:170)），所以改 `name` 自動觸發 dirty mark + LWW，不用動 sync engine、Supabase migration 或 Dexie version。

8 個 read site 全部用 `useLiveQuery` 讀 Dexie collection，改完一處就跨整個 app reactive 更新。

唯一沒被 covered 的就是「玩家怎麼觸發改名」+「改名後內容 validation 與寫回」。

## Goals / Non-Goals

**Goals:**

- 玩家可在「醫師名冊」（`/roster`）對任一醫師卡片點 ✏️ 按鈕，開 modal 輸入新名 → 確認後立即在所有 surface 反映新名
- 改名 modal 提供「還原預設名」按鈕，回 auto-generated 格式（不需記原 `seq`，重算即可）
- 改名 input 走 validation：trim、長度 1–20 字元、純空白拒絕；UI 即時顯示錯誤
- 改名 persistence 走既有 Dexie + cloud sync pipeline，無新 schema

**Non-Goals:**

- ❌ 改名歷史紀錄（不存 audit log；玩家若改錯可再改回去）
- ❌ 改名 cooldown / 次數限制（沒理由限制單機養成 app）
- ❌ 改名 cost（不消耗任何 in-game currency）
- ❌ 重名檢查（每醫師有 unique `id`，UI 允許不同醫師同名）
- ❌ 髒字過濾（單機個人 app，玩家自負責）
- ❌ 改變招募 / starter pull 時的預設命名邏輯（依舊 `<displayName> 醫師 #<seq>`）
- ❌ Sprite key 重綁（純文字 name，不動 sprite）

## Decisions

### D1：rename 入口放在 DoctorRoster 卡片，不放 AssignDoctorModal / QuizModal

**選項**:
- A）只放 `DoctorRoster`（醫師名冊頁），單一入口
- B）每個顯示 doctor.name 的位置都加 ✏️ 按鈕（roster + RoomCard + AssignDoctorModal + QuizModal …）
- C）右鍵 context menu

**決定**: A

**理由**: 名冊是專為「管理所有醫師」存在的頁面，符合玩家心智模型；其他 surface（RoomCard、QuizModal）是任務脈絡（執行作業 / 答題），改名介面入侵互動流。單一入口降低 8 處 UI 重複改動的成本。

### D2：改名 UI 用 modal 而非 inline edit

**選項**:
- A）Inline `<input>` 直接取代 `<h3>doctor-card__name`
- B）跳 modal，顯示原名 → 新名 → validation 訊息 → 確認 / 取消 / 還原預設

**決定**: B

**理由**: Inline edit 對長 name truncation、validation message、還原按鈕的擺放都不友善；modal 有空間提供「還原預設」次要 action。Modal 跟既有 `RecruitmentResultModal` / `BugReportModal` / `AssignDoctorModal` 一致，沿用既有 modal CSS pattern。

### D3：validation 規則寫在 service layer 不是 UI

**選項**:
- A）UI input 自己做 `maxLength` + `trim` + 空白檢查
- B）`renameDoctor(id, name)` service 是唯一 validation source-of-truth，UI 只負責顯示 service throw 的 error message

**決定**: B（service 做硬 validation，UI 做 UX 即時 hint）

**理由**: 未來若有其他 entry point（CLI debug handle、bulk import、batch 動作），validation 不能 only-in-UI。Service throw 明確 `Error('name 不可為空')` / `Error('name 最多 20 字元')`，UI catch 後顯示對應訊息。UI 額外做 `maxLength={20}` HTML 屬性 + 即時 char counter 提升 UX，但不取代 service validation。

### D4：「還原預設名」需重新計算 seq 嗎？

**選項**:
- A）存 `originalName` 欄位，還原 = 寫回 `originalName`
- B）存 `customName: string | null`，`name` getter 在 customName 為 null 時走 default 邏輯
- C）不存原名，「還原」按 `obtainedAt` 排序當前該 subject 的 doctors，重算 seq

**決定**: C

**理由**:
- A 需要 schema 加欄位 → 動 cloud sync schema → 違反「不動 schema」goal
- B 同樣需要加欄位、且改變 `name` 語意（從 string 變 computed），影響 8 個 read site 邏輯
- C 純 service-layer 行為：reset 時 `db.doctors.where({ subjectId }).sortBy('obtainedAt')`，找該 doctor 的 index + 1 = 新 seq，套樣板格式寫回 `name`。零 schema 變動，行為 deterministic
- Trade-off: 若玩家先招募 A 醫師（seq=1）→ 改名「天才小王」→ 招募 B 醫師（seq=2）→ retire A → reset B 名字，B 會變 seq=1 而非 seq=2。可接受（樣板名本身就是「按目前順序編號」的弱語意，玩家不會察覺）

### D5：是否在「招募當下」可改名？

**選項**:
- A）`RecruitmentResultModal` 加 ✏️ 入口，剛抽到當下就可改名
- B）只有 `DoctorRoster` 可改名，剛抽到的玩家要關 modal → 去名冊找

**決定**: B（MVP），未來可選加 A 當 follow-up change

**理由**: MVP 範圍要小，先把 service + roster modal 做到位；招募 modal 加 entry 是 1 行 prop 改動，未來覺得體驗值得再加。

## Risks / Trade-offs

- **[長 name 撐破 doctor card 排版]** → Mitigation: service 強制 20 字元上限；CSS `.doctor-card__name` 加 `overflow-wrap: anywhere`；roster grid 卡片寬度測試 20 字元中文 + 20 字元英文兩個極端
- **[改名後 sprite alt text 跟新名不一致]** → Mitigation: [HospitalScene.tsx:91](apps/medexam2-hospital-tw/src/components/HospitalScene.tsx:91) 已從 Dexie live row 讀，自動更新；verify 階段 Chrome MCP 確認
- **[Cloud sync race：A 裝置改名 → B 裝置同時也改名]** → Mitigation: 既有 LWW 機制處理，無需特別防護；玩家極不可能多裝置同時改同一醫師
- **[Reset to default 時撞到 seq 重複]** → 不可能，因為 reset 時用「當前該 subject 所有 doctors 排序」算 seq，不是固定不變的 incremental counter；若兩個 doctor 同 obtainedAt（極罕見），sortBy 是 stable，結果 deterministic
- **[玩家把名字改成空格 / 純標點]** → Mitigation: service `trim()` 後檢查 `length === 0` → throw；標點只算 1 字元，允許「@@@@」這種怪名，玩家自負責
- **[改名 modal 跟既有 modal 互卡 z-index]** → Mitigation: 沿用既有 `.modal-backdrop` z-index pattern；roster 頁面同時只會開一個 modal

## Migration Plan

- 無 data migration（schema 不變）
- 無 cloud sync migration（hospital_doctors JSONB 自動兼容）
- 既有玩家現有醫師 `name` 欄位保留原 auto-generated 值，行為 backward-compatible
- Rollback：若需移除功能，刪除 modal + service + roster 按鈕即可；既有自定名仍存在 Dexie / cloud，下次再加回功能可直接讀

## Open Questions

- **改名按鈕視覺**：✏️ emoji 還是 SVG icon？傾向 ✏️ 一致 hospital app 既有 emoji-heavy 風格（🩺、🏥、💬）
- **改名 modal 是否要 confirm「確定改名」二次確認？**：不要，rename 本身可逆（再改一次就好），多一層 dialog 浪費；但「還原預設名」要二次 confirm，因為玩家可能不小心點到
