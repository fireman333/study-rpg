## Context

一階 medexam-tw M5 已 ✓ mock-exam（2026-05-15）+ ✓ mentor-daily（2026-05-15）。Grill summary 在 `~/.claude/scratch/grilled-add-cosmetic-and-dorm-2026-05-15.md`。

關聯既有 capability：`item-catalog`（Item interface + rarity）、`character-system`（CharCard + 4 slot equipment）、`theme-pack-contract`（sprite map）、`engine-rewards`（milestone hook 觸發點）。

Cosmetic + dorm 合併為單一 change：避免「cosmetic catalog 已有但無處顯示」的死狀態。Scope 略大但語意清晰。

## Goals / Non-Goals

**Goals:**
- 新 `/dorm` route — 主角居中 + cosmetic overlay + 宿舍背景
- 20+ cosmetic 起手，5 category（頭飾 / 身體 / 配飾 / 持物 / 背景）
- Milestone unlock：level / stat / streak / boss / mock attempt 達特定門檻自動解鎖
- Locked 預覽：剪影 + unlock 條件 caption
- Cosmetic = `Item.isCosmetic: true` + `effects: []` — 抽卡 / inventory UI reuse
- 純展示，無 game mechanic（看書 / 休息 等留 future）

**Non-Goals:**
- ❌ Cosmetic 進抽卡 loot table — 純 milestone unlock
- ❌ Cosmetic 加 stat 加成 — `effects` 必為 `[]`
- ❌ 使用者自訂 / 上傳 sprite — hard-code catalog
- ❌ Cosmetic 交易 / 社交 / 分享 — 個人裝扮
- ❌ Cosmetic season pass / 限時 — 永久 milestone
- ❌ Dorm 內 mechanic（看書 +XP / 休息 +stamina）— M6+ feature
- ❌ Home view CharCard 顯示 cosmetic — cosmetic 只在 dorm 可見
- ❌ Combinatorial full-character sprite 換頭 — 走 sprite layer overlay

## Decisions

### D1: `isCosmetic` flag — Item 結構 0 改動

**選擇**：`Item` 加 optional `isCosmetic?: boolean` field。Cosmetic item 必須 `effects: []`（純視覺）。抽卡 loot 完全 ignore cosmetic（loot pool 排除 `isCosmetic === true`）。

**理由**：grill Q1 推薦。0 結構改動、全 reuse 抽卡 / inventory / equipment slot system。新增的只是「filter」邏輯（哪些 item 進 loot pool / cosmetic picker）。

**Alternatives 拒絕**：
- 新 `Cosmetic` interface — 重複 90% 跟 Item 一樣的欄位
- EquipSlot 加 'cosmetic' — CharCard 5-slot layout 需重寫，溢 scope

### D2: Cosmetic slot type — 新 5 cosmetic-* slots

**選擇**：cosmetic 用獨立 slot system，新增 5 個 EquipSlot：
- `'cosmetic-head'` — 頭飾（一次穿一件）
- `'cosmetic-body'` — 身體 / 白袍款式（一次穿一件）
- `'cosmetic-accessory'` — 配飾（一次穿一件）
- `'cosmetic-held'` — 持物（一次穿一件）
- `'cosmetic-background'` — 宿舍背景（一次選一件）

**Why 新 slot 而非 reuse**：既有 4 slot（head/body/weapon/charm）綁定 equipment effects；cosmetic 跟 effects 共存會混淆。讓 player.equipment 同時帶 functional equipment + cosmetic equipment 兩組 slot，互不干擾。

**Migration**：`Equipment` interface 加 5 個 optional cosmetic slot fields。既有 player save 0 影響（新欄位 undefined）。

**Alternatives 拒絕**：
- Reuse 既有 4 slot — 跟 functional equipment 互斥（穿了酷炫眼鏡就不能戴聽診器 stat-boost）
- 全部混在 inventory list 沒 slot — 無法控制「一次只穿一頂帽子」

