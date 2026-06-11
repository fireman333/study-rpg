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

## Decision revision 2 (C′ desktop + A2 mobile — owner-chosen, supersedes the pinned-map rev. 1)

The rev. 1 "pinned-map A" (desktop sticky right rail + mobile in-flow band) shipped as WIP but still read as a cramped fixed slot. A second owner pass replaced it with **C′ (desktop) + A2 (mobile)**. This **supersedes** the rev. 1 desktop sticky-rail-only and the mobile in-flow-only realizations (kept in history above) — but **preserves** the still-correct invariants from D1/D6 + rev. 1: ONE canvas, no re-parent/remount, whole-map via 🔭 全覽, pure presentation, and (explicitly **still rejected**) the original per-tap card-reflow idea from rev. 1 (`design.md` line 53) — switching families must NOT reflow the cards.

### D7 — Desktop "C′": full-width expand + single-row chip rail (detail-mode == `selectedFamilyId`)
Tapping a family card puts the box into **detail mode** (`.neurons-md.is-detail`, driven by the existing `selectedFamilyId` — **no new desktop state**). The detail region expands to **full box width** with a **DockHeader** (= the full enlarged selected card: sprite, 科名/persona, AP, axon strip, mastery/variant/count chips, the two 🆕/🔄 quiz-mode chips with live badge counts, and 📖 with its reading-active label — mirroring `FamilyCard`, reusing the same `openFamilyQuiz`/`onToggleReading` callbacks) ABOVE the maze, and the 2-col grid collapses into a single **`FamilyChipRail`** (11 light chips: sprite + 科名 + 🆕 count, selected highlighted, 醫學一/醫學二 flattened to a divider) BELOW the maze. The master grid uses `display:none` in detail mode (stays **MOUNTED** so its liveQuery chip subscriptions stay warm). The four required bindings:
1. **Detail mode == `selectedFamilyId !== null`** — the recenter bus (🔭 全覽 / 🎯 chip) already clears it, so 全覽 is the sole exit back to the 2-col grid (no 返回 button).
2. **DockHeader = full enlarged card** (not a stripped chip) — keeps practice-entry intact while the grid is collapsed.
3. **Snap all canvas-container size changes** — no CSS transitions on `.neurons-md*` / `.maze-stage`; only one-shot opacity/translateY fades on the DockHeader + chip-rail siblings (reduced-motion → none). `VIEW_DPR_CAP` kept + an **area-based clamp** added in `drawCamera`: `effDpr = min(VIEW_DPR_CAP, devicePixelRatio, sqrt(4_800_000/(vw·vh)))`. Detail-mode stage: `max-width:none; aspect-ratio:auto; height: clamp(380px,62vh,640px)`.
4. **`FamilyChipRail` is a separate component** (not a `display:contents` morph of the grid — inline `display:grid` would beat class CSS).

**Shift-timing model**: switching families (taps 2..n) = **zero layout shift** (only DockHeader content + camera change; the DockHeader element persists so its fade does not re-run). Entering detail (tap 1) + exiting (全覽) = a one-time user-initiated restructure, softened with `scrollIntoView({block:'start'})` on `.neurons-md__detail` (entry) + the one-shot fades.

**Bug fixed here**: the walker reverse-tap (`onMazeFamilyTap`) previously set selection WITHOUT emitting focus; in detail mode the resulting full-width stage resize fires the ResizeObserver → `frameContextual` would reframe to the WHOLE map (focusRef null) and discard the tapped family. Fix: walker-tap now also `emitMazeFocus(id, {manual:true})`.

### D8 — Mobile "A2": dock-under-card accordion (replaces the scroll-jump)
Tapping a card docks the single maze panel directly **under** the tapped card (accordion), camera sticky-focuses it, the card's quiz chips stay on screen. **New ephemeral state `dockFamilyId: string | null`** (React `useState`, **NOT persisted** — reload clears it, no meta key, no sync). It is **separate from `selectedFamilyId`** so mobile 🔭 全覽 clears `selectedFamilyId` (spotlight off / camera to whole map) but KEEPS the panel docked (`dockFamilyId` stays) → whole-connectome reachable without relayout.

