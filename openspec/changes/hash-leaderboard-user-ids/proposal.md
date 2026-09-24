> ⚠️ **Requirement 用詞為草稿**：本 change 的 SHALL / scenario 文字由 agent 起草（2026-09-24 盤點後續第 1 輪），會另派審查，未經 owner 逐字確認。

## Why

公開排行榜（`GET /leaderboard/:filter`、`GET /leaderboard/neurons/:filter`，免登入）與 留言板（`GET /shoutouts/:app`，免登入、edge cache）把每位玩家的 Supabase `user_id` 原樣公開：排行榜每一列的 `user_id`，留言每一則的 `id` / `authorKey`。這是登入身分的穩定識別碼，公開讀者用不到它——公開列只需要彼此可區分，登入玩家只需要找到自己那一列。owner 決定改為不可逆鍵（HMAC）。

核實（2026-09-24，讀碼）：
- 公開面有 **三個**，不是任務描述的一個：兩個排行榜快照＋留言板（`shoutout.ts` `handleGetBoard` 的 `id: r.author_key, authorKey: r.author_key`，以及 PUT 回聲）。只改排行榜的話 UUID 仍從留言板公開，而且留言板的 top-N 光環是拿 KV 快照的 `user_id` 對 `author_key`——排行榜一改，光環就斷。
- KV 快照本身也存著 `user_id`，而且 owner 的遮罩指令 `scripts/mask-leaderboard-nickname.sh` 的 `find` / `patch` / `verify` 都靠快照列的 `user_id` 對位——這是第四個消費端，腳本改成拿本機一份 secret 算鍵。
- `@study-rpg/core` 的 `LeaderboardRow.updated_at` 仍是必填，但 Worker 自 `drop-sync-time-from-public-leaderboard` 起已不送——型別描述的是不會抵達的資料。

## What Changes

- 新增 **player key**：`pk1_` + base64url(HMAC-SHA256(secret, "<app_id>:<user_id>")) 前 128 bits。每個 app 各一把（二階與 neurons 的鍵彼此無關），同 app 的排行榜與留言板共用。secret 為新 Worker secret `LEADERBOARD_PLAYER_KEY_SECRET`。
- 三個公開面與 KV 快照改帶鍵，不帶 `user_id`：排行榜列 `player_key`；留言 `playerKey`（`id` / `authorKey` 在收尾後也等於鍵）。D1 不動——所有內部 join（遮罩、封鎖、檢舉、稽核、owner 後台）仍用原始 `user_id`。
- `GET /leaderboard/me`、`GET /leaderboard/neurons/me`（JWT）回傳頂層 `player_key`，即使該玩家沒有排行榜列。client 只能靠它認出自己。
- **Fail closed**：secret 缺失或短於 32 字元 → cron 不寫任何快照（保留舊的）；任何需要產生鍵的回應回 503 `player_key_unavailable`。絕不回退成原始 id。
- **Worker 先、前端後**：相容窗以**截止日期** `LEADERBOARD_RAW_ID_COMPAT_UNTIL` 設定（缺值／空字串／亂值／已過期／超過 14 天 → 關閉，fail closed）。窗口期間公開面同時帶舊欄位（`user_id`、原始 `authorKey`），讓舊 bundle 仍認得自己；**窗口期間的鍵一律由另一把 secret `LEADERBOARD_PLAYER_KEY_WINDOW_SECRET` 產生**，截止那一刻 Worker 自動改用永久 secret——窗口期間被記下的（uid, 鍵）配對從此不對應任何公開的鍵（審查後 owner 裁決：關窗必須輪替 secret）。留言板 edge cache key 改成 `v2-keyed` / `v2-compat`，deploy 或截止當下不會吐出另一種形狀的快取。
- 每份 KV 快照記錄 secret 指紋 `key_epoch`（不公開）：帶 `user_id` 的列在指紋不符時以現在的 secret 重算，所以截止後第一個讀取就是永久鍵；owner 遮罩指令以它偵測本機 secret 副本過期。
- 檢舉：`targetAuthorKey` 接受公開鍵，Worker 以「所有未刪除的發文者」（含已隱藏）反查——檢舉已被隱藏的留言照舊回 `{ ok: true, hidden }`；窗外拒收原始 id。
- neurons 前端改以 `/me` 的鍵比對自己的列與留言（新 hook `useOwnPlayerKey`）。
- owner 遮罩指令改讀本機 secret 副本（env 或 `~/.config/study-rpg/leaderboard-player-key.env`），缺 secret 則在寫入任何東西前拒絕。
- **BREAKING** `@study-rpg/core` **0.7.0**：`LeaderboardRow.player_key` 新增、`user_id` 改選填並標 deprecated、`updated_at` 改選填；`ShoutoutMessage.playerKey` 新增。pre-1.0 政策下屬 breaking → MINOR。

## Capabilities

### New Capabilities
- `public-player-key`: 公開排行榜與留言板以不可逆的每 app 玩家鍵識別玩家——衍生、fail closed、/me 取得自己的鍵、rollout 相容窗、檢舉與光環以鍵對位、CPU 預算。

### Modified Capabilities
- `core-npm-package`: ADDED 一條 requirement（0.7.0 的 row / message 身分欄位）。

二階（`hospital-leaderboard`）的公開欄位清單與前端比對規則由 study-rpg-2nd 同名 change 處理。sibling 內 `hospital-leaderboard` 是拆 repo 前的歷史副本，不動。`shoutout-board-backend`、`neurons-shoutout-board`、`neurons-leaderboard` 既有文字在語意上仍成立（「author key」「author matches the signed-in player」），新規則以新 capability 補上，不重述。

## Impact

- **Worker**：新 `src/player-key.ts`；`public-snapshot.ts`、`leaderboard.ts`、`neurons-leaderboard.ts`、`shoutout.ts`、`index.ts`（Env）、`wrangler.jsonc`（compat var）、`scripts/mask-leaderboard-nickname.sh`。README / `docs/LEADERBOARD.md` secret 清單。
- **core**：`leaderboard-types.ts`、`shoutout.ts`、`package.json` 0.7.0、CHANGELOG。
- **neurons 前端**：`lib/services/neurons-leaderboard.ts`、`lib/hooks/useOwnPlayerKey.ts`（新）、`routes/LeaderboardPage.tsx`、`routes/ShoutoutBoardPage.tsx`。
- **Owner 關卡（agent 不執行）**：兩把 secret `wrangler secret put` → 填截止日期、Worker deploy → `npm publish` core 0.7.0 → 二階 bump + deploy、neurons deploy（= push main）→ 截止自動關窗；之後清理窗口 secret 與設定值。順序與 rollback 見 design D6。
- **Risk**：cron 多了 HMAC 成本（本機量測 52 次 ≈ 0.9 ms、100 次 ≈ 2.5 ms，node 近似；二階 cron 目前 6.5 ms p99）——上線後須以 `workersInvocationsAdaptive` 實測，見 design D8。
