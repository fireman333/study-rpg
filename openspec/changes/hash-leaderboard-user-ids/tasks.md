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

## 6. Owner 部署（agent 不執行，順序見 design D6；指令全文見 scratchpad `hash-leaderboard-user-ids-deploy-steps.md`）

- [ ] 6.1 產生兩把不同的 secret：永久那把存本機檔並 `wrangler secret put LEADERBOARD_PLAYER_KEY_SECRET`；窗口那把 `wrangler secret put LEADERBOARD_PLAYER_KEY_WINDOW_SECRET`
- [ ] 6.2 `wrangler.jsonc` 的 `LEADERBOARD_RAW_ID_COMPAT_UNTIL` 填「部署日 + 3 天」（帶 `+08:00`）→ Worker deploy
- [ ] 6.3 部署後以 `scripts/worker-cpu-gate.mjs` / `workersInvocationsAdaptive` 量兩個 leaderboard cron 的 `cpuTimeP99`（design D8；超過 10 ms → 鍵移到寫入時）
- [ ] 6.4 publish core → 二階 bump + deploy；neurons 部署（push main）
- [ ] 6.5 截止時間過後（自動關窗、自動換成永久 secret）：**只刪** `wrangler secret delete LEADERBOARD_PLAYER_KEY_WINDOW_SECRET`，再 `wrangler secret list` 確認 `LEADERBOARD_PLAYER_KEY_SECRET` 仍在；`wrangler.jsonc` 的值改回 `""` 並 commit
- [ ] 6.6 終態後以 `curl` 實測三個公開端點無 UUID，且 `player_key` 與截止前抓到的不同

## 7. 審查後修正（2026-09-24，owner 裁決＋fresh-context 審查）

- [x] 7.1 相容旗標改為截止日期 `LEADERBOARD_RAW_ID_COMPAT_UNTIL`：缺值／空字串／亂值／無時區時間戳／已過期／超過 14 天 → 關閉；舊旗標 `LEADERBOARD_RAW_ID_COMPAT` 不再被讀取；committed `wrangler.jsonc` 為 `""`（`player-key.ts` `compatWindow()`）
- [x] 7.2 關窗即輪替：窗口期間以 `LEADERBOARD_PLAYER_KEY_WINDOW_SECRET` 衍生，截止後以永久 secret；窗口 secret 缺失／過短／與永久相同 → 窗口關閉；所有表面經 `publicIdentity(env, now)`
- [x] 7.3 KV 快照記錄 `key_epoch`；projection 與留言 `topNSet` 對帶 `user_id` 的列在指紋不符時以現在的 secret 重算（截止後第一個讀取即為永久鍵、光環對得上）
- [x] 7.4 遮罩指令：本機 secret 指紋與快照 `key_epoch` 不符 → 寫入前拒絕並點名設定檔；窗口期間以 `user_id` 對位不檢查
- [x] 7.5 檢舉已隱藏留言：反查母體改為「未刪除」（含已隱藏），回 `{ ok: true, hidden }` 而非 400
- [x] 7.6 守衛：deadline 表（過期／未過期／缺值／亂值／超過上限／secret 缺或相同）、截止後重算三條、每人每 run 只簽一次（spy `crypto.subtle.sign`）、production 不得直接呼叫 `playerKeyer(`、不得讀舊旗標、committed `wrangler.jsonc` 不得把窗口開著、腳本過期 secret；mutation probe W9–W21 皆紅在目標斷言
- [x] 7.7 neurons：`applyMine` 在回聲無 `playerKey`（舊 Worker）時不過濾；`useOwnPlayerKey(userId, accessToken)` 以帳號為 key、token refresh 不重抓不閃爍；守衛 + probe N3、N4
- [x] 7.8 抽出 `src/__tests__/strip-comments.ts`（兩份既有相同副本＋本次需要的第三份收成一份）
- [x] 7.9 design：D5（指紋、日後輪替、本機副本）、D6（截止＋窗口 secret、部署步驟、rollback 回舊 Worker 會重新公開原始 id）、Worker log 刻意保留原始 uid、二階尚未 bump 0.7.0 的更正
- [x] 7.10 Worker typecheck / test、neurons typecheck / test、`openspec validate --all --strict`

## 8. 再驗收修正（2026-09-24）

- [x] 8.1 14 天上限改以 `CF_VERSION_METADATA.timestamp`（版本上傳時間）為固定基準；binding 缺或時間戳無法解析 → 窗口關閉；`wrangler.jsonc` 加 `version_metadata` binding（`wrangler deploy --dry-run` 列出 `env.CF_VERSION_METADATA`）
- [x] 8.2 移除「永久 secret 缺失 → 改送存著的鍵」退路；帶 `user_id` 的快照一律需要現行 secret，否則 503
- [x] 8.3 行為層快取測試：窗口期間寫入的留言板快取，截止後的讀取不會拿到（有記憶的 cache stub）
- [x] 8.4 遮罩指令：讀不到 composite 快照 → 寫入前拒絕（原本放行）
- [x] 8.5 部署步驟 3：只刪窗口 secret，`wrangler secret list` 確認永久 secret 仍在
- [x] 8.6 守衛與 mutation probe W23–W28 皆紅在目標斷言
