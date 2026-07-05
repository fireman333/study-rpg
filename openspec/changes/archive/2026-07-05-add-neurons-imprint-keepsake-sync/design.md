## Context

`add-neurons-ng0717-lineage-imprints` 把分支印記存成 local-only write-once keys（`prescription:v1:ng0717:imprint:<subj>:<date>` = `'1'`），並在 spec 埋下「future migration MAY promote to synced keepsake」。本 change 執行該 migration。

neurons sync = R2-only 單 bundle（`users/<sub>/neurons-snapshot.json.gz`），adapters 在 `NEURONS_ADAPTERS`，`buildBundleSnapshot` 對每個 adapter 呼 `snapshot()`。`metaAdapter` snapshot = `db.meta.toArray().filter(SYNCED_META_KEYS.has(key))`，apply = 對每個 incoming row，`SYNCED_META_KEYS.has(key)` 才收、且 first-write-wins（local 缺→寫、local 有→留）。合併紀律：neurons 幾乎全 monotonic（MAX / UNION / first-write-wins），一旦錯誤資料上雲不可逆（cross-account merge / post-reset resurrection）。

## Goals / Non-Goals

**Goals:** 分支印記跨裝置保留（換手機不失去芽）；合併零資料遺失、零 cross-device 打架；零 Dexie bump；UI 不變。

**Non-Goals:** ❌ 視覺化「哪些科跨裝置」/ 任何分母 UI；❌ 新 R2 adapter；❌ Dexie schema 改動；❌ accent 美術 / bespoke sprite。

## Decisions

### D1 — Merge = first-write-wins UNION（write-once presence keys）
imprint keys 是 write-once presence（`'1'`，永不刪），與既有 set-once `mazeSecondLapCelebrated:<family>` 同型。metaAdapter 既有 first-write-wins 對「兩裝置各自新增 key」＝ UNION：任一裝置長的芽最終雙方都有；同科不同日的 per-date keys UNION → 跨裝置 `touches` 自然累加。**零 backfill post-pass**（不像 counters MAX-merge 或 firstPullFamilies JSON-set UNION 需要 post-pass——因為這裡每顆芽是**獨立 key**，不是單一 JSON 集合）。
- **Alternative（否決）**：把所有 imprint 壓成單一 JSON key（`{subj:[dates]}`）+ UNION backfill。多一份衍生狀態、會與 per-date keys 漂移、要寫 backfill。per-date key 直接 UNION 更簡單、零漂移、零 backfill。

### D2 — Prefix-based membership（動態 key 無法列舉）
imprint key = subject × date，不可能塞進固定 `SYNCED_META_KEYS`。改用 `isSyncedMetaKey(key) = SYNCED_META_KEYS.has(key) || key.startsWith(IMPRINT_SYNC_PREFIX)`，**snapshot 與 apply 用同一個 test**（否則 push/pull 方向不一致）。prefix = `prescription:v1:ng0717:imprint:`，精確只匹配 imprint（不含 `prescription:v1:completed:` / `:localSeed` 等 local-only daily state）。
- **Alternative（否決）**：專屬 imprint adapter。多一個 adapter + bundle key + reset-scope 掛鉤；prefix 疊在既有 metaAdapter 最小、最少 surface。

### D3 — Additive SCHEMA_VERSION 23→24，reader-tolerant，無 Dexie bump
沿用 v8/v12 等 additive meta 升級 pattern。v23 讀 v24：imprint keys 不在其 membership → 既有 skip 邏輯 drop（無 error）。v24 讀 v23（無 imprint keys）：first-write-wins 不刪本地 → 本地 imprints 保留。全 web-app client 隨 deploy 收斂 v24；transient 風險僅「stale v23 分頁 push 覆蓋掉 bundle 的 imprint keys」——與既有 additive meta 升級同型、keepsake 可重長、可接受。無 `.version()` bump（key 本就存在本地，只是同步 filter 放寬）→ **無 dexie-fixture-lint 觸發**。

### D4 — Account-switch wipe 補 prefix delete
`clearLocalSyncedData` 既有 `db.meta.where('key').anyOf([...SYNCED_META_KEYS]).delete()` 不含 prefix keys。加 `db.meta.where('key').startsWith(IMPRINT_SYNC_PREFIX).delete()`（同一 rw transaction 內），切帳號時前一帳號的芽一併清（keepsake 屬帳號，避免 cross-account 殘留）。

## Risks / Trade-offs

- **[prefix 誤收其他 key]** → prefix `prescription:v1:ng0717:imprint:` 唯一子命名空間，siblings（completed/reward/plan/localSeed）不含 `ng0717:` → 不會誤收。Vitest 明確斷言。
- **[snapshot/apply membership 漂移]** → 抽成單一 `isSyncedMetaKey` helper，兩處共用，杜絕漂移。Vitest 斷言雙向一致。
- **[stale v23 分頁 drop imprints]** → additive-meta 通病、與 v8/v12 同型；keepsake 非關鍵、可重長；接受。
- **[reset resurrection]** → imprints 無刪除語意（write-once），reset 走既有 `reset_at` fence（pull 先 wipe 再 apply）→ imprint keys 一併被 reset bundle 的空 data 蓋掉？實際 reset 走 `clearLocalSyncedData`（D4 已含 prefix）+ 空 bundle → 正確清除。無 resurrection。
- **[Fable-5 健檢]** sync 合併正確性由 Fable-5 adversarial review 把關（本 change owner 指定），對照本 repo 既有 sync 陷阱（UNION vs LWW、snapshot/apply 對稱、reader tolerance、reset fence、cross-account）。
