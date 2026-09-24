## 1. 核實與設計

- [x] 1.1 從原始碼推導 `PUBLIC_SNAPSHOT_FIELDS` 現況（design D1）
- [x] 1.2 列出排除欄位與各自理由，確認既有 requirement 覆蓋到哪裡、缺口在哪裡（design D1）
- [x] 1.3 確認既有測試 `leaderboard-public-snapshot.test.ts` 的 `NEURONS_SPEC_FIELDS` 已是可用守衛，決定只補兩處而非重寫（design D3）

## 2. Spec

- [x] 2.1 `openspec/changes/neurons-leaderboard-snapshot-fields/specs/neurons-leaderboard/spec.md`：ADDED 一條 requirement，列出欄位清單、四個排除項目與理由、`/me` 的例外
- [x] 2.2 `openspec validate neurons-leaderboard-snapshot-fields --strict`

## 3. 測試

- [x] 3.1 更新 `leaderboard-public-snapshot.test.ts` 的 `NEURONS_SPEC_FIELDS` 註解：從「no spec requirement of its own yet」改成指向新 requirement 名字
- [x] 3.2 新增測試：舊快照帶 `key_epoch` 時，公開讀取回應不含它（覆蓋 design D3 提到的唯一缺口）
- [x] 3.3 擴充既有「the player's own row, read with their token, still carries its write time」測試，一併斷言 `row.family_complete` 存在（覆蓋新 scenario「`/me` 仍回傳 retired-axis 欄位」）
- [x] 3.4 mutation probe（見下方報告）：
  - 3.4.1 把 `key_epoch` 塞回 `projectPublicSnapshot()` 回傳值 → 新增測試（3.2）應紅
  - 3.4.2 把 `family_complete` 從 `handleGetMe` 的 SELECT / 回傳物件拿掉 → 擴充後的測試（3.3）應紅
  - 3.4.3 把 `synapse_strong` 加回 `PUBLIC_SNAPSHOT_FIELDS` → 既有測試「the public field list does not include the sync time」與「every public row carries exactly the listed fields」應紅（驗證既有守衛仍然抓得到，不是本 change 弄壞的）

## 4. 全套驗證

- [x] 4.1 `cd cloudflare/sync-worker && pnpm typecheck`
- [x] 4.2 `cd cloudflare/sync-worker && pnpm test`（附檔數／測試數）
- [x] 4.3 `openspec validate --all --strict`

## 5. Commit

- [x] 5.1 Commit 到 `followup/neurons-leaderboard-snapshot-fields` 分支（explicit per-file add）
