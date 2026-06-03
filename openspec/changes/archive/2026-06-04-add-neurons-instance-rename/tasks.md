## 0. 前置協調（apply gate — 與並行 Phase 4）

- [x] 0.1 確認 Phase 4（expedition rewards）是否 bump Dexie / R2。若否（走 `meta` key-value）→ 本變更直接吃 Dexie `v14` / R2 `13`。若是 → 敲定本變更 `v14`/`R2 13`、Phase 4 `v15`/`R2 14`，記錄誰先 merge（第二者重編號）。

## 1. Schema — Dexie v14 新增 `instanceNicknames` 表

- [x] 1.1 `apps/neurons-tw/src/lib/db.ts`：新增 `interface InstanceNicknameRow { instanceId: string; nickname: string; updatedAt: number }`。
- [x] 1.2 `NeuronsDB` 加 `instanceNicknames!: EntityTable<InstanceNicknameRow, 'instanceId'>`。
- [x] 1.3 加 `this.version(14).stores({ ...所有 v13 store 字串原樣..., instanceNicknames: 'instanceId, updatedAt' })`，**不**改任何既有 store 的 PK（dexie_pk_change_pitfall）。純加性，無 `.upgrade()` 資料 migration（新空表）。
- [x] 1.4 `apps/neurons-tw/src/__tests__/db-v13-to-v14-migration.test.ts`：開 v13 → 寫一筆 `neuronInstances` → 重開 v14 → 斷言無 `DatabaseClosedError`、`instanceNicknames` 表存在、舊資料完整（canonical pattern 見 `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`；CI `dexie-fixture-lint` 強制）。

## 2. Service — `lib/services/instance-nickname.ts`

- [x] 2.1 `setInstanceNickname(instanceId, raw)`：`trim` + 長度上限（≤ 16 字元，超出截斷）→ `db.instanceNicknames.put({ instanceId, nickname, updatedAt: Date.now() })`。空字串 = 清除（寫空字串 + 新 updatedAt，**不** delete 列）。best-effort try/catch（channel `[instance-nickname]`），失敗不破壞 UI。
- [x] 2.2 `useInstanceNicknames(): Map<string,string>` — `useLiveQuery` over `instanceNicknames.toArray()`，回 `instanceId → nickname`（過濾空字串）。供 CollectionPage 訂閱。
- [x] 2.3 （DEV-only）`globalThis.__instanceNickname` debug handle（set / list），比照其他 service 慣例。

## 3. Sync — adapter (LWW) + 註冊 + R2 bundle bump

- [x] 3.1 `lib/sync/tables.ts`：新增 `instanceNicknamesAdapter`，**完全鏡像** `questionFlagsAdapter`（snapshot = `toArray()`；apply = 逐列 `pickUpdatedAt` + 比 `existing.updatedAt >= updatedAt` 才 skip、否則 `put`；key = `instanceId` string 防呆）。
- [x] 3.2 把 `instanceNicknamesAdapter` 加進 `NEURONS_ADAPTERS` 陣列。
- [x] 3.3 `lib/sync/r2/bundles.ts`：`SCHEMA_VERSION` `12` → `13`；把 `instanceNicknames` 加進 bundle 的 adapter key 集合 / meta allowlist（比照既有 additive bump）。確認 reader tolerance：v12 client 丟未知 key 不報錯、v13 讀 v12 bundle（無此 key）→ preserve-on-omission（不清本地暱稱）。
- [x] 3.4 註解標明：LWW（**非** monotonic）、清除走空字串而非刪列（避免 delete-vs-LWW 復活）。

## 4. UI — CollectionPage 個體視圖 rename + 並存顯示

- [x] 4.1 `routes/CollectionPage.tsx`：個體視圖 gate 由 `heldCount > 1 && ordered.length > 1` 放寬為 **held ≥ 1** 即可進入（D5），N=1 時 label 用「個體」措辭（不寫「展開 1 隻」）。
- [x] 4.2 個體列改為可顯示文字：訂閱 `useInstanceNicknames()`；有暱稱 → 主文字 = 暱稱、副標小字 = `row.displayName`（persona·rarity）；無暱稱 → 只顯示 persona（沿用現狀）。
- [x] 4.3 每個 held 個體加 ✏️ rename 控制 → inline input / 小 popover：Enter / blur 送出 `setInstanceNickname`，Esc 取消；空字串送出 = 清除。input 有 `aria-label`（含個體 persona 供辨識）。
- [x] 4.4 slot 卡 header **不變**（仍顯示 persona）。
- [x] 4.5 確認 rename input focus 時，QuizModal 之外的全域鍵盤（若有）不誤觸；此頁無 hotkey hook，風險低，但 input 內鍵入不可冒泡成導覽。

## 5. 驗證

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw typecheck` 通過。
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` 通過（含 5.3 新測 + 既有 db/sync 測）。
- [x] 5.3 新增 sync 單元測 `__tests__/instance-nickname-merge.test.ts`：LWW 較新 updatedAt 勝 + 空字串清除可傳播 + v12↔v13 bundle 交叉（omission 不清本地）。
- [x] 5.4 `pnpm lint:dexie-fixtures` 通過（v14 fixture 被認得）。
- [x] 5.5 Chrome MCP 桌機 smoke：圖鑑 → 展開個體（含某個 singleton slot）→ 命名 → 主文字/副標並存 → 改名 → 清除回退 persona → console 無 error。
- [x] 5.6 確認 git diff 範圍：db.ts / instance-nickname.ts / tables.ts / bundles.ts / CollectionPage.tsx / 2 測檔，無 `neuronVariants` adapter 改動、無 fusion 邏輯改動。
