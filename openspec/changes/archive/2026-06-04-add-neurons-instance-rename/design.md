## Context

個體層資料模型（`apps/neurons-tw/src/lib/db.ts:116`）：

```ts
interface NeuronInstanceRow {
  instanceId: string        // device-stable, immutable (e.g. "GABA-pv:3:1748...:m0")
  familyId: string; slotIndex: number; rarity: VariantRarity
  spriteKey: string; rolledAt: number
  provenance?: NeuronVariantProvenance
  consumedAt: number | null // null=held; ms once consumed by tier-promote (monotonic-OR soft-delete)
}
```

- `neuronVariants`（slot 層，PK `[familyId+slotIndex]`，immutable content + `copies` MAX-merge）是 slot 擁有索引；`neuronInstances`（PK `instanceId`）是個體層，held = `consumedAt === null`。
- persona 名來自 content pack，鑄造時 `composeVariantDisplayName(catalogDisplayName, rarity)` →「persona · rarity 稱號」，寫進 `neuronVariants.displayName`（slot 層，immutable）。
- dupe-fusion（`lib/services/variant-fusion.ts` `promoteTier`）消耗 K 個 **surplus** 個體（`eligibleSurplusByTier` 保護每 slot 最舊個體），mint 一個高一階個體；消耗 = 設 `consumedAt`（never hard-delete）。
- CollectionPage（`routes/CollectionPage.tsx`）：slot 卡顯示 `row.displayName`（persona）；個體展開視圖（:384，gate `heldCount > 1 && ordered.length > 1`）渲染各 held 個體 40px mini-sprite + `title` tooltip（birth caption）。
- 參考可編輯文字 pattern：leaderboard 暱稱（`LeaderboardSettingsControls` saveNickname + LWW）。
- per-row LWW-on-`updatedAt` adapter 範本：`questionFlagsAdapter`（`lib/sync/tables.ts:662`）。
- Dexie 最高 `v13`；R2 bundle `SCHEMA_VERSION = 12`。

## Goals / Non-Goals

**Goals:**
- 玩家能為**任一持有個體**（含 singleton）取 / 改 / 清暱稱。
- 暱稱與 persona 名**並存**（暱稱為主、persona·rarity 副標）。
- 跨裝置同步（LWW），與既有 immutable variant 同步紀律不衝突。
- 純加性 schema / sync bump，不破壞既有資料、不動 fusion 行為。

**Non-Goals:**
- **不**改 slot 卡的 persona 名（slot 身分仍是 persona）。slot-card 顯示代表個體暱稱留作 future。
- **不**做暱稱唯一性 / NFKC / 不雅字過濾（私人資料、非公開、無撞名需求）。
- **不**改 dupe-fusion 的消耗邏輯。
- **不**動 `neuronVariants` adapter 的 immutable-first 紀律。

## Decisions

### D1 — Per-instance，獨立 `instanceNicknames` 表（不污染 immutable variant adapter）
新表 `instanceNicknames`：`{ instanceId: string (PK); nickname: string; updatedAt: number }`，Dexie index `'instanceId, updatedAt'`。
理由：`neuronVariantsAdapter` 是 first-write-wins immutable（slot content 不可變，`copies` MAX-merge，註解明禁 LWW）。暱稱是可變使用者輸入，必須 LWW —— 塞進 immutable adapter 會污染那條紀律。獨立表 + 獨立 adapter 乾淨隔離，且自然 keyed by 個體（per-instance 需求）。

### D2 — 同步 = per-row LWW on `updatedAt`（鏡像 questionFlags，**非** monotonic）
`instanceNicknamesAdapter` 完全 mirror `questionFlagsAdapter`：snapshot = `toArray()`；apply = 逐列比 `updatedAt`，incoming 較新才 `put`。
暱稱**可變更 / 可清除**（與 `everWrong` / `consumedAt` 的單向 monotonic 不同），所以 LWW 是正解，**不可**用 monotonic-OR。清除暱稱 = 寫 `nickname: ''` + 新 `updatedAt`（空字串 = 已清，視為無暱稱顯示），讓清除動作也能跨裝置 LWW 傳播（避免 hard-delete + LWW 的復活問題，比照 questionFlags 用「狀態欄位」而非刪列）。