### D3: Milestone unlock 公式

**選擇**：每個 cosmetic 定義一個 `unlockCondition: (player: Player) => boolean` 純函式。Catalog 中常量定義：
```ts
export const COSMETIC_CATALOG: readonly Cosmetic[] = [
  { id: 'student-coat', name: '醫學生白袍', category: 'body', unlockCondition: (p) => p.level >= 1, ... },
  { id: 'resident-coat', name: '住院醫師白袍', category: 'body', unlockCondition: (p) => p.level >= 10, ... },
  { id: 'knowledge-glasses', name: '博學眼鏡', category: 'head', unlockCondition: (p) => p.stats.knowledge >= 50, ... },
  // 20+ entries
] as const
```
`checkMilestoneUnlocks(prevPlayer, nextPlayer)` 比對前後狀態 — 若某 cosmetic prev 不解鎖 next 解鎖 → emit unlock event。

**Why pure function predicate**：彈性 + 易測試。Catalog 可由 theme pack 提供（fork TOEFL 可換成 TOEFL 風格 milestone）。

### D4: Sprite layer overlay — character-base + N cosmetic layers

**選擇**：dorm view 用 CSS `position: absolute` 疊 layers：
```
.dorm-character-stage
├── .character-base [z-index: 1]      ← player base sprite (character-base / character-base-female)
├── .cosmetic-body [z-index: 2]        ← if equipped
├── .cosmetic-head [z-index: 3]        ← if equipped
├── .cosmetic-accessory [z-index: 4]   ← if equipped
└── .cosmetic-held [z-index: 5]        ← if equipped
```
每個 cosmetic sprite 都是 384×384 透明 PNG，主角無背景 — 套上去自然 align。
`cosmetic-background` 不疊在主角上，是 dorm view 整個 frame 的背景圖。

**Sprite gen prompt template**（強調 transparency）：
```
"GBA pixel art {category} cosmetic asset for layering over a character-base sprite.
Only the {item} is visible, rest of the canvas is fully transparent.
{category-specific positioning hint}. 384x384 transparent PNG, 16-color quantized."
```
Category-specific hint:
- head：「positioned at top quarter of canvas, aligned with where head would be on character-base sprite」
- body：「coat/clothing covering torso area, aligned with character-base torso」
- accessory：「small item near upper chest or collar area」
- held：「item in right-hand area, lower half of canvas」
- background：「full canvas dorm room scene with desk/bed/lamp, NO character」

### D5: 「?」剪影 for locked

**選擇**：dorm 內裝扮間 inventory grid：
- Unlocked：彩色完整 sprite + name caption
- Locked：CSS `filter: brightness(0)` 變剪影 + overlay「?」字元 + caption「達 level 5 解鎖」
- Tooltip on hover (locked)：詳細 unlock condition description

**理由**：grill Q6 確認。動力最強。

### D6: Catalog 起手 20 cosmetics across 5 categories

**選擇**：明確 hard-code 20 個 cosmetic entries:

**Head (4)**: 醫學生眼鏡（lv1）/ 博學眼鏡（knowledge ≥ 50）/ 反射鏡（reflex ≥ 30）/ 七連勝徽帽（streak ≥ 7）

**Body (4)**: 醫學生白袍（lv1）/ 住院醫師白袍（lv10）/ 主治大白袍（lv20）/ 滿月加冕袍（streak ≥ 30）

**Accessory (4)**: 聽診器（lv1）/ 強記筆記本（memory ≥ 50）/ 持久勳章（stamina ≥ 100）/ 七連勝徽章（streak ≥ 7）

**Held (4)**: 國考考古題本（mock attempts ≥ 1）/ 詳解筆記（mock attempts ≥ 5）/ 處方箋（quiz answered ≥ 50）/ 年度大魔王打敗證書（bossAnnualPass ≥ 1）

**Background (4)**: 預設宿舍（lv1）/ 教科書山（reading minutes ≥ 100）/ 凌晨書桌（streak ≥ 14）/ 慶祝拉砲（mock totalScore ≥ 80 in one attempt）

