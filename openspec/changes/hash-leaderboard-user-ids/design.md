# Design — hash-leaderboard-user-ids

> Requirement 用詞為草稿、會另派審查。本檔是兩個 repo 同名 change 的主設計；study-rpg-2nd 的 design 只寫二階前端的部分並指回這裡。

## Context

免登入的公開面把 Supabase `user_id` 原樣送出。它是登入身分的穩定識別碼：知道它不能登入，但它把同一個人在不同表面（兩個排行榜、兩個留言板、任何未來把 id 寫出去的地方）串起來，也是任何「以 id 查人」工具的鑰匙。公開讀者只需要：(a) 列與列可區分（React key、名次）；(b) 登入玩家能找到自己。兩者都不需要帳號 id。

## D1 — 消費端清單（推導方式與結果）

**推導方式（不手列）**：
1. 兩個 repo 全文掃描打到公開端點或快照的檔：`grep -rlan "top100\|/leaderboard/\|shoutouts/"`（排除 node_modules / dist / openspec / docs / tests）。
2. Worker 內所有讀寫 `user_id` / `author_key` / `authorKey` 的位置：`grep -an "user_id\|author_key\|authorKey" cloudflare/sync-worker/src/*.ts`（⚠️ 必須 `-a`：`neurons-leaderboard.ts` 被 grep 判成 binary，不加 `-a` 會回報零命中）。
3. 前端：以產生公開資料的型別 / fetcher 為根（`PublicLeaderboardRow` / `fetchLeaderboardSnapshot` / `ShoutoutMessage` / `fetchShoutoutBoard`，neurons 為 `LeaderboardSnapshot` / …）推導檔案集合——這也是兩個前端守衛的母體，第 N+1 個頁面 import 它們的當天就被涵蓋。

**結果**：

| 消費端 | 讀什麼 | 用途 | 處理 |
|---|---|---|---|
| Worker `leaderboard.ts` cron / `GET /leaderboard/:filter` | D1 `user_id` → KV `rows[].user_id` → 公開 | 發佈 | 改寫 `player_key`；讀取端為舊快照補鍵 |
| Worker `neurons-leaderboard.ts` 同上 | 同上 | 發佈 | 同上 |
| Worker `shoutout.ts` `handleGetBoard` / PUT 回聲 | `author_key` → `id` / `authorKey` | 發佈 | `playerKey`；收尾後 `id` / `authorKey` 也是鍵 |
| Worker `shoutout.ts` `topNSet` | KV composite `rows[].user_id` 對 `author_key` | top-N 光環 | 改以鍵對鍵；舊快照（只有 `user_id`）當場補鍵 |
| Worker `shoutout.ts` `handleReport` | body `targetAuthorKey`（來自公開 `authorKey`） | 反查被檢舉者 | 以鍵反查（D5） |
| Worker `nickname-mask.ts` JOIN、封鎖、稽核、admin 後台 | D1 `user_id` / `author_key` | 內部 | **不動**——只在公開邊界換鍵 |
| Worker `/me`、`/my-rank`、`DELETE /me` | JWT `sub` | 本人 | `/me` 另回 `player_key` |
| owner 指令 `mask-leaderboard-nickname.sh` | KV `rows[].user_id`（`find` / `patch` / `verify`） | 依名次找人、改寫快照 | 本機 secret 副本算鍵（D6） |
| 二階 `LeaderboardPage`（`MyRankChip` / `LeaderboardList` / `MyRowSticky`）、`masked-nickname.ts` | `row.user_id === currentUserId` | 我的列、名次、遮罩通知 | `row.player_key === ownPlayerKey`（study-rpg-2nd） |
| 二階 `ShoutoutBoardPage` | `m.authorKey === userId` | 我的留言、own-halo、刪除 | `m.playerKey === ownPlayerKey`（study-rpg-2nd） |
| neurons `LeaderboardPage`（`findRank` / `LeaderboardGrid`） | `row.user_id === profile.user_id` | 我的列、名次 | `row.player_key === ownPlayerKey` |
| neurons `ShoutoutBoardPage` | `m.authorKey === userId` | 同二階 | `m.playerKey === ownPlayerKey` |
| 二階 layout 測試 fixture | `user_id` | 假資料 | 改 `player_key` |

