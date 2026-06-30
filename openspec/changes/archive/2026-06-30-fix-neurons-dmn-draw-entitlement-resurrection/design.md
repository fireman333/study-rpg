## Context

DMN 抽卡券的跨裝置 / 雲端合併在實作上偏離了 `neurons-dmn-fate-cards` spec。Spec（[spec.md:102-104](openspec/specs/neurons-dmn-fate-cards/spec.md:102)）早已要求 `dmnDrawsAvailable` 走 `dmnGrantsTotal − dmnConsumesTotal` 衍生投影、且 **SHALL NOT** 用 plain LWW/MAX；但 [dmn-daily.ts:90-101](apps/neurons-tw/src/lib/sync/backfill/dmn-daily.ts:90) 卻對 raw `dmnDrawsAvailable` 做 `Math.max(local, incoming)`。

`dmnDrawsAvailable` 是雙向計數器（grant +、consume −），對它取 MAX 讓「消耗」方向永遠無法向下傳播。R2 sync 模型：pull 在 `runOnPullComplete` 跑 backfill 後處理做合併（`metaAdapter.apply` 本身是 first-write-wins）；push 寫本機真值、不做 merge（[engine-r2.ts:99](apps/neurons-tw/src/lib/sync/r2/engine-r2.ts:99)）。因此單裝置「抽卡後、debounce push 前」遇到一次 startup/focus pull 就會把已抽掉的券還原（`MAX(0,11)=11`），下一次 push 再寫回雲端 → 永久卡 11。已用 Codex 第二意見驗證根因與修法。

相關欄位現況：`dmnLifetimeDrawsConsumed` 在兩個 consume 點（[dmn-fate-card.ts:205](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:205) / [:241](apps/neurons-tw/src/lib/services/dmn-fate-card.ts:241)）已各 +1，等同「消耗累計」；但它只在 `SYNCED_META_KEYS` 白名單、實際走 first-write-wins，跨裝置不收斂。Grant 點有兩處（[dmn-trigger.ts:133](apps/neurons-tw/src/lib/services/dmn-trigger.ts:133) 行為軸、[:181](apps/neurons-tw/src/lib/services/dmn-trigger.ts:181) 出征里程碑）。

## Goals / Non-Goals

**Goals:**
- 讓「已抽掉的券」永久持久化、不被雲端還原（修掉玩家回報的核心 bug）。
- 實作對齊既有 spec 的衍生投影，並把 spec 的「permitted 簡化」升格為 mandatory canonical。
- 既有玩家無感遷移：衍生 `dmnDrawsAvailable` 不跳動。
- 對「舊 bundle（無 `dmnGrantsTotal`）」reader-tolerant：不清掉玩家的券。
- UI / Dexie schema 零改動（純加一個 synced meta key）。

**Non-Goals:**
- 不做 per-client PN-counter / append-only consume op-log（真正零誤差的跨裝置帳）。本次接受「跨裝置同時各抽一張 → MAX 退一張券」的偏向玩家限制。
- 不改抽卡如何 earn（行為軸 / 出征軸 trigger 不動）、不改 DMN catalog / artwork。
- 不碰「全 pool 收集滿時 `drawDmnCard` return null 不扣券」既有正確行為。

## Decisions

### D1 — Scalar 雙單調計數器相減（不選 PN-counter、不選 LWW envelope）

`dmnDrawsAvailable`（顯示用）= `clamp(dmnGrantsTotal − dmnConsumesTotal, ≥0)`，兩個計數器都 monotonic-MAX 合併。

- **vs. raw MAX（現況 bug）**：raw MAX 無法表達消耗方向，是 bug 本體。
- **vs. timestamped LWW envelope**：較簡單、也能修單裝置 bug，但仍會在並發 grant/consume 時 last-writer-wins 丟一個 op，且把抽卡券當「值」而非「經濟原語」、未來疊加 grant 來源時更脆弱。投影法把券變成可加性經濟原語、且 spec 已指名此法。
- **vs. per-client PN-counter**：跨裝置完全正確，但要同步一個 per-client map（類似 `firstPullFamilies` union 的數值版），多一坨 schema 與合併複雜度；換來的只是「兩裝置同時抽免費券」這種沒人在乎的邊角精度。**不值得**。
- `dmnConsumesTotal` 直接沿用 `dmnLifetimeDrawsConsumed`（已是消耗累計），不另立新 key——最小改動。

### D2 — Reader-tolerance seeding（Codex 標為最高風險）

任一側（local 或 incoming）若缺 `dmnGrantsTotal`（< schema 23 的 client 產生），該側 grants 以 `dmnDrawsAvailable + dmnConsumesTotal` 反推、**絕不**當 0。否則衍生負值夾 0、清空玩家券。合併步驟：

