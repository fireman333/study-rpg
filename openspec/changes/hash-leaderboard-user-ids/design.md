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

- Worker secret `LEADERBOARD_PLAYER_KEY_SECRET`（**永久** secret）。缺失或過短：衍生時丟 `PlayerKeyUnavailableError`。cron 在**任何查詢與 put 之前**取得 keyer，所以整次不寫（舊快照留著，「上次更新」會停住——跟遮罩表缺失時同一個可見訊號）；公開讀取若需補鍵 → 503；只帶鍵、不帶 `user_id` 的快照照常服務（讀它不需要 secret）；`/me`、留言讀寫、檢舉 → 503。
- **永久 secret 缺失時沒有「改送存著的鍵」的退路**（再驗收 P4）：帶 `user_id` 的列只可能是改動前或窗口期間寫的，它存著的鍵若有就是窗口鍵；截止後若永久 secret 不見而改送它們，窗口鍵就會無限期留在公開面（cron 沒有 secret 也不會覆寫）。所以這種快照一律 503；只有完全不帶 `user_id` 的快照不需要 secret、照常服務。
- **快照記錄 secret 指紋**（2026-09-24 審查後新增）：cron 在每份 KV 快照寫 `key_epoch` = `ke1_` + HMAC(secret, `"player-key-epoch"`) 前 6 bytes。它只存在 KV、projection 不會送出。讀取端的規則（`projectPublicSnapshot`、留言 `topNSet` 同一條）：
  - 列上還帶 `user_id`（改動前寫的，或相容窗期間寫的）→ 除非快照的 `key_epoch` 等於現在這把 secret 的指紋，否則**當場以現在的 secret 重算**。
  - 列上沒有 `user_id` → 只能用存著的鍵。
- **輪替永久 secret**（日後、例如外洩時；本 change 不執行）：`wrangler secret put LEADERBOARD_PLAYER_KEY_SECRET` 新值 → 所有鍵改變。沒有任何 client 持久化鍵（每次開頁從 `/me` 取），但 KV 裡終態快照的列**沒有 `user_id` 可重算**，所以最多 30 分鐘（到下一次 cron）仍送出舊鍵：自己的列不高亮、留言板光環對不上；留言板 edge cache 另有最多 90 秒舊鍵。**同時**要換掉 owner 本機副本 `~/.config/study-rpg/leaderboard-player-key.env`：遮罩指令會拿本機 secret 的指紋比對快照的 `key_epoch`，對不上就在寫入任何東西之前拒絕（不再只是靜默回報 `absent`）。**不需要版本前綴**：鍵不被 client 儲存；伺服器端需要分辨新舊的地方由 `key_epoch` 負責。若日後有人開始儲存鍵，那時再換 `pk2_`。
- 洩漏時的處置同輪替：換 secret 即讓所有已知鍵失效。

## D6 — rollout 相容窗：截止日期 ＋ 窗口專用 secret（owner 裁決 2026-09-24）

owner 原則：先 Worker 相容兩種鍵，再前端。審查發現（P2）：窗口期間公開面同時帶原始 `user_id` 與鍵，任何人抓一次就拿到永久的「鍵→uid」對照表——只要鍵在窗後不變，窗關閉後仍能把鍵還原成 uid，連帶讓兩個 app 可以 join。owner 裁決：**關窗時輪替 secret**，而且相容旗標改成**截止日期、fail closed**。

### 做法

- Worker var `LEADERBOARD_RAW_ID_COMPAT_UNTIL`（取代舊的開關 `LEADERBOARD_RAW_ID_COMPAT = "1"`，後者已不被讀取、守衛禁止它回來）。值為 `YYYY-MM-DD`（該日 00:00 UTC）或**帶時區**的時間戳（`2026-09-27T23:59:59+08:00`）。
- 窗口開啟的條件（`compatWindow(env, now)`，全部成立才開）：值可解析且是真實日期、`now` 在截止之前、截止距**這個 Worker 版本的上傳時間** ≤ 14 天（`RAW_ID_COMPAT_MAX_MS`；上傳時間來自 `version_metadata` binding `CF_VERSION_METADATA.timestamp`，缺失或無法解析 → 關）、`LEADERBOARD_PLAYER_KEY_WINDOW_SECRET` 與 `LEADERBOARD_PLAYER_KEY_SECRET` 都可用（≥32 字元）且**兩者不同**。缺值、空字串、亂值（含 `"1"`、`2026-02-30`、無時區的時間）、已過期、超過 14 天、少一把 secret、兩把相同 → **關閉**。14 天上限讓任何值都無法把窗口永久開著；committed `wrangler.jsonc` 是空字串（＝關），守衛另外檢查它不是亂值、不超過上限、且 `version_metadata` binding 還在。
- **上限的基準點為什麼是版本上傳時間**（再驗收 P3）：若以每次請求的 `now` 起算，被判「太遠」的截止日（例：把 09-28 打成 10-28）會在距截止 ≤14 天時**自己打開**，重新公開 uid 與窗口鍵，而唯一的訊號只是 cron 的 `console.warn`。版本上傳時間是固定的，所以同一個版本上被拒的值永遠被拒。考慮過的替代：另設 `…_SINCE` 變數（owner 要多填一個值、也可能打錯）、把 beyond-max 記進 KV（跨請求狀態，為一個設定錯誤多一個寫入點）——`version_metadata` 由平台給、零設定，最單純。
  - ⚠️ 已知邊界：**任何新版本**（`pnpm run deploy`，以及會產生新版本的 `wrangler secret put` / `secret delete`）都會把基準點移到那一刻。所以一個被拒的截止日，若在距它 ≤14 天時又上傳了新版本，就會在那個新版本上打開。緩解：步驟 1 的 curl 檢查（窗口沒開會在部署當下發現）、cron 的 warn、以及步驟 3 刪掉窗口 secret 後窗口無論如何都關閉。
