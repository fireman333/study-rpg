## 1. Content pack — title mapping

- [x] 1.1 在 `packages/content-medexam2-tw/src/recruitment.ts` 新增 `DEFAULT_DOCTOR_TITLE_BY_RARITY: Record<Rarity, string>` const，內容：P1=`大P`, P2=`主任`, P3=`Senior V`, P4=`Young V`, P5=`R`
- [x] 1.2 確認 `index.ts` 透過 `export * from './recruitment'` 已自動 re-export 新 const（既有 pattern）
- [x] 1.3 `pnpm --filter @study-rpg/content-medexam2-tw build` 通過（content pack rebuild ok；既有 gzip > 2.5 MB warning 與本 change 無關）

## 2. App service — wire title into name template

- [x] 2.1 修改 `apps/medexam2-hospital-tw/src/services/recruitment.ts:75`：
  - import `DEFAULT_DOCTOR_TITLE_BY_RARITY`
  - 把 `` `${subject.displayName} 醫師 #${seq}` `` 改成 `` `${subject.displayName} ${DEFAULT_DOCTOR_TITLE_BY_RARITY[rarity]} #${seq}` ``
- [x] 2.2 修改 `apps/medexam2-hospital-tw/src/services/starter-pull.ts:43`：同上替換
- [x] 2.3 修改 `apps/medexam2-hospital-tw/src/services/rename-doctor.ts` 的 `restoreDefaultDoctorName`：
  - import `DEFAULT_DOCTOR_TITLE_BY_RARITY`
  - default name 樣板從 `${displayName} 醫師 #${seq}` 改成 `${displayName} ${DEFAULT_DOCTOR_TITLE_BY_RARITY[doctor.rarity]} #${seq}`
  - 更新 docstring 註明 tier-aware behavior
- [x] 2.4 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` 過

## 3. Spec sync

- [x] 3.1 `openspec validate differentiate-default-name-by-tier --strict` 通過
- [x] 3.2 確認 design.md 跟實作對齊（若實作過程改了 D1–D5 任一決策，回頭更新 design.md）— D1–D5 全沿用、未變更

## 4. Verification

- [x] 4.1 啟動 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` — http://localhost:5176/study-rpg/hospital/ boot ok
- [x] 4.2 Chrome MCP preflight `list_connected_browsers` + functional smoke：
  - ✓ P1 內科 院長 → 還原 → `內科 大P #2`
  - ✓ P2 內科 主任 → 還原 → `內科 主任 #1`
  - ✓ P3 內科 醫師 #99（seed test row）→ 還原 → `內科 Senior V #3`
  - ✓ P4 外科 醫師 #99（seed test row）→ 還原 → `外科 Young V #2`
  - ✓ P5 婦產科 醫師 #99（seed test row）→ 還原 → `婦產科 R #2`
  - seq 計算依 obtainedAt asc 排序，跨 rarity 共用順序，驗證 OK
  - 改名 / validation / cloud sync 沿用 add-doctor-rename 已驗結果，不重跑
- [x] 4.3 確認既有 doctor row 在「**沒按還原**」時保留原名（驗 D2 「不 migrate」決策成立）— seed 三張 `醫師 #99` row，restore 前 Dexie name 不變、restore 後才更新；其他未動的 6 張 P2 主任 row 全程保留原名
- [ ] 4.4 跑 `/verify` 收尾（dead code audit + `/simplify`）— 由使用者下個 turn 主動呼叫
- [ ] 4.5 待使用者確認後跑 `/opsx:archive differentiate-default-name-by-tier` 把 delta merge 進 main specs

## 5. Out of scope (defer to follow-up)

- [x] 5.1 「全部還原預設名」批次按鈕 — 不在本 change
- [x] 5.2 既有玩家資料 auto-migration — 不做（依 D2）
- [x] 5.3 升級提示 / migration UI banner — 不做
