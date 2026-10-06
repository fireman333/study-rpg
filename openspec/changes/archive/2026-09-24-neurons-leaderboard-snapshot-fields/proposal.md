> ⚠️ **Requirement 用詞為草稿**：本 change 的 SHALL / scenario 文字由 agent 起草（2026-09-24 盤點後續第 2 輪），會另派審查，未經 owner 逐字確認。

## Why

`neurons-leaderboard` capability 完全沒有規範公開快照（`GET /leaderboard/neurons/:filter`、寫進 KV 的快照）帶哪些欄位——這件事目前只活在 `cloudflare/sync-worker/src/neurons-leaderboard.ts` 的 `PUBLIC_SNAPSHOT_FIELDS` 常數與它旁邊的註解裡。二階（`hospital-leaderboard`，spec 在 study-rpg-2nd）已有對應 requirement（`drop-sync-time-from-public-leaderboard` 拿掉 `updated_at`、`hash-leaderboard-user-ids` 把 `user_id` 換成 `player_key`），neurons 這側從缺——下次有人往查詢加欄位（例如又把同步時間、原始 id，或內部用的 secret 指紋 `key_epoch` 放回去）不會違反任何 spec 文字。

`cloudflare/sync-worker/src/__tests__/leaderboard-public-snapshot.test.ts` 的既有測試（`hash-leaderboard-user-ids` 帶來的）已經寫著：

> Neurons has no spec requirement of its own yet (sibling repo follow-up); this is the set its page renders or matches on, minus the sync time.

本 change 補上那條 requirement，並把測試檔的這句過期註解改成指向它。

核實（2026-09-24，讀碼）：

- `PUBLIC_SNAPSHOT_FIELDS`（`neurons-leaderboard.ts:169-177`，父分支 `followup/hash-leaderboard-user-ids` 狀態）＝ `player_key, nickname, variant_count, total_AP, total_study_min, total_settles, badges_csv`。`grep -a` 確認（本檔曾被 `grep` 誤判為 binary，非 `-a` 會零命中，父 change design D1 已記過這個坑）。
- 明確排除的欄位都有各自的理由，寫在程式碼裡：`user_id`（`hash-leaderboard-user-ids`，改用 `player_key`）、`updated_at`（`drop-sync-time-from-public-leaderboard`，會洩漏玩家每天何時上線）、`synapse_strong` / `family_complete`（`Five filter tabs` / `D1 schema` 兩條既有 requirement 已把它們從排行榜退場，但**沒有一條 requirement 明講它們也不出現在公開欄位清單裡**）、`key_epoch`（`hash-leaderboard-user-ids` 引入的 KV 內部欄位，`public-snapshot.ts` 的 `projectPublicSnapshot()` 回傳值結構上就不含它，但沒有任何測試斷言過這件事）。
- 既有守衛（`leaderboard-public-snapshot.test.ts` 的 `NEURONS_SPEC_FIELDS` 字面清單）已經在做「快照只含這些欄位」的斷言，且刻意寫成字面重複（不是 import）以便跟 Worker 的清單漂移時炸掉。**本 change 不需要重新發明這個守衛**，只需要（a）把它現在指向的空話（「no spec requirement of its own yet」）改成指向新 requirement，（b）補一條它沒測到的：`key_epoch` 不外流。
- 「Opt-in modal」既有 requirement 的公開欄位揭露清單裡仍寫著「Strong Synapse 數 (`synapse_strong`)」，但 `PUBLIC_SNAPSHOT_FIELDS` 從未含它——這條文字本身已經跟實作不符。**本 change 不修這條**：修法需要改寫既有 Requirement 全文（MODIFIED + 全文重述）並涉及 UI 文案決策，超出「補快照欄位 requirement」的範圍，且會與同時進行的其他 change 產生額外接觸面。留給 owner 決定是否另開 change。

## What Changes

- `neurons-leaderboard` capability 新增一條 ADDED requirement，列出公開快照（KV 寫入與 `GET /leaderboard/neurons/:filter` 讀取）允許的完整欄位集合，並明講四個排除項目（`user_id`、`updated_at`、`synapse_strong` / `family_complete`、`key_epoch`）各自的理由或指回既有 requirement。
- `leaderboard-public-snapshot.test.ts`：把 `NEURONS_SPEC_FIELDS` 旁的註解從「no spec requirement of its own yet」改成指向新 requirement的名字；新增一則斷言 `key_epoch` 不會出現在公開讀取回應中（既有測試都沒測到這個，是結構性成立但未被斷言過的事實）。

## Capabilities

### Modified Capabilities

- `neurons-leaderboard`：ADDED 一條 requirement（公開快照欄位清單）。不改動任何既有 requirement 文字。

## Impact

- **Worker**：`cloudflare/sync-worker/src/__tests__/leaderboard-public-snapshot.test.ts`（註解更新 + 1 則新測試）。**不改** `neurons-leaderboard.ts` / `public-snapshot.ts` 的實作——欄位清單已經是 requirement 要求的樣子，本 change 只是把既有行為寫成 spec 並補測試涵蓋。
- **依賴**：從 `followup/hash-leaderboard-user-ids` 分支開出；`player_key` 欄位與「排除 `user_id`」的措辭依賴該 change 的 `public-player-key` capability（尚在驗收）。不修改 `hash-leaderboard-user-ids` change 目錄下任何檔案。
- **Owner 關卡**：無（不涉及 deploy / secret / migration）。