- **輪替由 Worker 在截止時自動完成**：窗口開啟時所有鍵由窗口專用 secret 產生；截止之後改用永久 secret。窗口期間被記下的（uid, 鍵）配對，在截止那一刻起不對應任何公開的鍵。所有表面經 `publicIdentity(env, now)` 一個函式同時決定「是否帶 uid」與「用哪把 secret」，同一個請求只取一次 `now`，旗標與鍵不可能不一致。
- 截止當下 KV 裡是窗口期間寫的快照（帶 `user_id`、窗口鍵、窗口指紋）→ 指紋不符 → 讀取時以永久 secret 從 `user_id` 重算，不送 `user_id`。所以**截止後第一個讀取就是永久鍵**，不等 cron；光環同理。之後 cron 寫入永久鍵、不帶 `user_id`。
- `/me`：窗口期間回窗口鍵，截止後回永久鍵。

### 為什麼不照字面「關窗時手動 `wrangler secret put` 輪替」

窗口是自動（依截止日期）關的；如果輪替仍靠人手，截止與輪替之間會有一段不定長的空窗：公開面已不帶 uid，但送出的仍是窗口期間的鍵——被記下的對照表照樣能把它們還原成 uid。更糟的是截止後第一次 cron 就會把窗口鍵寫成不帶 `user_id` 的快照，之後輪替時 KV 裡已經沒有東西能重算，只能等下一次 cron。兩把 secret、由截止時間切換，讓「輪替」與「關窗」是同一個瞬間，而且跟截止日期一樣：忘了做也是安全的。代價是步驟 0 多產生一把 secret。

### 殘留（照實記）

- **暱稱仍是準識別碼**：窗口期間記下 (uid, 暱稱, 名次) 的人，截止後仍可能用暱稱把列對回 uid。輪替保證的是「鍵」本身不再是還原 uid 的鑰匙、且暱稱改了之後就接不上；它不讓公開的暱稱變匿名。
- 截止瞬間開著頁面的玩家：手上的 `/me` 是窗口鍵 → 自己的列不高亮、留言不認得自己，直到重新整理。截止前 ≤90 秒快取的留言板上按「檢舉」→ 送出窗口鍵或原始 id → 400，重新整理即可。
- Worker log（Cloudflare 私有 log）**刻意保留原始 uid**（`console.warn/error` 的 `user: userSub`）以便除錯；它不是公開面，不在本 change 範圍（owner 裁決 2026-09-24）。

### 部署順序（owner 執行；完整指令見 tasks 6.x 與 scratchpad `hash-leaderboard-user-ids-deploy-steps.md`）

