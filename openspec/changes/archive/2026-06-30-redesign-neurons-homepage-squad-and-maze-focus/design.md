## Context

The neurons-tw homepage (`OverviewPage.tsx`) composes a hero band, the ⚔️ 錯題出征 stat card, an editable **`StudySquadPanel`**, a how-to caption, and a **`FamilyPicker` + embedded `MazeGrid` master-detail**. The squad is the `activeSquad` synced meta envelope (`{ members: VariantKey[], updatedAt }`); it drives the homepage party row, the quiz-correct celebration, and the maze expedition animation band. Separately, `CollectionPage.tsx` (`/collection`, the 圖鑑 tab) is a card dex of collected variants grouped by family, already hosting a per-family「設為代表」selection.

Two problems (per `proposal.md`): the squad editor crowds the homepage with a cramped sprite-grid picker, and the maze zoom-in (triggered by an unsignposted family-card-header click) enters a disorienting full-page "detail mode" that hides the answering grid and requires 🔭 全覽 to exit.

This is a **presentation-only** redesign: no data model, Dexie schema, or R2 bundle changes. The maze camera/focus event API (`emitMazeFocus` / `emitMazeRecenter` / `frameContextual`) is reused as-is.

## Goals / Non-Goals

**Goals:**
- Move all squad *editing* off the homepage into `/collection`, using the existing dex cards as the legible picker.
- Keep a lightweight, read-only squad presence on the homepage for identity + discoverability (links to the collection editor).
- Make maze "focus a family" an explicit, discoverable action that **only moves the camera** — never reflows or hides the answering grid, never requires an explicit exit to resume answering.
- Preserve every existing invariant: `activeSquad` semantics + sync, reduced-motion degradation, SPA direct-URL/F5, exactly one `MazeGrid` canvas in a stable DOM node, and the maze focus/recenter API.

**Non-Goals:**
- No change to `activeSquad` shape, `MAX_SQUAD_SIZE`, sync/LWW, the celebration, or the maze expedition band's data source.
- No Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no migration, no upgrade fixture.
- No change to the maze's internal exploration/fog/node-pull mechanics or its camera math.
- No new navbar tab or route (the squad lives inside the existing `/collection`).
- Not redesigning the 錯題出征 stat card, the year filter, or the quiz/reading flows.

## Decisions

### D1 — Squad component split: `SquadPreview` / `SquadManager` / `SquadCardAction`
Split the monolithic `StudySquadPanel` into three small components sharing the same `activeSquad` read/write helpers:
- **`SquadPreview`** (homepage, read-only): mini avatar-stack of the ≤5 members (or empty-state「選 5 隻神經元代表你」) + a「到圖鑑編隊 →」link to `/collection?squad=1`. No mutation affordance.
- **`SquadManager`** (top of `/collection`): a fixed 5-slot row — filled slot = `VariantSprite` + displayName + rarity + remove ×; empty slot = dashed「選擇神經元」placeholder; a `3/5` count.
- **`SquadCardAction`** (per dex card): a top-right toggle —「＋加入隊伍」(addable) /「✓已入隊」(removable) / disabled「隊伍已滿」when full and not a member.

*Why over keeping one panel:* the homepage need (read-only identity) and the collection need (full editing) are genuinely different surfaces; one component with a mode flag would re-introduce the「編輯」toggle we are removing.

### D2 — Always-editable dex cards, no「編輯隊伍」mode toggle
On `/collection`, `SquadCardAction` is always visible on every collected card; there is no edit-mode switch. `/collection` is now the dedicated management home, so editing is the default. The squad action (top-right, **global** cross-family selection) is visually separated from the per-family「設為代表」action (kept where it is, framed as per-family) to avoid conflation.

*Alternative considered:* an explicit「編輯隊伍」toggle that reveals the per-card actions (mirrors the current panel). Rejected — it adds a mode the user must discover and exit; always-on is simpler on a dedicated page.

### D3 — Homepage keeps only a read-only entry (owner-confirmed)
Per the owner's pick, the homepage shows `SquadPreview` only (not the full 5-sprite editable row, not nothing). This declutters the homepage while preserving "this is my squad" identity and a one-tap path to the editor. The `?squad=1` query param makes `CollectionPage` scroll the `SquadManager` into view on arrival.

### D4 — Focus is camera state (`focusedFamilyId`), not a page mode (`selectedFamilyId`)
Replace the detail-mode-driving `selectedFamilyId` with an ephemeral `focusedFamilyId` (React state, device-local, NOT persisted, NOT synced) used **only** to (a) tell `MazeGrid` where to point its camera and (b) highlight the focused card. The `FamilyPicker` grid no longer toggles `.is-detail` (no `display:none`), there is no `DockHeader`, and there is no `FamilyChipRail`. The maze keeps using its existing `emitMazeFocus(familyId, { manual: true })` / `emitMazeRecenter()` bus — only the surrounding layout reaction changes.

