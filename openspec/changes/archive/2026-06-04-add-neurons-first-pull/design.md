## Context

神經元 app 的迷宮（`neurons-brain-maze`）以 `promote-maze-to-home` 後成為主頁，lit-node 純從 `maze:<branch>:settles` frontier 推導，settle 是唯一抽卡路徑（`reconcileSettles` → `pullVariant`）。新玩家一開局 4 分支 energy/settles 全 0、0 收藏，迷宮全暗。首抽要在「不破壞 settle 經濟」的前提下，讓四大 NT 分支（DA/5HT/GABA/Glu）各出現一隻代表並點亮節點。

相關現況（已查證）：
- 11 family 分屬 4 branch（`FAMILY_NT_BRANCH`：DA 2 / 5HT 2 / GABA 3 / Glu 4）。
- `pullVariant(familyId, resolveName)`（`variant-gacha.ts`）對指定 family 跑真實稀有度 roll、mint 真 variant（含 provenance / dupe / P0 pity / emit `variantRolled`）。
- `litNodes(branch, settles)`（`maze/graph.ts`）= hub 距離（`pathLen`）序前 `min(settles, nodeCount)` 個 node。
- 變體稀有度對探索**零機制影響**（`mazeSpeedMultiplier` 純看收集數量、mastery 是科目精通）。
- R2 bundle `SCHEMA_VERSION` 平行 session 已用到 14（Dexie v15）。

## Goals / Non-Goals

**Goals:**
- 一次性顯式「首抽」儀式，4 分支各得一隻隨機-family、真實稀有度的真 variant，並點亮其代表節點。
- 純贈送：不動 `settles` / `earned`（settle 經濟維持 0 起步）。
- 跨裝置只發一次（idempotent）。
- reveal 不被成就 toast 洪流淹沒。

**Non-Goals:**
- 不改 gacha roll 規則（沿用既有 pyramid / pity / provenance）。
- 不改 settle 經濟、pacing、二週目 least-collected。
- 不碰 leaderboard / SRS / mastery / DMN / 裝備（Phase 3）。
- 無 Dexie schema bump、無 backfill banner。

## Decisions

### D1 — 觸發：顯式一次性「首抽」CTA，gate 在 `firstPullDone`
首抽 CTA 主放 first-visit onboarding 卡片；點擊跑 4 連抽 + reveal。**Gate 條件 = `meta['firstPullDone']` 為否**（與 `homepageOnboardingDismissed` 獨立）。若玩家在未首抽前就 dismiss onboarding，於 CTA toolbar 顯示一顆精簡「首抽」入口直到 `firstPullDone`，確保永遠抽得到。
- 替代：開 app 自動發（少儀式感）／綁第一次互動（耦合核心 loop）。選顯式 = 玩家掌控 + 手遊首抽慣例。

### D2 — 首抽走直接 4×`pullVariant()`，不走 `reconcileSettles`
每分支：在該分支 families 內均勻隨機選 1 family → `pullVariant(family, resolveName)`。`reconcileSettles` 綁 settles 且只亮 frontier node 0，與「純贈送 + 隨機 family」衝突，故繞過、直呼 `pullVariant` 4 次。
- `pullVariant` 既有副作用（provenance / dupe / P0 pity++ / `variantRolled`）照常發生 — 4 抽分散在 4 個不同 family，pity 推進輕微、可接受。

### D3 — lit-node 模型：`frontier ∪ starter-lit`，starter-lit 顯式存
首抽要亮「被抽中 family 的節點」於 settles=0 → 不能靠 frontier（count-based）也不能靠收藏推導（一般收藏不亮節點、且無法區分首抽 vs 後續 variant）。故**顯式存** starter-lit：per-branch synced meta `maze:<branch>:starterFamily` = 被抽中的 familyId。`litNodes` 改為 `frontierLit(settles) ∪ { representativeNode(branch, starterFamily) }`，以 node key union（idempotent — 之後 frontier 走到同 node 不重複亮）。
- **family→node 代表映射**：一個 family 在分支圖有多 node（endpoint/branch/mid）。代表節點 = 該 family 中 `pathLen` 最小（hub 最近）那顆；平手以 `slotIndex` 再 node id tie-break（deterministic）。

### D4 — idempotency：synced `firstPullDone`（monotonic-OR）
首抽 orchestrator 在發放完 4 抽 + 寫 starterFamily 後，於同一邏輯流程 set `meta['firstPullDone'] = 'true'`。Sync 採 **monotonic-OR**（一旦 true 恆 true、merge 取 OR），比照 `everWrong` / `dmnEventLog` 紀律，防跨裝置或收藏變多後重抽。
- Gate 一律讀 `firstPullDone`，不以「收藏是否為空」判斷（避免清空收藏後重抽）。

### D5 — reveal 重用 motion library modal + 抑制成就 toast
reveal 重用既有 unlock modal（參考 `VariantUnlockModal` / `DmnDrawModal`），4 隻一次呈現。首抽流程期間**抑制成就 toast**：成就照常 unlock + 持久化，但 toast 入佇列 / 靜默，reveal 結束後再放（或不放）。避免 4 連抽觸發多筆成就 toast 蓋掉 reveal。

### D6 — sync：meta keys + bundle SCHEMA_VERSION 15，無 Dexie bump
- 新 synced meta keys 進 `SYNCED_META_KEYS`：`firstPullDone` + `maze:da:starterFamily` / `maze:5ht:starterFamily` / `maze:gaba:starterFamily` / `maze:glu:starterFamily`。
- 首抽 variants 走既有 collection adapter（`neuronVariants` / `neuronInstances`）→ **無新 table、無 Dexie `.version()` bump**（不觸發 dexie-fixture-lint）。
- R2 neurons bundle `SCHEMA_VERSION` 14 → **15**（additive + reader tolerance：v<15 client 丟未知 key、v15 讀 v<15 bundle 視為未首抽）。Worker 對 bundle opaque、無須改。

## Risks / Trade-offs

- **starter-lit 與 frontier 重複點亮** → `litNodes` 以 node key 做 set union；`representativeNode` deterministic；frontier 走到同 node = 已在 set、no-op。
- **跨裝置 race（A 首抽、B 尚未同步就也首抽）** → `firstPullDone` monotonic-OR + variants 經 collection bundle 收斂；極端情況（全新帳號多裝置同時首抽且未同步）可能雙發一次，實務上目前僅 owner、可接受。
- **首抽推進 P0 pity** → intended、4 抽分散 4 family、影響微小。
- **bundle 版號協調** → 平行 session 佔 14；本 change 用 15；reader tolerance 確保舊 client 不死。
- **成就 toast 抑制漏放** → 確保「抑制」只擋 toast，不擋 unlock 持久化；reveal 後 flush 佇列或靜默 unlock（不影響成就頁面狀態）。

## Migration Plan

- 純前向 additive：上線後新玩家（`firstPullDone` 不存在）看到首抽 CTA；既有玩家若 `firstPullDone` 不存在也會看到一次（實務上只有 owner，預期行為）。
- 無 backfill、無 banner、無 Dexie migration。
- Rollback：還原 client code + 把 bundle `SCHEMA_VERSION` 還原（新 meta key 對舊 client 為未知 → reader tolerance 丟棄，不破壞）。

## Open Questions

- reveal 呈現序：4 隻一次 grid vs 逐張翻 — UX polish，apply 階段定（傾向 grid 一次亮、省時）。
- 若未來多玩家上線，跨裝置 race 的雙發是否需更嚴格鎖（如 server-side once）— 目前 owner-only 不處理。
