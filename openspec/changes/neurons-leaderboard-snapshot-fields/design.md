# Design — neurons-leaderboard-snapshot-fields

> Requirement 用詞為草稿、會另派審查。

## D1 — 欄位清單的推導方式與結果

**推導方式（不手列）**：讀 `cloudflare/sync-worker/src/neurons-leaderboard.ts` 的 `PUBLIC_SNAPSHOT_FIELDS` 常數本身（`export const PUBLIC_SNAPSHOT_FIELDS = [...] as const satisfies readonly (keyof LeaderboardRowInternal)[]` — TypeScript 的 `satisfies` 已經保證這份清單是 `LeaderboardRowInternal` 的合法子集，不是隨手打的字串陣列）。

```
grep -a -n "PUBLIC_SNAPSHOT_FIELDS" cloudflare/sync-worker/src/neurons-leaderboard.ts
```

（`-a` 必要：`neurons-leaderboard.ts` 曾被 `grep` 判成 binary，父 change `hash-leaderboard-user-ids` design D1 已記過。）

**結果**（`neurons-leaderboard.ts:169-177`，父分支 `followup/hash-leaderboard-user-ids` 狀態）：

```
player_key, nickname, variant_count, total_AP, total_study_min, total_settles, badges_csv
```

這與 `cloudflare/sync-worker/src/__tests__/leaderboard-public-snapshot.test.ts` 裡刻意手抄的 `NEURONS_SPEC_FIELDS` 字面常數逐項相同（該測試檔已對兩者做 `sort()` 後 `toEqual`，見 D3）。

**排除的欄位與各自的理由**（`LeaderboardRowInternal` 型別上還有、但不在 `PUBLIC_SNAPSHOT_FIELDS` 裡的欄位，加上 KV 層的 `key_epoch`）：

| 欄位 | 在哪裡出現 | 為何不公開 | 既有 requirement 涵蓋了多少 |
|---|---|---|---|
| `user_id` | `LeaderboardRowInternal.user_id?` | 帳號 id；改用 `player_key` | `public-player-key`（父分支）的「Public surfaces identify players by a player key」——但那條是**跨 app 通用**規則，不是 neurons 快照欄位清單本身 |
| `updated_at` | `UpsertBody.updated_at` → D1，公開快照原本會帶 | 洩漏玩家每天何時上線（`drop-sync-time-from-public-leaderboard`，study-rpg-2nd） | 該 change 的 requirement 是 study-rpg-2nd 的 `hospital-leaderboard`，neurons 這邊**只有 code comment**，沒有 spec 文字 |
| `synapse_strong` | D1 欄位仍在（migration `0003`），但 `handleGetMe` 的 SELECT **不含它**——校對時發現這裡原記「仍 SELECT」是錯的，requirement 已改為明講「`/me` 不回傳它」 | `Five filter tabs` requirement 已把它從排行榜移除（demote synapse surface） | 該 requirement 講的是「不再有排名 tab / 不參與 composite 公式」，**沒有明講它不出現在公開快照欄位清單裡**——兩者不是同一件事：一個欄位可以不參與排序，仍然被公開發布 |
| `family_complete` | D1 vestigial column，`handleGetMe` 仍 SELECT | `D1 schema` requirement：open-collection 範式退場，「vestigial, unused」 | 同上，該 requirement 講的是 ranking/schema，不是公開欄位清單 |
| `key_epoch` | `SnapshotPayload.key_epoch`（KV 內部，`hash-leaderboard-user-ids` 引入） | 記錄「這批快照的 key 是哪把 secret 算出來的」，供 `projectPublicSnapshot()` 判斷要不要重新 keying；純內部記帳，從未打算公開 | `public-snapshot.ts` 的 `projectPublicSnapshot()` 回傳值結構上就是 `{ rows, last_updated_at, total_count }`（沒有 `key_epoch` 欄位可複製），但**沒有任何測試斷言過**——結構性成立不代表有守衛盯著 |

## D2 — 為什麼不新增一個「快照從不外流 key_epoch」的通用 requirement

考慮過把 `key_epoch` 不外流寫成 `public-player-key`（父分支的新 capability）底下的一條通用規則，涵蓋二階與 neurons 兩個快照。**沒有這樣做**：

- `public-player-key` change 正在驗收中，本 change 明確被交代「不要修改那個 change 目錄的任何檔案」。
- `key_epoch` 不外流這件事對兩個 app 的機制完全相同（同一個 `public-snapshot.ts` 模組），但**本 change 的 scope 只授權 `neurons-leaderboard`**——二階那半的欄位清單 requirement 是 study-rpg-2nd 的同名 change 負責，那邊也會各自決定要不要把 `key_epoch` 寫進它的欄位清單 requirement。兩邊各自在自己的 capability 裡講「我的欄位清單不含 `key_epoch`」，比開一個新的跨 app 通用 requirement 更不容易在合併時撞衝突。

## D3 — 守衛：既有測試已經在做這件事，本 change 只補兩處

`leaderboard-public-snapshot.test.ts`（`hash-leaderboard-user-ids` 帶來）已有：

1. `"the public field list does not include the sync time"` — `PUBLIC_SNAPSHOT_FIELDS` 排序後與字面常數 `NEURONS_SPEC_FIELDS` 相等，且不含 `updated_at`。
2. `"the cron writes no sync time, and every public row carries exactly the listed fields"` — cron 寫進 KV 的每一列、`GET /leaderboard/neurons/:filter` 讀出的每一列，`Object.keys(row).sort()` 都等於 `NEURONS_SPEC_FIELDS`。
3. `"a snapshot stored before the change is served without the sync time or unlisted fields"` — 舊快照帶 `synapse_strong` / `updated_at` / `user_id`，讀出時被剝掉。

這三則測試合起來已經是「快照只含這些欄位」的完整守衛，且 `NEURONS_SPEC_FIELDS` 是刻意手抄（不是 import `PUBLIC_SNAPSHOT_FIELDS`），漂移會讓斷言 1 先炸。**不重新發明它**。本 change 做兩件事：

- 把該常數上方的註解「Neurons has no spec requirement of its own yet (sibling repo follow-up)」改成指向本 change 新增的 requirement 名字——現在那句話會過期。
- 新增一則測試斷言 `key_epoch`（D1 表格最後一列）不會出現在公開讀取回應：造一份帶 `key_epoch` 的舊快照，讀出後頂層不含該欄位。這是 D1 表格裡唯一「結構性成立、但目前沒有任何斷言盯著」的一項——mutation probe：把 `projectPublicSnapshot()` 的回傳值加一行 `key_epoch: snapshot.key_epoch`，這則新測試應該紅在「不含 key_epoch」那條斷言（其餘既有測試不動，因為它們不檢查 `key_epoch`）。

## D4 — Requirement 放在哪個 capability

`neurons-leaderboard`（既有 capability），ADDED 一條 requirement。不開新 capability：這條規則本來就是「neurons-leaderboard 這個系統的一個既有事實」的補文件，不是新機制。標題與既有的「D1 schema SHALL include a reserved `badges_csv` column」「Five filter tabs SHALL provide...」同一種風格（陳述系統既有行為，非全新功能）。
