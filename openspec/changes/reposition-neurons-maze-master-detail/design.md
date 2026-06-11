## Context

The neurons homepage currently renders, top→bottom: 儀表板 (`ConnectomeStatCard`) → **full-width maze centerpiece** (`MazeGrid`) → 遠征隊 (`StudySquadPanel`) → 引導文字 → `FamilyPicker` (year filter + 11 subject cards). Tapping a subject card calls `onFocusFamily` → `emitMazeFocus(id, {manual:true})` → the maze sticky-focuses that family's cluster.

Two owner-reported problems (dogfood, 2026-06-11):
1. The always-on maze **dominates** the page (large default footprint).
2. The card→focus feedback happens **off-screen**: cards are below the maze, so focusing the maze (above) is invisible to a player looking at the cards. The link between "this subject" and "its place on the map" is lost.

The maze internals are mid-redesign in `redesign-neurons-maze-static-render` (§1 viewport-canvas + §1.5 perf + §2 walker-glide + §3 node-reveal + §4 synapse-pulse shipped to `track-neurons` as WIP; §5 focus-fly / §6 ambient / §7 finalize / §8 colour-bands pending). The renderer already sizes itself from the stage element's `clientWidth/clientHeight` (a `ResizeObserver` re-frames on resize), so it can live in an arbitrarily-sized panel.

## Goals / Non-Goals

