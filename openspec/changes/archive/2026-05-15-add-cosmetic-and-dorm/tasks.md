## 1. Core types — Item.isCosmetic + cosmetic EquipSlot keys

- [x] 1.1 Add `isCosmetic?: boolean` to `Item` interface in `packages/core/src/types.ts`
- [x] 1.2 Extend `EquipSlot` type to include 5 cosmetic slots: `'cosmetic-head' | 'cosmetic-body' | 'cosmetic-accessory' | 'cosmetic-held' | 'cosmetic-background'`
- [x] 1.3 Add 5 optional cosmetic slot fields to `Equipment` interface
- [x] 1.4 Add `Cosmetic` interface for catalog entries (`id`, `name`, `category`, `unlockCondition`, `unlockDescription`, `artKey`)
- [x] 1.5 Add `CosmeticCategory` type alias (`'head' | 'body' | 'accessory' | 'held' | 'background'`)

## 2. Core engine — cosmetic pure functions

- [x] 2.1 Create `packages/core/src/lib/cosmetic.ts` with pure functions:
  - `checkMilestoneUnlocks(prev: Player, next: Player, catalog: readonly Cosmetic[]): Cosmetic[]` — diff-based unlocks
  - `cosmeticToItem(c: Cosmetic): Item` — converts catalog entry to functional Item with `isCosmetic: true` + `effects: []`
  - `cosmeticSlotForCategory(cat: CosmeticCategory): EquipSlot` — `head` → `cosmetic-head` etc.
  - `equipCosmetic(player: Player, instanceId: ItemInstanceId, slot: CosmeticSlot): Player`
  - `unequipCosmetic(player: Player, slot: CosmeticSlot): Player`
- [x] 2.2 Re-export public API from `packages/core/src/index.ts`
- [x] 2.3 Modify `rollLoot` (in `loot.ts`) to filter out cosmetic items: `pool = catalog.filter(i => !i.isCosmetic)`

## 3. Sprite generation (codex `$imagegen`)

- [x] 3.1 Draft cosmetic sprite prompt template (per category, transparent layer-style, GBA pixel art)
- [x] 3.2 Generate dorm-default background sprite (`dorm-default.png`, full canvas dorm room scene)
- [x] 3.3 Generate 4 head cosmetic sprites (transparent except glasses/帽子, aligned with character head position)
- [x] 3.4 Generate 4 body cosmetic sprites (white coat variants, transparent elsewhere)
- [x] 3.5 Generate 4 accessory cosmetic sprites (stethoscope, badge, notebook, etc.)
- [x] 3.6 Generate 4 held-item cosmetic sprites (book, notebook, prescription pad, certificate)
- [x] 3.7 Generate 4 background cosmetic variants (textbook mountain, late-night desk, party room, etc.)
- [x] 3.8 Move all 21 sprites to `packages/theme-pixel-medical/sprites/cosmetic/`
- [x] 3.9 Visually verify each at ~256×256 display: alignment / transparency / style consistency
- [x] 3.10 Regenerate any subpar sprite (>10px alignment drift, off-style)

## 4. Theme pack — register sprites + COSMETIC_CATALOG

- [x] 4.1 Import all 21 cosmetic sprites into `packages/theme-pixel-medical/src/sprites.ts`
- [x] 4.2 Register cosmetic + dorm-default sprite keys into `SPRITE_MAP`
- [x] 4.3 Define `COSMETIC_CATALOG` in `packages/theme-pixel-medical/src/items.ts` with 20 entries (4 per category for head/body/accessory/held + 4 backgrounds)
- [x] 4.4 Each entry: `id`, `name` (zh-TW), `category`, `unlockCondition` (pure predicate against Player), `unlockDescription`, `artKey`
- [x] 4.5 Export `COSMETIC_CATALOG` from theme pack root
- [x] 4.6 Verify `pnpm --filter @study-rpg/theme-pixel-medical typecheck` succeeds

## 5. App — Dorm route

- [x] 5.1 Create `apps/medexam-tw/src/routes/DormRoute.tsx`
- [x] 5.2 Layout: header with "← 回家" link, "🏠 宿舍" title, character stage (centered), picker section below
- [x] 5.3 Character stage: 6 layers (background z0, character z1, body z2, head z3, accessory z4, held z5) using `position: absolute` overlap
- [x] 5.4 Background layer: `cosmetic-background` if equipped, else `dorm-default`
- [x] 5.5 Cosmetic layers: only render when corresponding slot has equipped item; resolve sprite via `sprites[item.artKey]`
- [x] 5.6 Pause reading-loop timer while on `/dorm/*` route (extend isInMockRunner pattern to isInRestRoute)

## 6. App — CosmeticPicker component