Mechanism = **CSS visual move, DOM unchanged**: `.neurons-md__detail` keeps its JSX position; when docked it gets `is-docked` → `position:absolute; top:var(--maze-dock-top)`, and the tapped card (`is-dock-anchor`) gets `margin-bottom: calc(var(--maze-dock-h) + 0.55rem)` to open the hole. Stage width stays = box inner width (same as in-flow) so the **ResizeObserver does NOT fire** → canvas not re-baked/re-blitted (free dock/undock). React side = `useLayoutEffect` on `[dockFamilyId]` (mobile-only): measure `--maze-dock-top` (card.bottom − md.top + 8) + `--maze-dock-h` (detail height); **anchor-scroll compensation** (record card top BEFORE the dock at tap time in a ref → `window.scrollBy(0, delta)` pre-paint, zero visible jump); bounded `scrollIntoView({block:'nearest'})` only if the docked panel overflows; a `ResizeObserver` on `.neurons-md__master` re-measures on card-height change. The pre-existing `requestAnimationFrame(scrollIntoView)` in `focusFamilyOnMaze` was **removed** — this effect owns mobile scroll. Dismiss machine: tap card → dock+focus; tap other card → re-dock (new anchor); 🔭 全覽 → clear `selectedFamilyId` only (stays docked); 「▴ 收合」→ `dockFamilyId=null` + collapse to top teaser; walker reverse-tap → smooth scroll-to-card + re-dock; re-tap same card → idempotent re-focus. `touch-action:none` stays ONLY on the stage; NO `position:fixed/sticky` band, NO body scroll-lock, NO backdrop (the reverted sticky band must NOT return). One-shot `@keyframes maze-dock-in`, disabled under reduced-motion.

### D9 — Light/dark seam (both desktop dock + mobile dock)
The dark navy maze inside the cream `#f4ecd8` box is treated as a **recessed observation well**: cream → darkened-cream mat `#e7dabb` → copper-brown chrome hairline `#8c6d4a` → purple-navy glass edge → navy `#0b0a1f`. Realized as an inset-shadow well on `.neurons-md__detail` + a `1.5px solid #8c6d4a` panel border + a warm radial top-light on the panel bg (`radial-gradient(120% 90% at 50% 0%, #221c3f 0%, #0b0a1f 55%)`) + a faint purple inner stroke. When a family is selected the detail + panel edges pick up its accent via `color-mix(... var(--family-accent) ...)` (`--family-accent` set inline on `.neurons-md` from `subject.color`). Presentation-only — the in-canvas spotlight is already handled by `emphasisFamilyId`, so no canvas re-bake.

### Ephemeral state added (this revision)
- **`dockFamilyId: string | null`** — OverviewPage React `useState`, mobile dock anchor. **Device-local / ephemeral only**: no `db.meta` key, not in `SYNCED_META_KEYS`, not persisted, cleared on reload.
- **`dockAnchorRef: useRef<number|null>`** — pre-dock card top for anchor-scroll; transient, never persisted.
- (`selectedFamilyId` + `mazeExpanded` are reused; only `mazeExpanded` persists via the existing device-local `maze:homeExpanded` meta key — unchanged.)

## Risks / Trade-offs

- **Hook dilution**: collapsing the maze by default weakens the immediate "brain game" identity. Mitigated by the teaser strip + auto-expand on the first card tap (and onboarding can point at it).
- **Sticky-panel height coordination** (desktop): the right maze panel must get a sensible height (viewport-relative, sticky) while the left card column scrolls; the §1 renderer adapts via `ResizeObserver`, so sizing is mechanical but needs tuning.
- **Mobile no-remount** (D6): the chosen realization must avoid re-parenting the canvas; verify no re-bake/flicker on selection.
- **Interaction with the WIP sibling change**: both touch `MazeGrid.tsx` / `OverviewPage.tsx`; they live on the same branch sequentially (no parallel-worktree conflict). §5 is delivered here.
- Pure presentation → fixture-lint no-op; perf/visual verification is owner-iPhone (Chrome non-regression automatable).