### D3 — dupe-fusion 折衷：orphan-on-consume，零 fusion 耦合、零 tombstone
fusion **行為完全不變**。被消耗的個體 `consumedAt` 設值（monotonic-OR、永不跨裝置復活），其 `instanceNicknames` 列**保留但永不顯示**（UI 僅渲染 `consumedAt === null` 的 held 個體）。
- 不需 tombstone：個體本身已是 monotonic soft-delete，暱稱列即使同步過去也指向一個全裝置皆 consumed 的個體 → 永不渲染 → 無害死資料（極小）。
- 不需 fusion 耦合：`eligibleSurplusByTier` / `promoteTier` 不需感知暱稱。
- **資料遺失風險極低**：fusion 只消耗 surplus（保護每 slot 最舊個體）。玩家命名的「代表」個體通常是最舊的 held → 天然受保護不被消耗。只有當玩家替一個 surplus dupe 命名、又主動 fuse 該 tier 時才會失去那個名字（可接受，非「代表」個體）。

### D4 — 並存顯示（暱稱為主、persona·rarity 副標），在個體視圖
顯示在 CollectionPage 個體展開視圖，每個 held 個體：
- 有暱稱 → 主文字 = 暱稱，副標小字 = `persona · rarity 稱號`（即既有 `row.displayName`）。
- 無暱稱 → 照舊只顯示 persona 名。
slot 卡 header 不變（仍是 slot persona 身分）。

### D5 — 個體視圖對所有持有 slot 開放（含 singleton）
現行展開 gate `heldCount > 1` 會讓單一個體無法展開 → 無法命名。改為 **held 個體 ≥ 1 即可進入個體視圖**（rename 入口）。N=1 時 label 用「個體」措辭（不寫「展開 1 隻」之尷尬）。確保「每個神經元」皆可命名。

### D6 — 編輯 UX + 約束（鏡像 leaderboard 暱稱，但私人化）
個體列加 ✏️ rename 控制 → inline input（或小 popover）。約束：`trim`、長度上限（建議 ≤ 16 字元）、空字串 = 清除暱稱（寫空字串 + updatedAt，回退顯示 persona）。**無**唯一性 / NFKC / 過濾（私人資料）。寫入後 liveQuery 自動刷新（`useLiveQuery` over `instanceNicknames`）。

## Risks / Trade-offs

- **Dexie v14 + R2 13 是稀缺共用資源**：與並行 Phase 4 若同 bump → merge 衝突。Mitigation：apply 前確認 Phase 4 footprint；本變更鎖 `v14` / `R2 13`，Phase 4 若需 bump 取 `v15` / `R2 14`，第二個 merge 者重編號（廉價、一行）。**這是 apply-gate 前要敲定的協調點，不是 propose 階段問題**。
- **CI dexie-fixture-lint 強制 v13→v14 fixture**：tasks 必含 `__tests__/db-v13-to-v14-migration.test.ts`（canonical pattern 見 `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`）。漏寫 → CI fail。
- **orphan 暱稱死資料累積**：理論上長期 fuse 很多命名 dupe 會留死列，但每列極小（instanceId+短字串+數字）、永不渲染、不影響查詢（held 查詢 filter `consumedAt`，不碰 nickname 表）。可接受；若未來真的肥大再加 GC。
- **個體視圖 gate 放寬（D5）**：單一個體也顯示「個體」入口，輕微增加 UI 元素密度。可接受（換取 singleton 可命名）。
- 風險整體 **P4 NPC→中**：schema + sync bump（有 questionFlags/leaderboard 雙範本）+ CI fixture 紀律；無演算法風險。

## Open Questions

- 暱稱長度上限 16 是暫定（無強依據）——dogfood 後可調。
- 是否要讓 slot 卡顯示「代表個體」的暱稱（而非 persona）？本版 Non-Goal，待 telemetry / 使用者回饋再評估。