```
localGrants    = local.dmnGrantsTotal    ?? (local.dmnDrawsAvailable + local.dmnConsumesTotal)
incomingGrants = incoming.dmnGrantsTotal ?? (incoming.dmnDrawsAvailable + incoming.dmnConsumesTotal)
mergedGrants   = max(localGrants, incomingGrants)
mergedConsumes = max(local.dmnConsumesTotal, incoming.dmnConsumesTotal)   // 兩側 ?? dmnLifetimeDrawsConsumed
write dmnGrantsTotal     = mergedGrants
write dmnConsumesTotal   = mergedConsumes   // = dmnLifetimeDrawsConsumed key
write dmnDrawsAvailable  = max(mergedGrants − mergedConsumes, 0)
```

### D3 — One-time local migration

v23 client 首次看到本機缺 `dmnGrantsTotal` 時：`dmnConsumesTotal := dmnLifetimeDrawsConsumed`、`dmnGrantsTotal := dmnDrawsAvailable + dmnLifetimeDrawsConsumed`，衍生 available 數值不變。放在 boot（`initializeDmnTrigger`）或 `readDmnMeta` 前的 lazy seed，並在 pull-merge 內也用同一條 seed 規則（D2）覆蓋本機側，兩條路徑等價收斂。

### D4 — `dmnLifetimeDrawsConsumed` 升級為 MAX-merge

加進 MAX-merge 後處理（與 `dmnGrantsTotal` 同步）。它本是 lifetime monotonic，MAX-merge 語意安全。

### D5 — 同步面：新增 key + schema bump，零 Dexie 改動

- `SYNCED_META_KEYS` 加 `dmnGrantsTotal`（[tables.ts:412](apps/neurons-tw/src/lib/sync/tables.ts:412)）。`dmnLifetimeDrawsConsumed` 已在白名單。
- R2 `SCHEMA_VERSION` 22 → 23（[bundles.ts:175](apps/neurons-tw/src/lib/sync/r2/bundles.ts:175)）+ history 註解。舊 client（schema 22）拉到 v23 bundle 會 drop 未知 `dmnGrantsTotal`（既有 forward-compat），但**舊 client 不得反手把缺 grants 的 snapshot push 回去覆蓋雲端的新計數器**——這由 D2 seeding 在新 client 端自癒（新 client 下次 pull 會用 `available + consumes` 反推回 grants）。
- **不 bump Dexie**：`dmnGrantsTotal` 是既有 `meta` table 的一個 key-value，無 store/索引變更 → 不觸發 `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` 的 fixture lint。

### D6 — Atomicity

- grant tx（dmn-trigger）：per-day cap counter + `dmnGrantsTotal` + 衍生 `dmnDrawsAvailable` 同一 `db.transaction('rw', db.meta, ...)`。
- consume tx（dmn-fate-card 兩分支）：award row + inventory/equipment + `dmnLifetimeDrawsConsumed` + 衍生 `dmnDrawsAvailable` 同一 tx（既有 tx 已含前三者，加衍生寫入）。
- pull-merge（dmn-daily backfill）：merge grants / merge consumes / derive available 同一 `db.meta` tx。

## Risks / Trade-offs

- **[並發跨裝置丟一個消耗]** → 接受。MAX 投影下兩裝置同時各抽一張會退一張券（偏向玩家、永不透支），spec 已記載並接受（[spec.md:123](openspec/specs/neurons-dmn-fate-cards/spec.md:123)）。
- **[seeding 寫錯→清空玩家券]** → 最高風險。以 Vitest 鎖三條 seeding/derive 路徑（fresh device 拉舊 bundle、v23 consumes 勝舊 available、遷移不跳動）+ backfill 冪等測試。
- **[衍生值與計數器不同步]** → 規定每個 mutation 點與 merge 點都在同一 tx 內重算 available；UI 只讀 `dmnDrawsAvailable`，不自己算。
- **[舊 client 把新 key strip 後 push 覆蓋]** → 由新 client 端 D2 seeding 自癒；並在 task 內以 cross-version 測試覆蓋「v22 incoming 不抹掉 v23 local 已推進的 consumes」。

## Migration Plan

1. 程式碼 land（grant/consume/merge 三處 + tables + bundles + bug-report）+ migration helper（D3）。
2. 既有玩家：下次 app 開啟跑 D3 lazy seed（無感）；下次 pull 跑 D2（reader-tolerant）。
3. 部署後 prod smoke：登入 → 看 `dmnDrawsAvailable` 不變（遷移無感）→ 抽 1 張 → 確認次數降且 reload/跨分頁後**不回升**（Chrome MCP + `performance` / `__dmn` debug）。
4. **Rollback**：還原本 change 的 commit 即可。`dmnGrantsTotal` 變回未知 key 被 drop；`dmnDrawsAvailable` 退回 raw-MAX（bug 復現但無資料損失，因為 `dmnLifetimeDrawsConsumed` 仍在）。無破壞性 schema 變更，rollback 安全。

## Open Questions

- 無 blocking open question。Bug-report debug payload 是否要同時帶 `dmnConsumesTotal` 一起（方便日後 triage）→ apply 時順手加上，成本低。
