## Context

神經元 app 第一個「公開、多人共享、含使用者自由輸入文字（UGC）」功能。既有後端：共享 Cloudflare Worker（`api.med-study-rpg.com`）+ D1（leaderboard，per-app table + hourly cron Top-100 → KV）+ R2（per-user 存檔）+ Supabase Auth（Google OAuth）。本設計經 grill-me Quick + codex (gpt-5.5) adversarial 第二意見收斂，權威紀錄：`~/.claude/scratch/grilled-neurons-留言板-shoutout-2026-06-09.md`。

二階國考（standalone repo `study-rpg-2nd`）之後並行做同型功能（醫師 sprite），故共享資料層下沉 `@study-rpg/core`、共享後端走同一 Worker 的 `/shoutouts/*` 端點。

關鍵約束：core 必須 content-agnostic（無醫學名詞）；勿破壞共享 Worker 既有 leaderboard/sync/presign；Cloudflare 壓在免費/低成本（D1 寫 10 萬/天、KV 寫 1,000/天 free corner）。

## Goals / Non-Goals

**Goals:**
- neurons 玩家可貼一則「神經元 sprite + leaderboard 暱稱 + ≤40 字短話」並以 DVD-logo 彈跳動畫看到全體最新 40 則。
- 公開 UGC 的審核 / 防濫用 / quota 紀律是一級設計（不是事後補）。
- 共享契約（core message 模組 + Worker `/shoutouts/*` + D1 schema）穩定到二階能在獨立 repo 並行 consume。
- v1 即附 owner 後台審核工具（launch-blocker）。

**Non-Goals:**
- 二階的醫師渲染（在 study-rpg-2nd repo 並行做，不在本 change）。
- 即時聊天 / 多則 / threads / 回覆 / 按讚（一人一則覆蓋式，刻意不做成聊天室）。
- avatar「使用者真的擁有該 sprite」的嚴格驗證（列 optional，見 Decision 2）。
- 跨 app 共用同一則留言（per-app 板：neurons 一則、m2 一則）。

## Decisions

### Decision 1 — 卡片構成與名稱來源（server-join，非 client 供應）
卡片 = sprite（結構化 avatar payload）+ **leaderboard 暱稱**（GET 時 server-side join，不存在留言 row、不由 client 送）+ 留言（唯一自由文字 UGC）。
- **理由**：名稱改 server 來源 → 直接消滅「自訂名稱繞 blocklist」「偽造他人名字」兩個 abuse vector；玩家在排行榜改暱稱，留言板同步更新；名稱沿用既有 leaderboard 暱稱約束（2–12 codepoint、NFKC、撞名檢查），不新增第二個 UGC 審核面。
- **取捨**：neuron-instance-rename 的自訂神經元名**不上板**（只在自己 collection 內裝飾）。Owner 已拍板接受。

### Decision 2 — 結構化 avatar payload（charset/shape 驗證必做，擁有驗證 optional）
payload = `{ avatarType: 'neuron', assetId: string, cosmeticId?: string }`。
- **MUST**：Worker 驗證 shape + 每欄 charset/length（`assetId` / `cosmeticId` match `^[A-Za-z0-9._-]{1,64}$`、`avatarType` ∈ 固定 enum），不符即 reject。渲染端用 `assetId` 在本地 catalog **查表**取 sprite，未知 id → placeholder sprite（**永遠不 innerHTML、不從 client 字串渲染**）。→ 這一層關掉所有注入/XSS/破版。
- **OPTIONAL（defer）**：驗證 user 真的擁有該 sprite。只擋「秀沒有的神經元」純炫耀謊言、非資安洞，省單人後端工；之後嫌有人作弊再補（Worker 需「使用者擁有哪些 sprite」的便宜來源，見 Open Questions）。
- **Alternatives 拒絕**：opaque payload（codex 點名危險：可塞 URL/SVG/HTML/R2 key）。

