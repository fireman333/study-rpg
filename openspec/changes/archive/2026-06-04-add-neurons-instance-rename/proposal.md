## Why

neurons-tw 的個體層（`neuronInstances`，add-neurons-dupe-fusion 引入的 Pikmin-Bloom「每隻分身都是獨立生物」設計）目前每個 collected 神經元只能顯示鑄造時組好的 persona 名（`composeVariantDisplayName` →「persona · rarity 稱號」），玩家**無法為自己收集的神經元取名**。對一個以「收集養成」為核心 loop 的遊戲，命名是建立情感連結的關鍵 affordance（取名 = 「這隻是我的」）。

本變更讓玩家為**每一個個體**（per-instance，非 per-slot）取自訂暱稱，與既有 persona 名**並存顯示**。

## What Changes

- 新增 per-instance 自訂暱稱：玩家可在圖鑑（CollectionPage）個體視圖為任一持有個體命名 / 改名 / 清除。
- **並存顯示**：個體顯示「自訂暱稱」為主、`persona · rarity` 退為小字副標；未命名個體照舊顯示 persona 名。
- 暱稱綁 `instanceId`（device-stable、immutable），存於**新獨立表 `instanceNicknames`**，不動既有 immutable `neuronVariants` adapter。
- 跨裝置同步：新 adapter 走 **per-row LWW on `updatedAt`**（鏡像 `questionFlagsAdapter`）；暱稱可變、最後編輯勝。
- 個體視圖開放給**所有持有 slot**（含單一個體），讓 singleton 也能命名。

## Capabilities

### New Capabilities
- `neuron-instance-rename`: per-instance 自訂暱稱的資料模型、持久化、跨裝置同步、編輯 UI、並存顯示規則，與 dupe-fusion 消耗時的暱稱語意。

### Modified Capabilities
<!-- 無 — 顯示規則 / fusion 語意都收進新 capability，不改既有 spec 的 normative 文字 -->

## Impact

- **Affected specs**: 新 `neuron-instance-rename`（ADDED requirements）。
- **Schema (Dexie)**: `apps/neurons-tw/src/lib/db.ts` `.version(13)` → `.version(14)`，純加 1 個新表 `instanceNicknames`（index `instanceId, updatedAt`），無資料 migration、無既有表 PK 變動。**附 v13→v14 upgrade fixture**（CI `dexie-fixture-lint` 強制）。
- **Sync (R2)**: `apps/neurons-tw/src/lib/sync/r2/bundles.ts` `SCHEMA_VERSION` `12` → `13`（additive + reader tolerance）；`apps/neurons-tw/src/lib/sync/tables.ts` 新增 `instanceNicknamesAdapter`（LWW）並註冊進 `NEURONS_ADAPTERS`。
- **UI**: `apps/neurons-tw/src/routes/CollectionPage.tsx` 個體展開視圖加 rename 控制 + 並存顯示；新增暱稱 service（`lib/services/instance-nickname.ts`）。
- **dupe-fusion**: 行為**不變**。被 tier-promote 消耗的個體（`consumedAt` 設值、monotonic-OR soft-delete、永不跨裝置復活）其暱稱列變成不可見死資料（UI 僅渲染 held 個體）；fusion 保護每 slot 最舊個體，玩家命名的「代表」個體天然不被消耗。
- **無**新 dependency。
- **稀缺資源協調**：本變更佔用 Dexie `v14` + R2 `SCHEMA_VERSION 13`。若並行的 Phase 4（expedition rewards）也 bump schema，apply 前需協調版本號（見下方提醒）。