Total: **20 cosmetics**

### D7: Dorm 純展示，無 mechanic

**選擇**：`/dorm` route 只渲染主角 + cosmetic overlay + 背景 + 裝扮間 picker。**不**加：
- 看書 → +reading XP
- 休息 → +stamina
- 點桌上書本 → 打開 SRS queue

**理由**：Scope 控制。M6+ feature。

### D8: Milestone check hook 時機

**選擇**：在 `setPlayer` 後立刻跑 `checkMilestoneUnlocks(prev, next)` — 如果有新 unlock，emit toast「已解鎖：博學眼鏡」+ 加進 player.inventory（透過 instanceFromUnlock helper）。

**實作位置**：App.tsx — useEffect `[player]` dep + ref-guarded only-fire-once-per-unlock pattern。

**Edge case**：rapid player updates（一次點 mini-boss 拿 +50 stat）可能跨多個 milestone → toast 排隊（max 3 同時顯示，其餘 queue 顯示完上一個再下一個）

### D9: 不破壞 home view CharCard

**選擇**：CharCard.tsx 不動。Cosmetic 只在 `/dorm` route 內可見。Home → /dorm → return home 視覺切換明確。

**理由**：grill Q3 user 明選此 path。也避免 CharCard 顯示邏輯複雜化。

## Risks / Trade-offs

- **Sprite gen wall ~60–80 min** → 並行 batch 4 個一輪可壓到 ~20 min；但 codex CLI 並行可能 rate-limit / 撞 SessionStart hook → fallback sequential 1 hr
- **Sprite layer alignment**：cosmetic-head 對齊 character-base 頭部位置 — codex 生圖可能位置漂移 → prompt 強調「aligned with character-base head position」+ 視覺 QA 重要
- **Player.equipment 5 個新 cosmetic slot**：interface 變大，但所有都 optional → 0 既有 save 影響
- **Catalog hard-code 20 entries 在 theme pack 內**：fork TOEFL 等需要重新設計 cosmetic milestone — 可接受（theme-pack 跨換考試本來就要 customize）
- **Locked cosmetic 全列出可能 overwhelming**：dorm picker 預設 collapsed by category，user 點 expand 才看
- **3 個未顯式 OOS（stat-boost / trading / season-pass）**：design.md 在 Non-Goals 顯式 lock
- **Milestone check on every setPlayer 性能**：catalog 20 entries × O(1) condition check = trivial；不擔心

## Migration Plan

- `Item.isCosmetic` 加 optional field — 既有 item save 0 影響
- `Equipment` interface 加 5 cosmetic slot — 既有 player save 0 影響（undefined → display as unequipped）
- Theme sprite map 加 ~20 cosmetic keys — 既有 sprite resolve 0 影響
- 既有 inventory / loot UI 不受影響（cosmetic 走獨立 dorm picker）
- No Dexie schema bump — `Equipment` 是 player.equipment Record，schema unchanged

## Open Questions

1. **Cosmetic 入 player.inventory 還是獨立 unlocked list**：技術上 inventory 已支援，但混在 functional item 裡會干擾 InventoryModal — 建議 cosmetic 進 inventory 但 InventoryModal filter 排除（filter on isCosmetic）
2. **Milestone formula 細節**：grill 給的數字（lv10 / knowledge 50 / streak 7）需 dogfood 後調 — 太低會一日全解，太高會挫敗
3. **Sprite alignment**：codex 生圖位置不一定精準 — propose 階段定 visual QA rubric（人眼可接受 ≤ 10 px 偏差）
4. **Background cosmetic 是 dorm-view 內 sprite layer 還是 CSS background-image**：建議 sprite layer（一致性）
5. **Apply 階段 manual dogfood**：build 完跑 1–2 個 milestone（例 mock 答題 +knowledge 達 50）看 toast 是否觸發 + cosmetic 是否套上身
