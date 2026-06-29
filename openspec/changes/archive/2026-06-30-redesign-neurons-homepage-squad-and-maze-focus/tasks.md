## 1. Squad component split + shared helpers

- [x] 1.1 Add a shared squad read/write helper module (or reuse existing) exposing `readActiveSquad()` (filters stale/uncollected keys, mirrors `filterStaleRepresentatives`), `addToSquad(variantKey)` (cap-guarded, stamps `updatedAt`), `removeFromSquad(variantKey)` — all writing the unchanged `activeSquad` meta envelope. No Dexie/R2 schema change.
- [x] 1.2 Extract `SquadPreview` (read-only): avatar-stack of ≤ `MAX_SQUAD_SIZE` members via `VariantSprite` + a「到圖鑑編隊 →」link to `/collection?squad=1`; empty-state placeholder + link; responsive; reduced-motion safe.
- [x] 1.3 Create `SquadManager` (collection top): 5-slot row (filled = sprite + displayName + rarity + remove ×; empty = dashed「選擇神經元」) + `N / 5` count; remove control calls `removeFromSquad`; responsive reflow.
- [x] 1.4 Create `SquadCardAction` (per dex card, top-right): always-visible toggle —「＋加入隊伍」/「✓已入隊」/ disabled「隊伍已滿」; add path calls `addToSquad`; 6th-add-when-full surfaces「最多 5 隻，先移除一隻」toast (not silent).
- [x] 1.5 Remove `StudySquadPanel` (the editable panel + inline picker) from `OverviewPage`; delete dead code/CSS it leaves behind (orphan imports/vars).

## 2. Collection page — squad manager + per-card toggle + deep-link

- [x] 2.1 Mount `SquadManager` at the top of `CollectionPage` (above the family-grouped dex).
- [x] 2.2 Render `SquadCardAction` in each collected card's top-right; keep it visually distinct from the existing per-family「設為代表」representative control (position + label) so the two aren't conflated.
- [x] 2.3 Handle `?squad=1` query param on `/collection`: scroll `SquadManager` into view on arrival; no forced scroll when the param is absent.

## 3. Homepage — read-only squad preview placement

- [x] 3.1 Render `SquadPreview` on `OverviewPage` in the composition slot (order: stat-card → squad preview → family/maze surface), beside (not over) the maze; verify no homepage add/remove/edit affordance remains.

## 4. Maze focus decoupling — remove detail mode

- [x] 4.1 In `FamilyPicker`, remove the header click-to-zoom handler (header/sprite no longer a focus target) and remove `DockHeader` + `FamilyChipRail` + the `.is-detail` detail-mode class wiring.
- [x] 4.2 Replace `selectedFamilyId` detail-mode state with an ephemeral `focusedFamilyId` (React state, device-local, NOT persisted/synced) used only for the maze camera + focused-card highlight; remove the desktop grid `display:none` and the dock-measurement / scroll-compensation paths tied to detail mode.
- [x] 4.3 Add an explicit 🔍 聚焦 secondary button to each `FamilyCard` (icon-only < 768px, icon + short label ≥ 768px), styled so it does not out-weight 🆕/🔄/📖; wire it to set `focusedFamilyId`, expand the maze if collapsed, and emit the existing `emitMazeFocus(familyId, { manual: true })`.
- [x] 4.4 Apply a focused-card highlight (accent ring) driven by `focusedFamilyId`; ensure the card grid never collapses and the focused card's 🆕/🔄/📖 chips never move.

## 5. Maze panel — status pill, 全覽 = camera reset, offscreen toast

- [x] 5.1 In `MazeGrid` (or its host), render a status pill: unfocused →「腦圖全覽」, focused →「聚焦：<科>｜全覽」, no-explorable-node focus →「目前沒有可探索節點」.
- [x] 5.2 Downgrade 🔭 全覽 to a pure camera-reset: clears `focusedFamilyId` + `emitMazeRecenter()`; it is no longer a required exit (answering is always available). Keep exactly one canvas in a stable DOM node across focus/expand/collapse (no re-parent/remount).
- [x] 5.3 On 🔍 聚焦 when the expanded maze band is fully offscreen-above, surface a brief toast「已聚焦腦圖：<科> ↑」instead of force-scrolling to the top; allow `scrollIntoView({ block: 'nearest' })` only when the band is partially visible.
- [x] 5.4 Clear `focusedFamilyId` back to 全覽 when a year-filter narrowing removes the focused family from the visible set.

## 6. Mobile accordion dock (< 768px)

- [x] 6.1 Keep the maze accordion docking under the tapped card, but trigger it via the explicit 🔍 聚焦 button; keep that card's 🆕/🔄/📖 visible, leave other cards in normal flow (no chip rail), and avoid any page scroll-jump.
- [x] 6.2 Add a separate collapse chevron for the docked accordion, distinct from 🔭 全覽 (which only resets the camera).

## 7. Verification

- [x] 7.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (add/adjust any unit tests for the squad helper add/remove/cap/stale-filter and `focusedFamilyId` focus/clear logic).
- [x] 7.2 Confirm NO Dexie `.version()` bump and NO R2 `SCHEMA_VERSION` bump (grep the diff); `activeSquad` envelope + sync untouched.
- [x] 7.3 Chrome MCP smoke (prod-equivalent): homepage shows read-only squad preview (no edit control) → 到圖鑑編隊 link lands on `/collection?squad=1` scrolled to the manager → add/remove a member from a dex card updates the manager live + 6th-add toast → reload persists via `activeSquad`.
- [x] 7.4 Chrome MCP smoke: 🔍 聚焦 focuses the maze camera with the grid NOT collapsing and other subjects still answerable; 全覽 only resets the camera (not required to answer); status pill states correct; offscreen-focus shows the toast (no scroll-jump); single canvas DOM node stable across focus→switch→全覽 (no remount). Run desktop ≥ 768px AND the mobile dock path (< 768px via the forced-width probe / small viewport) including the separate collapse chevron.
- [x] 7.5 Reduced-motion: focus/preview animations degrade to static; SPA direct-URL + F5 on `/` and `/collection?squad=1` render fully (not 404/blank).