- [x] 6.1 Create `apps/medexam-tw/src/components/CosmeticPicker.tsx`
- [x] 6.2 Render catalog grouped by 5 category headers (頭飾 / 身體 / 配飾 / 持物 / 背景)
- [x] 6.3 For each entry, compute `isUnlocked = cosmetic.unlockCondition(player)` and `isEquipped = player.equipment[slot] === <thisInstanceId>`
- [x] 6.4 Unlocked: full-color sprite + name + "穿上" / "脫下" button
- [x] 6.5 Locked: silhouette (`filter: brightness(0)`) + "?" overlay + `unlockDescription` caption + tooltip
- [x] 6.6 Click "穿上" → `equipCosmetic` → save player → toast
- [x] 6.7 Click "脫下" → `unequipCosmetic` → save player
- [x] 6.8 Click locked → do nothing (or show toast with full description)

## 7. App — Milestone unlock hook + integration

- [x] 7.1 In `App.tsx`, add `useEffect([player])` that runs `checkMilestoneUnlocks(prevRef.current, player, COSMETIC_CATALOG)` after every player update
- [x] 7.2 For each newly-unlocked cosmetic: push `ItemInstance` (via `instanceFromCosmetic` helper) into `setInstances` + show toast "🎉 已解鎖：博學眼鏡"
- [x] 7.3 Multi-unlock: queue toasts (max 3 visible at once, FIFO)
- [x] 7.4 Track `prevPlayer` via `useRef` to avoid re-checking on every render
- [x] 7.5 Add "🏠 宿舍" entry button in home actions area; always enabled (no level gate)
- [x] 7.6 Wire `/dorm` route in `<Routes>` to render `DormRoute` with `content`, `player`, `setPlayer`, `instances`, `setInstances`, `sprites`, `COSMETIC_CATALOG`

## 8. App — InventoryModal filter to exclude cosmetics

- [x] 8.1 In `InventoryModal.tsx`, filter out `isCosmetic === true` items from main inventory grid
- [x] 8.2 Cosmetic items only visible from dorm picker (avoid clutter in functional inventory)

## 9. CSS

- [x] 9.1 Append `.dorm-page`, `.dorm-character-stage`, `.dorm-layer` styles to `apps/medexam-tw/src/styles.css`
- [x] 9.2 Cosmetic picker grid: 5 category sections, responsive grid (2-4 columns)
- [x] 9.3 Locked silhouette: `filter: brightness(0)` + `?` pseudo-element overlay
- [x] 9.4 Toast queue styling (consistent with SkillUnlockToast)
- [x] 9.5 Mobile (< 768px): character stage scales down, picker reflows to 2 columns

## 10. Tests

- [ ] 10.1 _(deferred — no test framework)_ Unit-test `checkMilestoneUnlocks` with 0/1/multi unlock scenarios + re-unlock idempotence
- [ ] 10.2 _(deferred)_ Unit-test `equipCosmetic` / `unequipCosmetic` pure-function invariants
- [ ] 10.3 _(deferred)_ Unit-test `rollLoot` excludes cosmetic items
- [x] 10.4 (Chrome MCP smoke verified happy path) Chrome MCP smoke: home shows 宿舍 button → click → DormRoute renders with base character + dorm-default background + picker grouped by category
- [x] 10.5 (Chrome MCP smoke verified happy path) Chrome MCP smoke: equip cosmetic → see sprite layer appear over character → unequip → disappears
- [x] 10.6 (Chrome MCP smoke verified happy path) Chrome MCP smoke: locked cosmetic shows silhouette + unlock hint; clicking does nothing
- [x] 10.7 (Chrome MCP smoke verified happy path) Chrome MCP smoke: trigger a milestone (e.g. answer enough quizzes for knowledge +50) → toast appears → cosmetic now equippable
- [x] 10.8 (Chrome MCP smoke verified happy path) Chrome MCP smoke: home view CharCard does NOT change after equipping cosmetic

## 11. Verification + archive prep

- [x] 11.1 Run `pnpm -r typecheck` — all green
- [x] 11.2 Run `pnpm --filter @study-rpg/medexam-tw build` — bundle builds cleanly with 21 new sprite assets
- [x] 11.3 Run `/verify` skill or equivalent Chrome MCP end-to-end check
- [ ] 11.4 Manual dogfood: do enough quizzes/streak to trigger 2-3 milestones, equip + unequip, swap variants, visit dorm with mock active (verify reading-loop pause)
- [x] 11.5 Update `openspec/project.md` Roadmap M5 entry: mark all 4 items ✓, M5 complete
- [x] 11.6 `/opsx:verify add-cosmetic-and-dorm` — 3-dim coherence check
- [ ] 11.7 `/opsx:archive add-cosmetic-and-dorm` — sync 4 spec deltas, move folder to archive/
- [ ] 11.8 Commit via auto-git: `spec(archive): merge add-cosmetic-and-dorm — cosmetic-system + dorm-view capabilities + 20 cosmetic milestone unlocks (M5 complete)`
