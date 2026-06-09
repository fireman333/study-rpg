## Why

神經元 app 目前是純養成 + 競技榜，玩家之間沒有「輕互動」管道。新增一個「留言」tab 讓玩家選一隻自己的神經元 + 貼一段短話（開玩笑 / 國考互相加油打氣），所有留言以 DVD-logo 彈跳碰撞動畫呈現，營造同儕陪伴感。二階國考之後在 standalone repo 並行做同型功能（醫師 sprite），所以共享資料層下沉 `@study-rpg/core`、共享後端走同一個 Cloudflare Worker。

這是本 app 第一個**公開、多人共享、含使用者自由輸入文字（UGC）**的功能，與既有「私有 R2 存檔 + 受限 leaderboard 暱稱」是不同的維運/法律 surface，因此審核 / 防濫用 / quota 紀律是本 change 的一級設計，不是事後補。

## What Changes

- 新增「留言」tab（`/shoutout` route + nav link）。
- 玩家可 **post 一則**留言（一人一則，覆蓋式 UPSERT）：選一隻自己擁有的神經元 sprite + 文字（≤ 40 全形字，最多兩行）。可編輯（Worker enforce 5 分鐘冷卻 + content-hash no-op）、可刪。
- 卡片內容 = sprite（allowlist 驗證）+ **leaderboard 暱稱**（server-side join，非 client 供應）+ 留言。名稱沿用既有 leaderboard 暱稱約束，**留言本體是唯一新增的自由文字 UGC**。
- DVD-logo 彈跳碰撞動畫顯示**最新 40 則**（按 `created_at` 排序）；自己的卡片有獨特 halo、leaderboard top-N 有特殊 halo（**可被審核移除**）；hover/tap 暫停；尊重 `prefers-reduced-motion`；手機簡化碰撞（牆面反彈 + overlap-avoidance，非 O(n²)）。
- **共享後端**（同一個 sync Worker，端點 namespace `/shoutouts/*`，與 leaderboard/sync 硬隔離）：D1 per-app table（`shoutouts_neurons` + audit table）unique `(app_id, user_id)`；讀走 Cloudflare Cache API cache-on-read（不做 KV board cache）、寫走 D1 UPSERT；moderation pipeline（NFKC normalize + 去零寬字元 + collapse 空白 → blocklist）、token bucket、新帳號 gate、檢舉 rate-limit + N 人 report → soft-hide、soft-delete + audit log。
- **共享資料層下沉 `@study-rpg/core`**（content-agnostic）：message schema、結構化 avatar payload、client（fetch/upsert/delete/report）、blocklist util、leaderboard nickname + rank join。core 動 = 第三方 fork 契約 → 需 CHANGELOG entry，並以 pre-release dist-tag（`next`）publish 供二階並行 consume。
- **owner 後台工具**（launch-blocker，v1 不 defer）：刪除 / 查 normalized text / 搜 user / ban-mute user / 解除 soft-hide。
- 維持硬產品原則：登入才能 post、要有 leaderboard 暱稱才能 post、純行為觸發（無 IAP / 付費）。

## Capabilities

### New Capabilities
- `neurons-shoutout-board`: 神經元 app 的留言 tab — compose/edit/delete/report 的 UX、選 sprite、DVD-logo 彈跳渲染、own/top-N halo、reduced-motion 與手機效能上限、空狀態、自負責任 disclaimer。
- `shoutout-board-backend`: 共享後端契約（兩 app 共用）— CF Worker `/shoutouts/*` 端點、D1 schema（per-app table + audit + `(app_id, user_id)` unique）、Cache API 讀策略、moderation/abuse pipeline（normalize→blocklist、5 分鐘 cooldown、content-hash no-op、token bucket、新帳號 gate、檢舉 soft-hide）、leaderboard nickname + rank join、soft-delete + audit log、owner 後台工具，以及 `@study-rpg/core` 下沉的 content-agnostic message schema / 結構化 avatar payload / client。

### Modified Capabilities
- `core-npm-package`: published `@study-rpg/core` 新增 shoutout message schema / client / avatar-payload 型別到對外 API surface（fork 契約擴張，需 CHANGELOG + version bump）。

## Impact

- **新 route / UI**：`apps/neurons-tw/src/`（新 `ShoutoutBoardPage` + compose/edit modal + report sheet + bounce-canvas 渲染元件 + nav link）。
- **後端**：`cloudflare/sync-worker/`（新 `shoutout.ts` module + `/shoutouts/*` 端點 + D1 migration 建 `shoutouts_neurons` + audit table + index；不動既有 leaderboard/sync/presign）。
- **core**：`packages/core/src/`（新 shoutout 模組 + index export + CHANGELOG）→ publish dist-tag `next`。
- **共享 Worker 風險**：加端點是 additive；deploy 前須驗不破壞 neurons + 二階既有 leaderboard/sync/presign（per 專案「勿破壞共用 Worker」hard rule）。
- **身分依賴**：依賴既有 `neurons-leaderboard` 的 nickname + 綜合排名 + Top-100 KV 快取（post gate 要求暱稱；top-N halo 讀排名）。
- **不影響**：cloud-sync per-bundle blob 同步（留言走獨立 write 路徑）、既有 Dexie schema（留言是 server-authoritative，非 per-user 存檔的一部分 — 由 design 確認是否需要任何 local cache table）。
- **二階（study-rpg-2nd, 獨立 repo）**：consume 本 change publish 的 core `next` + 共享 Worker `/shoutouts/*`（`app_id='m2'`），渲染（醫師 sprite + halo）在該 repo 並行實作，不在本 change 範圍。
