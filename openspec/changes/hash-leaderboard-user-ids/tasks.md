## 1. 核實與設計

- [x] 1.1 推導公開 `user_id` 的所有消費端（Worker / 兩個前端 / owner 腳本 / 測試 fixture），寫進 design D1（推導指令一併記錄；`neurons-leaderboard.ts` 需 `grep -a`）
- [x] 1.2 確認任務描述之外的兩個公開面：留言板 `GET /shoutouts/:app` 與 PUT 回聲、以及 KV 快照本身（design D1）
- [x] 1.3 決定「我的列」解法（`/me` 回 `player_key`，design D3）、secret／輪替／backfill（D4、D5）、部署順序與 rollback（D6）

## 2. Worker

- [x] 2.1 `src/player-key.ts`：HMAC 衍生、app 綁定、`pk1_` 格式、最短 32 字元、fail closed、`rawIdCompat()`
- [x] 2.2 `Env` 加 `LEADERBOARD_PLAYER_KEY_SECRET`、`LEADERBOARD_RAW_ID_COMPAT`；`wrangler.jsonc` 設 compat `"1"`（rollout 步驟 1）並註明要刪
- [x] 2.3 `public-snapshot.ts`：projection 為舊快照補鍵、compat 外不送 `user_id`；`keyStoredRows()` 給 cron 用
- [x] 2.4 二階 / neurons 排行榜：`PUBLIC_SNAPSHOT_FIELDS` 以 `player_key` 取代 `user_id`；cron 在任何查詢前取 keyer；公開讀取 503；`/me` 回頂層 `player_key`
- [x] 2.5 留言板：`playerKey`、compat 外 `id` / `authorKey` 為鍵、top-N 以鍵對位（含舊快照）、edge cache key `v2-keyed` / `v2-compat`、PUT 與檢舉 fail closed、檢舉以鍵反查
- [x] 2.6 owner 遮罩指令：本機 secret 副本、`find` 以鍵反查 `user_id`、`patch` / `verify` 以鍵對位、缺 secret 在寫入前拒絕、secret 不進 argv 不印出
- [x] 2.7 README / `docs/LEADERBOARD.md`：secret 清單與快照範例

## 3. core（0.7.0）

- [x] 3.1 `LeaderboardRow.player_key` 新增、`user_id` 選填＋deprecated、`updated_at` 選填
- [x] 3.2 `ShoutoutMessage.playerKey` 新增，`authorKey` / `id` 文件改為 opaque
- [x] 3.3 版本 0.6.5 → 0.7.0（pre-1.0 breaking = MINOR）、CHANGELOG entry
- [ ] 3.4 **owner**：`cd packages/core && npm publish`（agent 不執行）

## 4. neurons 前端

- [x] 4.1 `fetchMyPlayerKey()` + `useOwnPlayerKey` hook；拿不到回 null，不退回 user id
- [x] 4.2 `LeaderboardPage`（`findRank` / `LeaderboardGrid`）與 `ShoutoutBoardPage`（mine / isSelf / 刪除）改以鍵比對

## 5. 測試與守衛

- [x] 5.1 `player-key.test.ts`（23 條）：衍生性質、fail closed（cron 零寫入、讀取 503、已帶鍵快照仍可讀）、終態無 UUID（全文 UUID 掃描，不列欄位名）、compat 窗、光環、檢舉
- [x] 5.2 既有 Worker 測試改為以鍵對位（public-snapshot、nickname-mask、mask script）；script 測試新增缺 secret 拒絕與「快照不含 user_id 仍能 find」
- [x] 5.3 neurons 守衛 `leaderboard-public-identity.test.ts`（母體由原始碼推導）
- [x] 5.4 mutation probe：W1–W8、N1–N2 全部紅在目標斷言（見報告；N2 第一次只紅在正向斷言 → 規則加粗後重跑紅在目標斷言）
- [x] 5.5 Worker typecheck / test、core typecheck / test、neurons typecheck / test、`openspec validate --all --strict`

## 6. Owner 部署（agent 不執行，順序見 design D6）

- [ ] 6.1 產生 secret、存本機檔、`wrangler secret put LEADERBOARD_PLAYER_KEY_SECRET`
- [ ] 6.2 Worker deploy（compat on）
- [ ] 6.3 部署後以 `scripts/worker-cpu-gate.mjs` / `workersInvocationsAdaptive` 量兩個 leaderboard cron 的 `cpuTimeP99`（design D8；超過 10 ms → 鍵移到寫入時）
- [ ] 6.4 publish core → 二階 bump + deploy；neurons 部署（push main）
- [ ] 6.5 舊 bundle 汰換後刪 `wrangler.jsonc` 的 `LEADERBOARD_RAW_ID_COMPAT` → Worker deploy（終態）
- [ ] 6.6 終態後以 `curl` 實測三個公開端點無 UUID
