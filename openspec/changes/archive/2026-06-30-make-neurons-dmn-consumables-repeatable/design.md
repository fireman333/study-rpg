## Context

DMN 抽卡的 `drawDmnCard` ([dmn-fate-card.ts](apps/neurons-tw/src/lib/services/dmn-fate-card.ts)) 目前是 closed-cap：`selectCardFromPool` 排除已擁有卡，`drawEquipment = wantEquipment || unownedCardCount === 0`，且頂部有 both-pools-exhausted return-null guard。消耗品抽滿 22 張 → 強制只 roll 裝備；裝備也抽光 → no-op。玩家抽滿 22 後看到「抽卡失敗 — 沒有可用次數或卡池已空」，但消耗品本該是可重複抽的背包補給品（`inventory` 庫存從背包啟動才生效），且還有 8 件裝備未抽。

模型現況：`dmnCards` = 圖鑑（per-cardId 首見列，sync first-write-wins keep-earlier）；`inventory` = per-`eventKind` 庫存（啟動時 −1）；`dmnEventLog` = per-cardId provenance（at-most-once，monotonic-union）。抽卡券是已修好的 grants−consumes 衍生投影。Codex 第二意見已確認方向並抓到實作陷阱。

## Goals / Non-Goals

**Goals:**
- 消耗品可重複抽：重複只 +庫存、不重寫圖鑑/provenance、仍消耗券。
- 裝備持續可抽到（flat 5%，owner 選定）。
- 收藏進度顯示 34（22 消耗品面 + 12 裝備），抽卡只由券門控。
- 零持久化 schema 改動。

**Non-Goals:**
- 不做 soft-pity（owner 選 flat 5%）。
- 不把 `inventory` 改成累加 CRDT（per-kind LWW 跨裝置限制沿用、不在本次解）。
- 不動抽卡券 earn / 投影、不動 `dmnCards`/`inventory`/`dmnEventLog` 表結構與 merge。

## Decisions

### D1 — 重複消耗品：skip 圖鑑與 provenance、仍 +庫存（Codex 抓到的關鍵陷阱）

`drawConsumable_` 目前 tx 內有 `if ((await db.dmnCards.get(cardRow.cardId)) !== undefined) return`（race-safe re-check）。若只把 selector 改成可重抽、不動這行，**重複卡會常態 return null**（不消耗券、不加庫存）→ 變成新 bug。正解：tx 內 `const isNew = (await db.dmnCards.get(cardId)) === undefined`，
- `isNew` → `dmnCards.put`（圖鑑列）+ post-commit `dmnEventLog.put`（provenance）。
- 一律 → `inventory +1`、`dmnLifetimeDrawsConsumed +1`、materialize `dmnGrantsTotal`、重算 `dmnDrawsAvailable`。
- 重複 → **不** put 圖鑑（保留首見 `obtainedAt`）、**不** 寫 `dmnEventLog`（保留 at-most-once）。
`DrawDmnCardResult` 的 consumable 變體加 `duplicate: boolean` 供 modal 文案。

### D2 — `selectCardFromPool` 跨全 22 張加權，不排除已擁有

移除 `EQUIPMENT_CATALOG.filter(!owned)` 式的排除；改為對全 22 張依 rarity 權重選一張，永遠回非 null。`ownedCardIds` 參數移除（duplicate 偵測移到 `drawConsumable_` 的 tx）。

### D3 — 分支與 guard：裝備 flat 5% only-if-unowned、消耗品永不耗盡

`drawDmnCard`：`wantEquipment = rng() < EQUIPMENT_DRAW_RATE && unownedEquipCount > 0`；`drawEquipment = wantEquipment`（移除 `|| unownedCardCount === 0`）。移除頂部 `if (unownedEquipCount === 0 && unownedCardCount === 0) return null`。裝備全擁有 → wantEquipment 永遠 false → 一律消耗品（可重複）。唯一回 null 的情形是 tx 內 entitlement 已 < 1（無券）。

### D4 — 收藏顯示集中到 `useDmnStatus`

`useDmnStatus` 加 `collectionOwned = dmnCards.count + equipment.count`、`collectionTotal = DMN_CARD_CATALOG.length + EQUIPMENT_CATALOG.length`（22+12=34）。移除 `bothPoolsExhausted`（語意消失）。`ConnectomeStatCard` 直接用 hook 的 `collectionOwned`/`collectionTotal`（`/ 20` → `/ 34`），移除 `dmnOwned` prop 與 `OverviewPage` 對應計算/傳遞；`canDraw = dmn.drawsAvailable >= 1`；移除「DMN 圖鑑完整」分支。`DmnDrawModal` 已蒐集行改 `collectionOwned/collectionTotal`、重複消耗品 reveal 顯示「已在圖鑑 · 庫存 +1」、錯誤訊息去掉「或卡池已空」。

### D5 — 零 schema 改動

`duplicate` 是 in-memory 結果旗標，不入庫。`dmnCards`/`inventory`/`dmnEventLog` 表與 sync adapter 不變。**不 bump Dexie、不 bump R2 SCHEMA_VERSION、不動 SYNCED_META_KEYS** → 不觸發 Dexie upgrade fixture lint。

## Risks / Trade-offs

- **[重複卡 race-guard 漏改 → 常態 null]** → D1 明確處理；Vitest 鎖「duplicate succeeds: 圖鑑不變、庫存+1、consumed+1、duplicate=true」。
- **[`inventory` per-kind LWW 跨裝置丟庫存]** → 沿用既有限制（非本次破壞）。單裝置玩家（owner）不受影響；未來可選 op-log 升級。已在 proposal 標示。
- **[achievements 依賴 22/22]** → 圖鑑仍在 22 首見收滿時完成，achievement 不破。
- **[裝備 flat 5% 偏慢]** → owner 明確選定 flat 5%（接受 ~160 抽期望）；未來要 soft-pity 再開新 change。

## Migration Plan

1. 程式碼 land（engine + hook + UI + tests）。無資料遷移、無 schema bump。
2. 既有存檔：`dmnCards` 已是 ≤22 首見列，直接沿用；下一抽起重複卡 +庫存。
3. Rollback = 還原 commit；無持久化變更，安全。

## Open Questions

- 無 blocking open question。