找不到的東西也記下：`/my-rank` 不帶 id；`nickname-check` 不帶 id；D1 以外沒有第二份存原始 id 的公開快取（留言板 edge cache 例外，見 D4）。

## D2 — 鍵的形式

`pk1_` + base64url(HMAC-SHA256(secret, `"<app_id>:<user_id>"`))[:16 bytes]。

- **HMAC 而非純 hash**：UUID 不是秘密輸入，純 hash 讓任何握有候選 id 的人一算就能確認身分。
- **app_id 進訊息**：同一人在二階與 neurons 的鍵無關，兩個公開榜不能互相 join。同 app 的排行榜與留言板共用（光環要對位）。
- **128 bits**：碰撞可忽略；22 字元當 React key 也不突兀。
- **`pk1_` 前綴**：讓檢舉端點分辨「這是鍵」與「這是別的東西」。輪替 secret 不換前綴（D5）。
- **secret 最短 32 字元**，否則視同缺失（fail closed）。文件指令 `openssl rand -base64 48`。

## D3 — 「我的列」怎麼認

client 沒有 secret，算不出鍵。選項：
- (a) 公開讀取帶上 JWT 時由 Worker 標 `is_me` —— 否決：公開讀取從此依賴身分、每次都要驗 JWT（CPU）、快照與留言板都不能再共用快取。
- (b) **JWT-gated `GET /leaderboard/me` 回傳呼叫者的 `player_key`**（採用）。頂層欄位、`row: null` 時也有——它只依賴 `sub`；刪了排行榜列的人仍可能留著留言。前端各一個 `useOwnPlayerKey` hook。拿不到（舊 Worker、503、網路）→ 什麼都不認成自己；絕不退回用 auth user id。

二階 `MyRankChip` 在鍵尚未抵達時走 `/my-rank` 精確查詢，名次仍正確，只多一個請求。

## D4 — 快照與快取的過渡

- **KV**：cron 寫入時就換成鍵，KV 不再存原始 id。部署當下 KV 裡是舊快照（≤30 分鐘前寫的），公開讀取端對「有 `user_id`、沒 `player_key`」的列當場補鍵並丟掉 `user_id`——跟 `drop-sync-time-from-public-leaderboard` 同一條原則：撤回在 deploy 生效，不等下一次 cron。**不需要 backfill**：D1 本來就只存原始 id 且內部照用；KV 最多 30 分鐘自然換新。
- **留言板 edge cache**：key 由 `board/<app>/v1` 改為 `v2-keyed` / `v2-compat`。不改的話 deploy 後最多 90 秒（max-age 30 + swr 60）仍吐舊形狀；compat 切換也會改變 body 形狀，所以模式也進 key。

## D5 — secret、輪替、fail closed

- Worker secret `LEADERBOARD_PLAYER_KEY_SECRET`。缺失或過短：`playerKeyer` 丟 `PlayerKeyUnavailableError`。cron 在**任何查詢與 put 之前**取得 keyer，所以整次不寫（舊快照留著，「上次更新」會停住——跟遮罩表缺失時同一個可見訊號）；公開讀取若需補鍵 → 503；已帶鍵的快照照常服務（讀它不需要 secret）；`/me`、留言讀寫、檢舉 → 503。
- **輪替**（只寫入 design，不執行）：`wrangler secret put` 新值 → 所有鍵改變。沒有任何 client 持久化鍵（每次開頁從 `/me` 取），所以唯一影響是 ≤30 分鐘內 KV 仍是舊鍵：自己的列不高亮、留言板光環對不上，直到下一次 cron。要立刻生效就在輪替後觸發一次 cron（或等 30 分鐘）。owner 本機副本要一起換。**不需要版本前綴**：鍵不被儲存，所以不存在「新舊鍵並存要分辨」的情況；若日後有人開始儲存鍵，那時再換 `pk2_`。
- 洩漏時的處置同輪替：換 secret 即讓所有已知鍵失效。

## D6 — rollout 相容窗（owner 原則：先 Worker 相容兩種鍵，再前端）

