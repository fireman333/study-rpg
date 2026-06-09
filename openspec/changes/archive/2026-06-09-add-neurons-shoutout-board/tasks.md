## 1. 契約鎖定（design 階段產物落地）

- [x] 1.1 shoutout shared TS 型別（message、結構化 avatar payload、`GET` row 形狀含 `authorKey/nickname/isTopN`）— 直接落在 `@study-rpg/core`（vertical slice 跑通 → 已可抽 core，見 group 4）
- [x] 1.2 D1 migration（additive、可 rollback）：`cloudflare/sync-worker/migrations/0008_neurons_shoutout.sql` — `shoutouts_neurons`(PK `author_key` + visible index)、`shoutout_audit`、`shoutout_reports`(unique reporter/target)、`shoutout_bans`。⚠️ 不 DROP/ALTER 既有 table；owner 走 dashboard 套用（task 5.4）
- [x] 1.3 open question #1：讀 `neurons-leaderboard` 實作 → 暱稱(`leaderboardProfile.nickname`)與公開排名(`is_public`)在既有架構**已解耦**；post gate = 有 leaderboard_neurons 暱稱列即可（不強制 is_public=1）。預設「有暱稱即可 post」已套用

## 2. 共享後端 Worker（`cloudflare/sync-worker/src/shoutout.ts`，`/shoutouts/*`）

- [x] 2.1 `/shoutouts/*` router + index.ts dispatch，與 sync/leaderboard/presign **硬隔離**（per-app `APP_CONFIG`，只啟用 `neurons`；二階在 standalone repo 加 entry）
- [x] 2.2 moderation util：`normalizeForMatch`(NFKC→去零寬→去 bidi→collapse→lower)、`graphemeLen`(Intl.Segmenter)、blocklist seed + PII regex(TW 手機/email/身分證)，命中 reject
- [x] 2.3 `PUT`：auth → ban → nickname gate(=新帳號 gate) → daily cap(30) → 5min cooldown(content-hash 相同先 noop) → normalize → length(≤40 grapheme/≤2 行) → blocklist/PII → UPSERT(`created_at` 保留) + audit；忽略 client 送的 name
- [x] 2.4 `GET`：D1 latest-40(`created_at` desc、非 deleted/hidden) + join `leaderboard_neurons` 暱稱 + 查 composite Top-100 KV 標 `isTopN`(Top 10)；`Cache-Control: max-age=30, swr=60` 走 **Cache API**(origin-independent key、不寫 KV)
- [x] 2.5 `DELETE`：soft-delete(`deleted=1`) + audit
- [x] 2.6 `POST /report`：unique(reporter,target) + distinct count ≥ `REPORT_HIDE_THRESHOLD`(3) → soft-hide + audit
- [x] 2.7 avatar payload 結構驗證(shape + charset，必做)；ownership 驗證 **defer(optional)**
- [x] 2.8 owner 後台端點：`/admin/list`(含 hidden+normalized) + `/admin/action`(delete/hide/unhide/ban/unban)，owner-role gate(`SHOUTOUT_OWNER_SUBS` env)

## 3. neurons client vertical slice（`apps/neurons-tw/src/`）

- [x] 3.1 `/shoutout` route + 「留言」nav link（App.tsx）
- [x] 3.2 compose/edit modal：選已收集家族 sprite + 文字(≤40/兩行前端 `validateShoutoutMessage` 擋)；登入 + 暱稱 gate(未設導 /leaderboard)；首次 disclaimer checkbox
- [x] 3.3 寫成功用 `PUT` response 自更新自己卡片(不等 list cache)；cooldown 訊息不丟輸入；delete 自己那則
- [x] 3.4 DVD-logo 彈跳渲染(rAF + DOM transform refs)：family sprite + 暱稱 + 留言；未知 assetId → 🧬 placeholder；UGC 文字走 React textContent(無 HTML/bidi)
- [x] 3.5 own halo(authorKey 比對) + top-N 特殊 halo(`isTopN`)；hidden 不顯示/不發 halo
- [x] 3.6 `prefers-reduced-motion` → 靜態 grid；手機安全 O(n) 牆面反彈(無 pairwise)；hover/tap 暫停
- [x] 3.7 report 入口 → `POST /report`，確認收到、不暴露 reporter
- [x] 3.8 空狀態友善畫面 + disclaimer footer

## 4. Core 抽離 + publish（slice 跑通後）

- [x] 4.1 message/avatar 型別 + normalize/blocklist/PII/validate/contentHash util 進 `packages/core/src/lib/shoutout.ts`（content-agnostic，純 asset id）
- [x] 4.2 neurons app 從 `@study-rpg/core` import；`pnpm --filter @study-rpg/core build` + `pnpm -r typecheck` 全綠
- [ ] 4.3 ⏸ **OWNER-MANUAL**：CHANGELOG entry + version bump + npm publish dist-tag `next`（二階 standalone repo 接時才需要；neurons v1 不依賴）

## 5. 測試 / 驗證 / 部署

- [x] 5.1 Vitest：normalize(全形/零寬/bidi/whitespace)、grapheme 長度、blocklist/PII reject、content-hash、avatar 驗證(注入擋)（`apps/neurons-tw/src/__tests__/shoutout-moderation.test.ts`，25 tests）
- [x] 5.2 `pnpm -r typecheck`(5/5 綠) + `pnpm --filter @study-rpg/neurons-tw test`(517 綠)
- [x] 5.3 Chrome MCP UI smoke：`/shoutout` 直接 URL render ✓ + nav「留言」✓ + console clean(僅既有 localhost R2 dev warning)✓ + 後端缺席優雅降級(empty state)✓ + compose modal 開啟 + 暱稱 gate 正確分支 ✓。後端未部署 → post/fetch e2e 延到 owner deploy 後(5.6)
- [x] 5.4 ✅ applied to prod D1 `study-rpg-leaderboard` via `wrangler d1 execute --remote --file`（4.92 接受純 additive file，6 queries success）；4 表已驗存在。未寫 `d1_migrations` 追蹤表（與既有 dashboard-applied migrations 一致；re-run 因 IF NOT EXISTS 為安全 no-op）
- [x] 5.5 ✅ Worker deployed (Version `102a80ef`, owner ran `wrangler deploy`) + smoked：`/health` ok / `/leaderboard/neurons/composite` 正常 / `/presign` 401(未斷) / NEW `/shoutouts/neurons` → `{messages:[],count:0}` (edge cache miss→hit、custom domain + workers.dev 皆通、unknown_app guard 正常)。⏸ `SHOUTOUT_OWNER_SUBS` secret 待 owner 設(admin 403 until then；公開板不受影響)
- [ ] 5.6 ⏸ **OWNER-MANUAL**：prod 端到端 post/list/edit(5min)/delete/report + 確認 KV/D1 寫入量正常