### Decision 3 — 共享後端：CF Worker `/shoutouts/*` + per-app D1 + Cache API 讀
- 沿用同一 sync Worker，新 module `cloudflare/sync-worker/src/shoutout.ts`，端點 namespace `/shoutouts/*`，**與 sync/leaderboard handler 硬隔離**（auth middleware 可共用，但 rate-limit / 權限邏輯不揉進 leaderboard）。
- **端點契約**：
  - `GET /shoutouts/:app` → 最新 40 則（`created_at` desc、非 deleted、非 hidden），每筆 = `{ id, authorKey(opaque 穩定 id，client 比對自己), nickname(join), isTopN(查 KV Top-100), avatar:{avatarType,assetId,cosmeticId?}, message, createdAt, updatedAt }`。回 `Cache-Control: max-age=30, stale-while-revalidate=60`，走 Cloudflare **Cache API** cache-on-read（**不做 KV board cache**，避免 40 人反覆編輯燒爆 KV 1,000 writes/天；KV 留給既有 Top-100）。cache key app-scoped `shoutouts:list:neurons:v1`。
  - `PUT /shoutouts/:app`（auth）→ upsert 自己那則 `{avatar, message}`；moderation pipeline（見 Decision 4）；回存好的 row → 作者 client 用 response **自更新畫面，不等 list cache**（承認 edge cache eventual consistency / 跨 PoP 不一致）。
  - `DELETE /shoutouts/:app`（auth）→ soft-delete 自己那則 + 寫 audit。
  - `POST /shoutouts/:app/report`（auth）→ 檢舉一則 message id；rate-limit + 記 reporter；distinct reporter ≥ **N_REPORT_HIDE**（預設 3）→ soft-hide 待 review。
  - `GET|POST /shoutouts/:app/admin/*`（owner-role auth）→ 後台：列含 hidden/normalized text、硬刪、ban/mute user、解除 soft-hide。
- **D1 schema**（migration，可 rollback）：
  - `shoutouts_neurons`：`author_key TEXT PRIMARY KEY, avatar_type TEXT, asset_id TEXT, cosmetic_id TEXT NULL, message TEXT, message_normalized TEXT, content_hash TEXT, created_at INTEGER, updated_at INTEGER, deleted INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0`。Index `(deleted, hidden, created_at DESC)` 給 latest-40。Per-app table → PK `author_key` 即達成 `(app_id, author_key)` unique（一人一則 per app）。
  - `shoutout_audit`：append-only — `id, app_id, author_key, action(create|edit|delete|hide|admin_delete|unhide|ban), message_original, message_normalized, avatar_json, reporter_key NULL, reason NULL, ts`。
  - `shoutout_reports`：`app_id, target_author_key, reporter_key, ts`，unique `(app_id, target_author_key, reporter_key)`（同一人不能灌爆同一目標）。
  - `shoutout_bans`：`app_id, author_key, until_ts NULL(永久), reason, ts`。
- **理由**：與 leaderboard 一致（D1+Worker+零 egress）、二階已打同一 Worker；Cache API 免 KV-coherence bug + 免 1,000 writes/天角落。
- **Alternatives 拒絕**：Supabase table（egress 配額）；每次 write 更新 KV latest-40（40 人編輯就燒爆 KV）。

### Decision 4 — Moderation / 防濫用 pipeline（順序固定）
`PUT`/`report` 進來依序：
1. **auth**（Supabase JWT 驗證）→ 失敗 401。
2. **ban check**（`shoutout_bans` 內且未過期 → 403）。
3. **nickname gate**：無 leaderboard 暱稱 → 422，前端導去既有 `NicknameField` 流程。
4. **新帳號 gate**：帳號需 age ≥ 門檻或已完成 ≥1 次正常遊戲 sync 才能 post（擋免洗 OAuth）。
5. **token bucket**：每 user 預設 6 次/hr、30 次/天（dogfood-tunable）。
6. **5 分鐘冷卻**：距上次寫入 < 300s → 429；但 **content-hash no-op** 先判：message+avatar 的 hash 沒變 → 回 204 不寫 D1（省 quota + 等同 If-Match）。
7. **normalize**：NFKC → 去零寬字元 → collapse 空白 → strip bidi override chars。
8. **length**：grapheme cluster ≤ 40（非 JS `.length`），> 兩行 reject。
9. **blocklist**（繁中關鍵字）+ **PII regex**（手機 / email / 身分證）→ 命中 **reject**（預設，非 mask），回友善訊息。
10. **UPSERT**（`created_at` 編輯時保留、`updated_at` bump）+ 寫 audit row。
- 渲染端：message + nickname 一律 `textContent`，禁 HTML / bidi。

### Decision 5 — 排序、halo、效能
- latest-40 按 **`created_at`**（編輯換內容不換位置，不鼓勵刷存在感）。userbase >> 40 才考慮改隨機抽樣（dogfood-gated）。
- 自己 halo（client 用 `authorKey` 比對自己）；top-N halo（`isTopN` 來自既有 KV Top-100；**N = Top 10 預設**，dogfood-tunable）；留言被 hidden → `isTopN` 不發、halo 暫停（審核可移除 halo）。
- 動畫 ~50–70 px/s；`prefers-reduced-motion` → 降速/靜態網格；hover/tap 暫停；手機**不做 O(n²) 完整彈性碰撞**，簡化牆面反彈 + overlap-avoidance，限 FPS / sprite size。⚠️ 背景分頁 RAF 節流（`chrome_mcp_raf_throttle`）。