Worker var `LEADERBOARD_RAW_ID_COMPAT`。`"1"` 時：公開列同時帶 `user_id`；留言 `id` / `authorKey` 仍是原始 id、另加 `playerKey`；檢舉接受原始 id。缺席（預設、終態）時三者都沒有。所有表面經 `rawIdCompat(env)` 一個函式讀它。

`wrangler.jsonc` 已設 `"1"`（步驟 1 的狀態），並註明要刪。

### 部署順序

| 步驟 | 動作（owner） | 之後的狀態 | Rollback |
|---|---|---|---|
| 0 | `openssl rand -base64 48` 存到 `~/.config/study-rpg/leaderboard-player-key.env`（`LEADERBOARD_PLAYER_KEY_SECRET=…`，mode 600），`wrangler secret put LEADERBOARD_PLAYER_KEY_SECRET` 貼同一個值 | Worker 未變 | `wrangler secret delete`（無副作用） |
| 1 | Worker deploy（compat = "1"）：`cd cloudflare/sync-worker && pnpm run deploy` | 公開面帶鍵＋舊欄位；舊 bundle 行為不變；新 bundle 可用 | `wrangler rollback`（回前一版 Worker） |
| 2 | `npm publish` core 0.7.0；二階 bump 三份 package.json → `^0.7.0`、`pnpm install`、`pnpm run deploy`；neurons 隨 sibling main push 部署 | 兩個前端以鍵比對 | CF Pages 回前一個 deployment；前端對舊 Worker 也能跑（拿不到鍵→不高亮） |
| 3 | 等舊 bundle 汰換（建議 ≥24h），刪 `wrangler.jsonc` 的 `LEADERBOARD_RAW_ID_COMPAT` 行 → Worker deploy | **終態**：無公開面帶原始 id | 把該行加回 → deploy |

步驟 3 之後仍在跑舊 bundle 的玩家：自己的列不高亮、留言 own-halo 消失、檢舉仍可用（它回送的是看到的 `authorKey`，此時已是鍵）。沒有資料遺失。

⚠️ 步驟 3 忘了做 = 公開面永遠同時帶原始 id。tasks.md 把它列為未勾的 owner 項。

## D7 — owner 遮罩指令

腳本以前靠快照列的 `user_id` 找人。secret 無法從 Cloudflare 讀回，所以 owner 必須保留本機副本（步驟 0 就寫進檔）。`find`：讀 KV 的第 N 名 → 從 D1 取所有公開列的 `user_id`（只取 id，不含暱稱）→ 本機算鍵對位 → 印 `user_id`。`patch` / `verify`：以鍵（或舊快照的 `user_id`）對位。缺 secret → 在任何寫入前拒絕；secret 只經環境變數傳給 node，不進 argv、不印出。推導與 Worker 相同，由腳本測試用 Worker cron 產生的快照釘住。

## D8 — CPU 預算（`sync-worker-cpu-budget`）

cron 每位公開玩家簽一次（memo，同一人出現在五個排名只算一次），上限為 5 × 100 個不同玩家。本機 node 量測（warm，平行）：52 次 ≈ 0.9 ms、100 次 ≈ 2.5 ms、500 次 ≈ 13 ms CPU。現況二階 52 位公開玩家、neurons 24 位，預估增加約 1 ms；二階 cron 目前 6.5 ms p99。**這是推估不是量測**——spec 要求以 `workersInvocationsAdaptive` `cpuTimeP99` 實測（`scripts/worker-cpu-gate.mjs`），列為 owner 部署後項目。若超出 10 ms：把鍵在 upsert 時寫進 D1 欄位（每次 upsert 簽一次，cron 零 HMAC），需要一個 migration——另開 change。

## Non-Goals

- 不改 D1 schema、不 backfill（D4）。
- 不改 owner 後台 `/shoutouts/:app/admin/*`（owner-only，需要原始 id 才能封鎖）。
- 不動 sibling 的 `hospital-leaderboard` 歷史副本；二階公開欄位 spec 在 study-rpg-2nd 同名 change。
- `neurons-leaderboard` spec 補快照欄位 requirement 屬第 2 輪另一個 change。
