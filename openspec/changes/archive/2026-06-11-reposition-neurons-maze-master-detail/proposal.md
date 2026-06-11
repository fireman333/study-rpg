## Why

The always-expanded brain maze dominates the homepage, and tapping a subject card (which sits *below* the maze) focuses the maze *off-screen above* — so the player never sees the feedback that links a subject to its place on the map. Owner dogfood goal: make each subject feel connected to the map with immediate, in-view feedback, while keeping the whole-connectome view one tap away.

## What Changes

- The brain maze is **no longer an always-expanded top centerpiece**. There remains exactly **one** whole-map `MazeGrid` instance (no second canvas — iOS perf), repositioned into a **master-detail layout coupled to the family picker**, collapsed by default.
- **Default (collapsed)**: a slim teaser strip (a recognisable brain-map thumbnail) replaces the full maze; tapping the teaser **or** any subject card expands the maze.
- **Desktop (≥ 768px)**: two-column master-detail — subject cards on the left, the maze as a **sticky panel on the right**. Selecting a subject flies/focuses the maze on that subject's cluster.
- **Mobile (< 768px)**: subject cards stacked; tapping a subject **expands the maze (accordion) directly below that card**, focused on that subject.
- **Per-subject view = the whole map FOCUSED on that subject** (a camera zoom level), NOT a separate single-subject mini-maze — so each subject reads in-context with its neighbours + cross-subject synapses (the Hebbian "fire together, wire together" metaphor needs the whole lattice). A 🔭 全覽 control zooms the same map out to the full connectome.
- **Homepage block order** becomes: 儀表板 (`ConnectomeStatCard`) → 遠征隊 (`StudySquadPanel`) → master-detail (科目卡 + 腦圖).
- This change **subsumes §5 (focus-on-family)** of `redesign-neurons-maze-static-render`; §6–§8 (ambient / finalize / colour-bands) apply to the repositioned maze afterwards.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-homepage`: the maze is no longer the top centerpiece; homepage composition becomes dashboard → squad → a collapsible master-detail (family picker + embedded maze); the maze defaults to a slim teaser.
- `neurons-brain-maze`: maze embedding/placement (master-detail panel, not a standalone full-width centerpiece); collapse/expand + teaser behaviour; the per-subject focused view is the whole map framed to a family (selecting a family card expands + flies the embedded maze).

## Impact

- **Code**: `apps/neurons-tw/src/routes/OverviewPage.tsx` (page composition + collapse/teaser state + selected-subject wiring), `apps/neurons-tw/src/components/FamilyPicker.tsx` (master-detail layout; emit selected subject), `apps/neurons-tw/src/components/maze/MazeGrid.tsx` (embeddable in a sized panel; teaser/expanded modes; reuse existing focus bus), `apps/neurons-tw/src/styles.css` (responsive two-column / accordion).
- **No** Dexie / R2 / `SYNCED_META_KEYS` / economy change → `lint:dexie-fixtures` no-op. Collapse state may use a device-local meta key (not synced).
- **Interaction**: layers on top of the in-flight `redesign-neurons-maze-static-render` (§1–§4 shipped to track-neurons as WIP; §5 folded here; §6–§8 follow). Verification stays owner-iPhone for perf/visual; Chrome non-regression automatable.