### Decision 6 — core 切線（content-agnostic）+ sequencing
- `@study-rpg/core` 新增 shoutout 模組：message 型別、結構化 avatar payload 型別、client（fetch/upsert/delete/report）、blocklist/normalize util、nickname+rank join 的 response 型別。**純 generic**（asset id 字串、無醫學詞）。core 動 = fork 契約 → CHANGELOG entry + version bump，以 **pre-release dist-tag `next`** publish 供二階並行 consume。
- **Sequencing（vertical-slice-first，codex 修正）**：① design 鎖契約（本檔 + specs）→ ② neurons 做 post/list/delete/report + 簡單渲染 vertical slice 跑通 → ③ 把驗證過的 types/client/schema 抽進 core → ④ publish `next` → ⑤ 二階在獨立 repo 並行接。不先把 core 完美化。

## Risks / Trade-offs

- **公開 UGC 法律/騷擾 liability** → 前端自負責任 disclaimer + 登入 gate + 審核 pipeline + 檢舉 soft-hide + soft-delete/audit log + owner 後台（launch-blocker）。
- **共享 Worker 加端點可能斷既有 leaderboard/sync/presign** → `/shoutouts/*` 硬隔離、D1 table 分開、migration 可 rollback；deploy 前跑既有 leaderboard/sync/presign smoke。
- **Edge cache 跨 PoP 不一致** → 對 shoutout 非即時可接受；作者 client 寫後自更新、不等 list cache；UX 承認 eventual consistency。
- **KV free 1,000 writes/天** → 不做 KV board cache（用 Cache API）；既有 Top-100 cron 不變。
- **Unicode / homoglyph 繞 blocklist** → normalize（NFKC + 去零寬 + collapse + bidi strip）後才比對；blocklist 擋不全 → 靠快速檢舉 + 後台。
- **檢舉被武器化** → report rate-limit + 記 reporter + unique(reporter,target) + 只 soft-hide 不即時永久刪。
- **avatar 擁有驗證 defer → 有人秀沒有的 sprite** → 純炫耀、非資安；接受，之後補。
- **`created_at` 排序在 userbase >> 40 時前 40 人霸板** → 規模還遠；dogfood 觸發再換隨機抽樣。

## Migration Plan

1. D1 migration 建 `shoutouts_neurons` + `shoutout_audit` + `shoutout_reports` + `shoutout_bans`（additive，可 rollback）；走 dashboard D1 console 或 per-statement（per 專案 wrangler 4.x multi-statement 限制）。
2. 部署 Worker（新 `/shoutouts/*`，既有 handler 不動）→ smoke 既有 leaderboard/sync/presign 未斷。
3. neurons app ship `/shoutout` tab（vertical slice）。
4. 抽 core 模組 → `pnpm --filter @study-rpg/core build` → publish dist-tag `next` + CHANGELOG。
5. 二階（獨立 repo）日後 consume。
- **Rollback**：拔 nav link / route（前端）；Worker `/shoutouts/*` 端點 feature-flag 關；D1 table 留著（無破壞）。

## Open Questions

1. **暱稱-to-post vs 競技榜 opt-in 解耦**：post 需暱稱（鎖定）。但既有架構「設暱稱」是否 = 強制加入公開競技排名？apply 時讀 `neurons-leaderboard` 實作確認：能便宜解耦就解耦（有暱稱可 post 但不一定上競技榜）；否則最簡單 = 有暱稱即公開（po 留言本來就是公開行為）。預設走後者直到確認。
2. **N_REPORT_HIDE / token bucket / 新帳號 gate 門檻 / top-N 的 N** 具體數值（預設 3 / 6 per hr·30 per day / 已 sync ≥1 次 / Top 10）皆 dogfood-tunable。
3. **blocklist 繁中清單來源**：seed 最小集 + owner 可擴充；PII regex 形狀（台灣手機 09xx / email / 身分證 [A-Z]\d{9}）。reject vs mask 預設 reject。
4. **avatar 擁有驗證的便宜來源**（若日後要做 OPTIONAL 層）：Worker 取「使用者擁有哪些 sprite」不載入整包存檔的方法。
5. **owner-role auth**：後台端點的 owner 身分驗證機制（既有 bug_reports dashboard 用 Supabase SQL；shoutout 後台用 admin endpoint + secret/role claim 還是同走 dashboard）。
