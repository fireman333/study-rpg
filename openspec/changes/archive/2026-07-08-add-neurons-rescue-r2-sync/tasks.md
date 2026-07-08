## 1. Rescue key family + store 換軌

- [x] 1.1 在 rescue service 匯出 key mint + matcher（單一來源）：`RESCUE_META_PREFIX = 'rescue:v1:'`、`RESCUE_PLAN_KEY = 'rescue:v1:plan'`、`rescueConfKey(planCreatedAt, questionId)`、`rescueOvrKey(planCreatedAt, conceptId)`、`isSyncedRescueKey(key, now?)`（plan 恆真；conf/ovr 限 `planCreatedAt ∈ [now − 14d, now + 1d]`；其餘 `rescue:v1:*` 恆假）— `rescue-sync-keys.ts`（pure module）
- [x] 1.2 `RescuePlan` 增 `blitzDoneAt?: number`；plan envelope type `{ plan: RescuePlan | null, updatedAt: number }`
- [x] 1.3 `rescue-store.ts` 載體換軌：plan / confidence / overrides 改寫穿 `db.meta`（in-memory mirror + `useSyncExternalStore` facade 保留；Dexie `liveQuery` 訂閱回灌 mirror + localStorage env cache 供 zero-flash boot），每個 plan 動作（start / replace / touch / blitz-done / abandon / archive）重寫全 envelope + fresh `updatedAt`；abandon / archive 寫 explicit `plan: null`
- [x] 1.4 confidence 寫入帶 `{ signal, at: Date.now() }`；override 寫入沿用 `{ setAt, attemptsAtOverride }`；讀取一律以 active envelope 的 `createdAt` scope
- [x] 1.5 telemetry / export / cap 留 localStorage 原路徑不動（獨立 telemetry key）；`markBlitzDone`/`isBlitzDone` 改讀寫 envelope `blitzDoneAt`
- [x] 1.6 本機 GC：run-scoped key 天然被 reader 忽略（換 run re-scope，無 delete）；liveQuery reconcile 從 db 重建 mirror，不做 in-window 本機刪除

## 2. Sync filter + R2 SCHEMA_VERSION

- [x] 2.1 `lib/sync/tables.ts`：`isSyncedMetaKey` 加第四 clause `isSyncedRescueKey(key)`（import 自 rescue-sync-keys，不重宣告）
- [x] 2.2 `lib/sync/r2/bundles.ts`：`SCHEMA_VERSION` 26 → 27 + history comment（v27 條目：rescue family、merge 語意、reader tolerance、NO adapter / NO Dexie bump、Worker bundle-opaque）

## 3. Backfill post-pass

- [x] 3.1 新增 `lib/sync/backfill/rescue.ts`（`backfillRescueLWW(db, incomingMeta)`）：plan envelope LWW on `updatedAt`（explicit-null 參戰；tie = canonical 字典序 total order）；`conf:` per-key LWW on `at`；`ovr:` per-key LWW on `setAt`；malformed incoming 永不勝出；malformed 已存 plan envelope 刪除令 reader 重生（鏡射 `prescription-plan.ts` 驗證）；只處理 in-window keys（同 matcher）
- [x] 3.2 註冊進 `backfill/index.ts` 為新 error-isolated step（1g，prescription-plan 之後）

## 4. Account guard

- [x] 4.1 `lib/sync/account-guard.ts`：`clearLocalSyncedData` 加 `db.meta.where('key').startsWith(RESCUE_META_PREFIX).delete()`（import 單一來源常數）+ `clearRescueLocalCache()`（清 device-local env cache；保留 migration marker + telemetry）

## 5. Migration（localStorage → meta，一次性）

- [x] 5.1 `migrateRescueLocalState()`：meta 無 envelope 且 localStorage 有 plan → 種 envelope（`updatedAt = plan.lastStudiedAt`）、conf（`at = plan.lastStudiedAt`）、ovr（沿用 `setAt`）、blitz 標記 → `blitzDoneAt`；telemetry 遷入獨立 key；冪等（device-local `migrated` marker 防 re-seed，survive account wipe）。**偏離**：owner open-Q #5 拍板「多留一版 fallback」→ 保留 legacy `neurons:rescue:v1` blob 不剝除，改用 marker 防復活（見回報）
- [x] 5.2 meta 已有 envelope（先 pull 到雲端 plan）→ 跳過並丟棄本機殼（telemetry 仍遷入）

## 6. UI