| 步驟 | 動作（owner） | 之後的狀態 | Rollback |
|---|---|---|---|
| 0 | 產生**兩把不同**的 secret：永久那把存到 `~/.config/study-rpg/leaderboard-player-key.env`（`LEADERBOARD_PLAYER_KEY_SECRET=…`，mode 600）並 `wrangler secret put LEADERBOARD_PLAYER_KEY_SECRET`；窗口那把只 `wrangler secret put LEADERBOARD_PLAYER_KEY_WINDOW_SECRET`（不需留本機） | Worker 未變（`secret put` 會產生新版本，但程式仍是舊的） | `wrangler secret delete`（無副作用） |
| 1 | 把 `wrangler.jsonc` 的 `LEADERBOARD_RAW_ID_COMPAT_UNTIL` 填成「部署日 + 3 天」（帶 `+08:00`；上限 14 天）→ `pnpm run deploy` | 公開面帶窗口鍵＋舊欄位；舊 bundle 行為不變；新 bundle 可用 | `wrangler rollback` 回前一版 Worker ⚠️ **舊 Worker 會重新公開原始 id**（它不知道鍵），而且直到重新部署新版之前都是如此 |
| 2 | `npm publish` core 0.7.0；二階 bump 三份 package.json → `^0.7.0`、`pnpm install`、`pnpm run deploy`；neurons 隨 sibling main push 部署 | 兩個前端以鍵比對 | CF Pages 回前一個 deployment；新前端對舊 Worker 也能跑（拿不到鍵→不高亮；發文後板面不會被清空） |
| 3 | **不需任何動作**：截止時間一到，窗口自動關閉並切到永久 secret。之後（建議當天）清理：**只刪** `wrangler secret delete LEADERBOARD_PLAYER_KEY_WINDOW_SECRET`，接著 `wrangler secret list` 確認 `LEADERBOARD_PLAYER_KEY_SECRET` **仍在**（誤刪永久 secret → 所有需要鍵的讀取 503，不會洩漏，但停機）；把 `wrangler.jsonc` 的值改回 `""` 並 commit；curl 三個公開端點確認無 UUID | **終態**：無公開面帶原始 id；窗口期間的鍵全部作廢 | 要延長窗口：填新的截止日期（≤14 天）→ deploy（窗口 secret 必須還在）。⚠️ 延長＝重新公開 uid 與窗口鍵 |

步驟 3 之後仍在跑舊 bundle 的玩家：自己的列不高亮、留言 own-halo 消失、檢舉仍可用（它回送的是看到的 `authorKey`，此時已是永久鍵）。沒有資料遺失。

⚠️ **Rollback 的代價**：任何回到本 change 之前的 Worker 版本（`wrangler rollback` 到步驟 1 之前的版本）都會把原始 `user_id` 重新放回三個公開面，因為舊程式不知道鍵；新前端配舊 Worker 仍能運作（不高亮），但隱私回到改動前。回到本 change 之後、截止之前的版本則只會重新打開窗口（若截止未過）。rollback 之後要恢復隱私，唯一的路是重新部署新版 Worker。

### 版本現況（更正）

二階目前仍 pin `@study-rpg/core@^0.6.0`（lockfile 解析 0.6.5），前端型別以本地 intersection 對 0.6.x 與 0.7.0 同時成立；**二階尚未 bump 到 0.7.0**——0.7.0 尚未 publish，bump 是步驟 2 的 owner 動作。

## D7 — owner 遮罩指令

腳本以前靠快照列的 `user_id` 找人。secret 無法從 Cloudflare 讀回，所以 owner 必須保留本機副本（步驟 0 就寫進檔）。`find`：讀 KV 的第 N 名 → 從 D1 取所有公開列的 `user_id`（只取 id，不含暱稱）→ 本機算鍵對位 → 印 `user_id`。`patch` / `verify`：以鍵（或舊快照的 `user_id`）對位。缺 secret → 在任何寫入前拒絕；secret 只經環境變數傳給 node，不進 argv、不印出。推導與 Worker 相同，由腳本測試用 Worker cron 產生的快照釘住。本機副本過期（Worker 已輪替、本機沒換）→ `find` / `mask` / `unmask` 比對 composite 快照的 `key_epoch`，不符就在寫入前拒絕並點名設定檔。窗口期間快照帶 `user_id`，以 uid 對位，不做此檢查（本機只需要永久 secret）。

## D8 — CPU 預算（`sync-worker-cpu-budget`）

cron 每位公開玩家簽一次（memo，同一人出現在五個排名只算一次；另加 1 次算 secret 指紋），上限為 5 × 100 個不同玩家。memo 由測試「signs each distinct player once per refresh」釘住（審查時拿掉 memo 180 條全綠）。本機 node 量測（warm，平行）：52 次 ≈ 0.9 ms、100 次 ≈ 2.5 ms、500 次 ≈ 13 ms CPU。現況二階 52 位公開玩家、neurons 24 位，預估增加約 1 ms；二階 cron 目前 6.5 ms p99。**這是推估不是量測**——spec 要求以 `workersInvocationsAdaptive` `cpuTimeP99` 實測（`scripts/worker-cpu-gate.mjs`），列為 owner 部署後項目。若超出 10 ms：把鍵在 upsert 時寫進 D1 欄位（每次 upsert 簽一次，cron 零 HMAC），需要一個 migration——另開 change。

## Non-Goals

- 不改 D1 schema、不 backfill（D4）。
- 不改 owner 後台 `/shoutouts/:app/admin/*`（owner-only，需要原始 id 才能封鎖）。
- 不動 sibling 的 `hospital-leaderboard` 歷史副本；二階公開欄位 spec 在 study-rpg-2nd 同名 change。
- `neurons-leaderboard` spec 補快照欄位 requirement 屬第 2 輪另一個 change。