**Goals:**
- Each subject gives **immediate, in-view** map feedback when selected (the map response is next to/below where you tapped).
- The **whole-connectome** view (cross-subject synapses, the Hebbian metaphor) stays one tap away — never lost.
- Smaller **default footprint** (maze collapsed by default).
- **One** `MazeGrid` canvas instance (iOS perf — the §1 rewrite's whole point); reuse the existing focus bus.

**Non-Goals:**
- A second canvas / a per-subject *isolated* mini-maze (would lose the inter-family wiring AND cost a second render).
- Any Dexie / R2 / `SYNCED_META_KEYS` / economy / maze-internal-render change (that's the sibling change).
- Changing the family-card content (AP / mastery / quiz-mode chips / 📖 reading) — only the layout around it.

## Decisions

### D1 — Per-subject view = the WHOLE map focused, not an isolated mini-maze
Selecting a subject expands the one shared maze and flies its camera to that family's cluster (reusing `emitMazeFocus(id,{manual:true})` + `frameContextual` sticky focus). The player sees the subject **in context** — its corridors, its neighbours, the cross-subject synapses at crossings — which is exactly the "和地圖有關聯" goal, and is strictly better than an isolated single-subject maze (which would hide the relationships and need a 2nd canvas). 🔭 全覽 zooms the same map back out to the full connectome.

### D2 — Master-detail layout, responsive
- **Desktop (≥ 768px)**: two columns — subject cards (left) + the maze as a **sticky** panel (right). Selecting a card expands (if collapsed) + focuses the right panel.
- **Mobile (< 768px)**: a single full-width maze panel that **expands (accordion) adjacent to the selected card** + focuses it.
- Breakpoint 768 follows existing neurons conventions (480 / 768).

### D3 — Collapsed by default + slim teaser
Default = a slim, recognisable brain-map **teaser strip** (a short-height preview band, not the full panel) in the maze slot. Tapping the teaser **or** any subject card expands the maze. This shrinks the default footprint while keeping discoverability (a new player still sees "there is a brain map here"). Collapse/expand state persists across reloads via a **device-local meta key** (NOT in `SYNCED_META_KEYS` — purely a view preference).

### D4 — Block order + single whole-map entry
Homepage becomes: 儀表板 (`ConnectomeStatCard`) → 遠征隊 (`StudySquadPanel`) → **master-detail (科目卡 + 腦圖)**. The 遠征隊 stays high as the 出征 surface; the picker+maze is the main interaction zone at the bottom. The 🔭 全覽 control **inside** the maze panel is the sole whole-map entry (no separate "看整張腦圖" button).

### D5 — Subsumes §5 focus-fly; §6–§8 follow
This change owns the family-card → expand+focus interaction, which is §5 (focus-on-family) of `redesign-neurons-maze-static-render`. After this lands, §6 (ambient) / §7 (finalize) / §8 (colour-bands) apply to the repositioned maze. The sibling change's `tasks.md` §5 will be marked as delivered here.

### D6 — One instance, no remount on mobile (implementation nuance — apply-time + owner verify)
The literal "maze appears below the *specific* tapped card" must NOT re-parent the canvas under each of 11 cards (a DOM move = React remount = full re-bake, expensive + flicker). Keep **one** maze panel in a stable DOM slot. Candidate realizations (pick at apply, owner verifies on iPhone):
- **(a, recommended)** Mobile: the selected card reorders to the top of its exam-paper group (or the picker scrolls) so the single maze panel — rendered directly under the selected card's row — reads as "below that card", with `scrollIntoView` on selection. One instance, CSS reorder only.
- **(b)** Maze as a fixed bottom-sheet that slides up focused on selection.
- Desktop's sticky right panel is already a single stable slot (no nuance).

## Decision revision (post-Fable-5 review, owner-chosen)

A Fable 5 design pass + owner pick resolved the open questions toward **"pinned-map A"**, refining D2/D3/D6:
- **Maze lives INSIDE the「選 family 直接練習」box** (passed to `FamilyPicker` as a `mazeSlot`), as the master-detail's detail surface — NOT a sibling block. Reframing insight: the goal is "tapping a subject → the map's reaction is *in view*", which does NOT require the maze to be physically below the tapped card.
- **Desktop**: the maze is a **sticky right rail that exists only when expanded** (`.neurons-md.is-expanded` → grid `minmax(0,1fr) minmax(320px,420px)`, detail → column 2 sticky). Collapsed → block flow, cards full width (rail gone). Tapping a card focuses the rail (camera) with **no layout shift** (rejected the owner's earlier per-tap reflow idea — cards would jump).
- **Mobile**: the maze is an **always-visible compact sticky band** pinned to the viewport top (`position: sticky; top: 0` on `.neurons-md__detail`, height `clamp(240px, 40vh, 340px)`). A `MazeGrid` **compact mode** (CSS-driven, no prop → no remount on resize) hides the chrome (`.maze-howto` / `.maze-expedition-band` / `.maze-legend` → `display:none`) and switches the stage off its 1:1 aspect to the fixed band height — scoped to `.neurons-md__detail @media (max-width:767px)`, so the desktop rail keeps full chrome. The collapse button stays in the band; cards scroll underneath; the stage's `touchAction:none` means in-band touch pans the map (page scroll comes from the card area below). Stage sizing was moved off inline style into `.maze-stage` so the media query can override it.
- **First-visit + default = expanded** (the brain map is the product hook); a returning player's explicit collapse is respected via the device-local `maze:homeExpanded` pref.
- **One canvas, no remount** confirmed in Chrome: card-tap keeps `canvas` count at 1; only the teaser↔expand toggle mounts/unmounts.

## Risks / Trade-offs

- **Hook dilution**: collapsing the maze by default weakens the immediate "brain game" identity. Mitigated by the teaser strip + auto-expand on the first card tap (and onboarding can point at it).
- **Sticky-panel height coordination** (desktop): the right maze panel must get a sensible height (viewport-relative, sticky) while the left card column scrolls; the §1 renderer adapts via `ResizeObserver`, so sizing is mechanical but needs tuning.
- **Mobile no-remount** (D6): the chosen realization must avoid re-parenting the canvas; verify no re-bake/flicker on selection.
- **Interaction with the WIP sibling change**: both touch `MazeGrid.tsx` / `OverviewPage.tsx`; they live on the same branch sequentially (no parallel-worktree conflict). §5 is delivered here.
- Pure presentation → fixture-lint no-op; perf/visual verification is owner-iPhone (Chrome non-regression automatable).