*Why:* the disorientation is caused entirely by coupling camera-focus to a layout reflow that hides the answer chips. Decoupling removes the complaint at the root and deletes a large amount of master-detail CSS/JS (dock measurement, scroll-compensation, chip rail).

### D5 — Explicit 「🔍 聚焦」 trigger; header no longer clickable
Each `FamilyCard` gains a `🔍 聚焦` button as a **secondary** action (icon-only < 768px, icon + short label ≥ 768px) placed so it never visually competes with 🆕 新題 / 🔄 錯題 / 📖 閱讀. The card header/sprite is no longer a click target (removes the invisible affordance and accidental-trigger ambiguity). 聚焦 sets `focusedFamilyId`, expands the maze if collapsed, and emits a manual sticky focus.

### D6 — 全覽 = camera reset; maze status pill
🔭 全覽 clears `focusedFamilyId` and recenters the camera to the whole connectome — it is a convenience, never a required exit (answering was never removed). The maze panel renders a status pill reflecting state: unfocused →「腦圖全覽」; focused →「聚焦：<科>｜全覽」; collapsed → a compact「腦圖已收合｜展開」bar. A family with no explorable node still focuses the cluster center and shows「目前沒有可探索節點」(聚焦 is never disabled).

### D7 — Offscreen-focus feedback instead of scroll-jump
The maze stays default-collapsed teaser (existing behavior) so the card grid is immediately answerable. When 聚焦 fires and the (now-expanded) maze band is fully scrolled offscreen *above* the viewport, show a brief toast「已聚焦腦圖：<科> ↑」rather than force-scrolling the page to the top (the prior jump). If the maze band is partially visible, a gentle `scrollIntoView({ block: 'nearest' })` is allowed; a full jump-to-top is not.

### D8 — Mobile (<768px): keep accordion-dock, drop the hijack
Retain the「maze docks under the tapped card」accordion (it never had the desktop jump), but: trigger it via the explicit 聚焦 button (not a header tap), keep that card's 🆕/🔄/📖 visible above the docked maze, leave all other cards in normal flow (no chip rail), and give the accordion its own collapse chevron distinct from 全覽 (which only resets the camera). `focusedFamilyId` drives both the dock anchor and the camera, replacing the prior `selectedFamilyId` + `dockFamilyId` split where they overlapped.

### D9 — Year-filter / stale-key resilience
If a year-filter narrowing removes the `focusedFamilyId` family from the visible set, clear focus back to 全覽 (no active highlight pointing at a hidden card). `SquadPreview` / `SquadManager` filter members whose variant key is no longer collected (mirrors `filterStaleRepresentatives`), so a stale `activeSquad` never renders a broken slot.

## Risks / Trade-offs

- **Desktop vertical distance between maze and a lower card** → With the grid never collapsing, a 聚焦 on a card far below the maze re-frames a band the player may not see. *Mitigation:* D7's offscreen toast + card highlight give immediate feedback; the maze is an optional exploration surface, so not seeing the re-frame instantly is acceptable (the player scrolls up when they want to walk nodes).
- **Discoverability of the relocated squad** → Moving editing off the homepage risks players not finding it. *Mitigation:* D3's read-only `SquadPreview` + explicit「到圖鑑編隊 →」link + `?squad=1` scroll target keep a clear path; the squad is also conceptually at home next to the dex it draws from.
- **Removing detail-mode CSS could regress the single-canvas invariant** → The maze must stay one `MazeGrid` in a stable DOM node across collapse/expand/focus. *Mitigation:* the embedded maze stays mounted in the same node; only the surrounding layout classes change (no re-parent/remount). Verified by Chrome MCP smoke (focus → switch family → 全覽 with no canvas remount) per the brain-maze invariant.
- **Two selection affordances on one dex card (squad vs representative)** → Visual conflation risk. *Mitigation:* D2 separates them by position (squad = top-right global; representative = existing per-family slot) and label.
- **Always-editable cards add a control to every dex card** → Mild visual density on `/collection`. *Mitigation:* the toggle is a compact corner badge, not a full button row; acceptable on a dedicated management page.

## Migration Plan

Pure client-side presentation change — no backend, schema, or data migration. Deploy is the standard `pnpm run deploy:cf` (Cloudflare Pages, `med-study-rpg.com/neurons/`). No `SCHEMA_VERSION` / Dexie `.version()` bump means cross-device sync continues unchanged; older clients and newer clients interoperate on the unchanged `activeSquad` envelope. **Rollback:** revert the change commit and redeploy — no data written in any new shape, so there is nothing to clean up.

## Open Questions

None — the two design forks (homepage squad footprint; always-editable vs mode toggle) were resolved with the owner (D2, D3).