- [x] 6.1 `RescueScene.tsx` 兩處文案「救急計畫與信心紀錄存於本裝置」→ 條件同步語意（登入=跨裝置同步；未登入=只存本機；診斷紀錄仍本機）。另：換科/放棄 confirm 改 sync 語氣（不用「計畫殼」）、「匯出救急紀錄」→「匯出診斷紀錄 JSON」降次要、加一次性 reconcile 提示。**未加**「已同步」chip（app 已有全域 chip）
- [x] 6.2 一次一科 confirm 涵蓋跨裝置情境（顯示 active plan familyId + 「這個帳號其他已登入裝置也會一起換過來」）

## 7. Tests（Vitest）

- [x] 7.1 plan envelope LWW：雙向收斂（任意 apply 順序）、explicit-null 傳播且不復活、tiebreak deterministic（rescue-sync.test.ts）
- [x] 7.2 conf / ovr per-key LWW round-trip + 新 tap 勝出 + run re-scope 零 delete（rescue-sync.test.ts + rescue-store.test.ts）
- [x] 7.3 `isSyncedRescueKey`：plan 恆真、in/out-window conf/ovr、forward-skew、telemetry 類 key 恆假；`isSyncedMetaKey` 委派（snapshot 與 apply 同一測試面）
- [x] 7.4 reader tolerance：out-of-window rescue key 被 matcher 拒（`isSyncedMetaKey` false）；in-window plan 恆進（等同 v26↔v27 forward-drop / absence-not-deletion 語意）
- [x] 7.5 account wipe 涵蓋 `rescue:v1:` prefix（保留 device-local key）；migration 冪等（marker 防 re-seed）
- [~] 7.6 過期 override 重灌 inert（read-time expiry）— `isOverrideExpired` 純函式既有測試 + reader scope 已覆蓋；未新增專測（read-time expiry 邏輯未動）

## 8. Verify

- [x] 8.1 `pnpm -r typecheck` clean + `pnpm --filter @study-rpg/neurons-tw test` 1069 綠（含 28 新測）+ `pnpm lint:dexie-fixtures` OK（無新 .version → 未觸發）— 審後修正輪重跑：typecheck clean + **1077 綠（+8 新測）**
- [ ] 8.2 Chrome MCP 雙 context 模擬（**prod 驗證——dev R2 push 在 localhost 不可用，owner 部署後跑**）：A start → B 收斂 → B confirm-replace → A 收斂 → abandon 傳播 → blitz 不重跑 → confidence 跨裝置入分

## 9. Review fixes（Fable + Codex 雙審，2026-07-08）

- [x] 9.1 **B1 — 跨裝置接手的同科 silent-restart 窗**：(a) `RescueScene.tsx` 新 useEffect——plan 在 setup 且表單未互動時 pull 落地 → 自動跳 overview/blitz（依 isBlitzDone）+ 補發 reconcile note；「換一科救急」顯式進 setup 標 touched 防誤跳回；(b) authed 且 startup pull 未落地（`lastPullAt === null` 且非 error）或 store 未 hydrate → 「開始救急」降級 disabled「同步中…」（`useRescueHydrated` 新暴露，fail-open）；(c) `startRescue` 同 familyId + active plan + 無顯式 replace → 回傳既有 plan（`resumed: true`，零寫入），只有顯式 replace 才 mint 新 createdAt
- [x] 9.2 **B2 — 412/409/428 recovery pull 未跑 backfill（engine 級，惠及所有 LWW family）**：`pushBundle` 新 opt `onRecoveryPull`（recovery pull 後、`applied && !notModified && !blobMissing` 同 pullNow gating、error-isolated）；`SyncEngine.pushNow` thread `onPullComplete` 進去。account-reset path 不傳（行為不變）。Regression lock：`rescue-conflict-recovery.test.ts`（真 gzip/apply/backfill：412 → 較新 plan:null 勝出 → 下一份 push snapshot 帶 null；control 測無 hook 的 pre-fix 行為；hook throw 不破 push path）+ `rescue-push-coalescing.test.ts`（engine wiring lock）
- [x] 9.3 exam-date 14d cap：setup date input `max = today+14` + 手動輸入 clamp（對齊 `isSyncedRescueKey` 14d run-sync window）
- [x] 9.4 migration push flag：`migrateRescueLocalState` 種入後標 `migrationPushPending`；`useSync` 掛好 Dexie hooks 後 `consumeRescueMigrationPush()` → 顯式 `schedulePush`（one-shot）；測試鎖 seed→true→false、無 seed→false
- [x] 9.5 confidence write coalescing regression test：一場 8 tap session 在 12s debounce 窗內只產 1 次 push intent（`rescue-push-coalescing.test.ts`，真 Dexie hooks + fake timer 只 fake debounce）
