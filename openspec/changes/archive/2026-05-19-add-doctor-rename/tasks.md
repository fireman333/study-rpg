## 1. Service layer

- [x] 1.1 新增 `apps/medexam2-hospital-tw/src/services/rename-doctor.ts`，export 兩個 async function：
  - `renameDoctor(id: string, newName: string): Promise<void>` — trim、檢查 `length 1–20`、純空白拒絕；fetch row 後 `db.doctors.put({ ...doctor, name: trimmed })`；row 不存在 throw `Error('找不到該醫師')`
  - `restoreDefaultDoctorName(id: string): Promise<void>` — fetch row，從 `content-medexam2-tw` 取 subject `displayName`，`db.doctors.where({ subjectId }).sortBy('obtainedAt')` 找該 doctor 的 1-based index = 新 seq，組樣板 `"<displayName> 醫師 #<seq>"`，寫回
- [x] 1.2 從 `@study-rpg/content-medexam2-tw` 找到對應 subject metadata 的 helper（檢查 `specialty.ts` 或 `subjects.ts` 是否已有 `getSubjectById(id)`；若無則 inline import subject list 直接 lookup）— **發現 medexam2-tw subjects.json 內 `id === displayName` 對所有 14 科**，service 直接用 `doctor.subjectId` 為 displayName，保留 `displayNameOverride` 參數讓 fork 可覆寫
- [x] 1.3 為 service 寫單元測試（若 repo 有 vitest 設定）或至少留 manual test 步驟在 PR description；驗證 happy path + 4 種 validation 失敗 case + restore default 的 seq 計算 — **此 app 無 vitest 設定**，manual test 步驟在 4.3 covered

## 2. UI components

- [x] 2.1 新增 `apps/medexam2-hospital-tw/src/components/RenameDoctorModal.tsx`：
  - Props: `doctor: DoctorRow`, `onClose: () => void`
  - State: `value: string`（初始 `doctor.name`）、`error: string | null`、`confirmingReset: boolean`
  - UI: modal backdrop + card；`<input maxLength={20}>` + char counter `"X / 20"`；錯誤訊息行；「確認改名」+「取消」+「還原預設名」三按鈕；「還原預設名」點下後切到二次 confirm sub-step（避免誤點）
  - Submit：call `renameDoctor`，catch error → setError；成功 → onClose
  - Restore：confirm 後 call `restoreDefaultDoctorName` → onClose
- [x] 2.2 修改 `apps/medexam2-hospital-tw/src/pages/DoctorRoster.tsx`：
  - 卡片 `<h3 className="doctor-card__name">` 旁加 `<button className="doctor-card__rename" aria-label="改名">✏️</button>`
  - 點按鈕 → setState 開 `RenameDoctorModal`（state: `renamingDoctor: DoctorRow | null`）
- [x] 2.3 加 CSS（在 `apps/medexam2-hospital-tw/src/index.css` 或對應 stylesheet）：
  - `.doctor-card__rename`：小尺寸 icon button、hover 變色、與 name 同行 inline-flex
  - `.rename-modal__*`：沿用既有 modal pattern（backdrop / card / input / button-row）
  - `.doctor-card__name`：加 `overflow-wrap: anywhere` 防 20 字元中文撐破卡片

## 3. Spec sync

- [x] 3.1 確認 `openspec/changes/add-doctor-rename/specs/recruitment-gacha/spec.md` 通過 `openspec validate add-doctor-rename` （`MODIFIED` 區塊內容跟主 spec 對齊）— `validate --strict` 過
- [x] 3.2 確認 design.md 跟實作對齊（若實作過程改了 D1–D5 任一決策，回頭更新 design.md）— D1–D5 全部沿用；唯一實作細節差異是 service 接受 `displayNameOverride?` 參數讓 fork 可覆寫（不違反任何決策，medexam2-tw `id===displayName`）

## 4. Verification

- [x] 4.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` 過
- [x] 4.2 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` 啟動 dev server — http://localhost:5175/study-rpg/hospital/ boot ok
- [x] 4.3 Chrome MCP preflight `list_connected_browsers`，跑 functional smoke：
  - ✓ 進 `/roster` 看到 3 張醫師卡，點 ✏️ → modal 開啟
  - ✓ 輸入「天才小王」→ 確認 → modal 關閉、Dexie 寫入、卡片顯示新名
  - ✓ 重開 modal → 點「還原預設名」→ 二次 confirm → 顯示 `"外科 醫師 #1"` 樣板名
  - ✓ 輸入空字串 / 純空白 → 計數器 0/20、submit disabled
  - ✓ 輸入 21 字元 → 計數器 `21/20` 紅字 + submit disabled；devtools 強解 disabled 再 submit → service 端 throw「名字最多 20 個字」、modal 不關
  - ✓ 19 字元中文長名「阿輝伯內視鏡外科神醫天才大師王小明二世」寫入並 reactive 顯示在卡片
  - ✓ 卡片 ✏️ aria-label 也跟著更新（"為 阿輝伯…改名"）
  - ⏭ `/`、`/training`、`/quiz` 三個 surface：未指派房間故無 RoomCard 顯示；目前測試環境沒 active quiz。讀 code 確認三處皆用 `useLiveQuery` 讀 Dexie row，行為跟 roster 等價
- [-] 4.4 Cloud sync 驗證（若 dev 環境已登入 Supabase）：改名後等 sync debounce 觸發，Supabase dashboard SQL `select id, data->>'name' from hospital_doctors order by updated_at desc limit 5` 確認新名同步 — **N/A**：dev 環境未登入 Supabase（console 看到 `Invalid Refresh Token`）。Code path 走既有 `hospital_doctors` adapter whole-row JSONB snapshot，行為跟其他 doctor 改動（assign room / training）一致；無新 sync 邏輯需驗證
- [ ] 4.5 跑 `/verify` 收尾：dead code audit + `/simplify` review — 由使用者下個 turn 主動呼叫
- [x] 4.6 `openspec validate add-doctor-rename --strict` 通過
- [ ] 4.7 待使用者確認後跑 `/opsx:archive add-doctor-rename` 把 delta merge 進 main specs — 等使用者觸發

## 5. Out of scope (defer to follow-up)

- [x] 5.1 招募當下（`RecruitmentResultModal`）加 ✏️ entry — 留作未來 follow-up change，本次不做
- [x] 5.2 改名歷史 audit log — 不做
- [x] 5.3 重名檢查 / 髒字過濾 — 不做
