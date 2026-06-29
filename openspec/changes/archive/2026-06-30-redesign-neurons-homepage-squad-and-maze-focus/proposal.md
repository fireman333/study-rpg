## Why

Two homepage UX frictions surfaced during dogfood and a Claude×Codex design review (scratch: `~/.claude/scratch/fusion-neurons-homepage-ux-2026-06-30.md`):

1. **The 神經元遠征隊 (Expedition Squad) editor lives on the already-crowded homepage and its inline picker is a cramped sprite-grid** — small sprites + tiny text, with no rarity/family context, so the player can't easily tell which neuron is which. The 圖鑑 collection tab already renders every collected variant as a legible card (large sprite + name + rarity), making it the natural place to *both* show and edit the squad.
2. **The per-subject maze zoom-in trigger is undiscoverable and the post-zoom layout hijacks the answering surface.** Today, clicking a family card's (unsignposted) header focuses the maze but also enters a full-page "detail mode": the clicked subject's answer area jumps *above* the maze, the card grid collapses (`display:none`), the other subjects shrink to a tiny chip rail that can't be answered, and a 🔭 全覽 press is *required* to resume normal answering. Players report the focused answer block "jumps up and is hard to find" and that needing 全覽 to get back is unintuitive.

## What Changes

**Issue 1 — relocate squad editing to 圖鑑, reuse the dex cards as the picker:**
- **BREAKING (UX surface)** Remove `StudySquadPanel`'s big panel + inline edit picker from the homepage (`OverviewPage`).
- Homepage keeps ONLY a small **read-only** squad entry: a mini avatar-stack of the ≤5 members + a「到圖鑑編隊 →」link to `/collection?squad=1` (scrolls to the squad section). No add/remove on the homepage.
- `/collection` gains a **5-slot 遠征隊 manager** at the top (above the family-grouped dex): filled slot = sprite + displayName + rarity + remove ×; empty slot = dashed「選擇神經元」.
- Each collected dex card gains a top-right **「＋加入隊伍 / ✓已入隊」** toggle (**always-editable, no 編輯 mode toggle**), visually separated from the per-family「設為代表」action. 6th add when full → toast「最多 5 隻，先移除一隻」(not a silent no-op).
- `activeSquad` meta key + its sync/LWW + the quiz-correct celebration + the maze expedition band are **unchanged** — pure presentational move, **no Dexie / R2 schema bump**. Stale/invalid variant keys are filtered on read.

**Issue 2 — decouple maze focus from a page mode:**
- Remove the invisible "click card header to zoom" trigger; the header is no longer clickable. Add an explicit **「🔍 聚焦」** secondary button on each family card (icon-only mobile / icon+label desktop) that never out-weights the 🆕 新題 / 🔄 錯題 / 📖 閱讀 CTAs.
- Focus becomes a **maze-camera state, not a page mode**: the family-card grid NEVER collapses, every subject stays answerable, the answer chips never move.
- **Remove the desktop detail mode entirely** (the dock-header-above-maze, the grid `display:none`, the single-row chip rail).
- **🔭 全覽 is downgraded** to a pure "zoom the maze camera back out to the whole connectome" convenience — it is no longer a required exit to resume answering. The maze shows a status pill:「腦圖全覽」(unfocused) vs「聚焦：<科>｜全覽」(focused).
- Maze stays default-collapsed teaser; tapping 聚焦 (or the teaser) auto-expands then frames. If the maze band is offscreen-above when 聚焦 fires, show a brief toast「已聚焦腦圖：<科> ↑」instead of a forced scroll-jump.
- Mobile (<768px): keep the accordion-dock-under-the-tapped-card, but triggered by the explicit 聚焦 button, with that card's 新題/錯題/閱讀 staying visible and the other cards unchanged (no chip rail); a separate chevron collapses the accordion (≠ 全覽).
- Edge cases: a family with no explorable node still centers the camera + pill「目前沒有可探索節點」(聚焦 stays enabled); a year-filter that removes the focused family from view clears focus back to 全覽.
- Internally, replace the `selectedFamilyId`-driven detail-mode CSS with a lightweight ephemeral `focusedFamilyId` (device-local, NOT synced) used only for the maze camera + card highlight.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-homepage`: Retire the master-detail detail-mode (dock-header / grid `display:none` / chip-rail / mandatory 全覽 exit) requirement; the homepage composition drops the editable squad panel in favor of a read-only squad entry; add the explicit 聚焦 trigger + non-hijacking focus behavior + maze status pill + offscreen-focus toast; 全覽 downgraded to a camera-reset.
- `neurons-study-squad`: The squad *editing* surface moves to `/collection`; the homepage renders a read-only squad preview only. Selection/persistence/sync semantics (the `activeSquad` envelope, LWW, celebration, maze band) are unchanged.
- `neurons-variant-collection-view`: Add the top-of-page 遠征隊 5-slot manager and the per-card「加入隊伍/已入隊」squad toggle (kept visually distinct from the existing per-family representative selection); support the `?squad=1` deep-link scroll target.

## Impact

- **Code (apps/neurons-tw):** `routes/OverviewPage.tsx` (remove squad panel + detail-mode wiring; add read-only `SquadPreview`; replace `selectedFamilyId` detail-mode with `focusedFamilyId` camera focus + offscreen toast), `components/StudySquadPanel.tsx` (split into `SquadPreview` / `SquadManager` / `SquadCardAction`; old panel removed), `components/FamilyPicker.tsx` (remove header click-to-zoom + `DockHeader` + `FamilyChipRail` + detail-mode classes; add explicit 聚焦 button + card highlight), `components/maze/MazeGrid.tsx` (status pill; 全覽 = camera reset; keep the existing focus/recenter camera API), `routes/CollectionPage.tsx` (mount `SquadManager` + per-card `SquadCardAction`; handle `?squad=1`), plus the associated CSS.
- **Data / sync:** none — `activeSquad` and all R2/Dexie schemas are untouched (no `SCHEMA_VERSION` bump, no Dexie `.version()` bump, no migration, no fixture).
- **Cross-cutting invariants preserved:** reduced-motion degradation, SPA direct-URL + F5 rendering, exactly one `MazeGrid` canvas instance (stable DOM node, no re-parent/remount), and the maze camera/focus event API.
