> Pure presentation/layout. ONE `MazeGrid` instance — never mount a second canvas. Zero Dexie/R2/
> SYNCED_META/economy change. Perf/visual = owner-iPhone; Chrome non-regression automatable.
> Subsumes §5 (focus-on-family) of `redesign-neurons-maze-static-render`.

## 1. Page composition + state plumbing

- [x] 1.1 `OverviewPage.tsx` reordered to 儀表板 (`ConnectomeStatCard`) → 遠征隊 (`StudySquadPanel`) → 引導文字 → master-detail (`.neurons-md`). The standalone full-width `<MazeGrid>` centerpiece block is removed (maze now lives in the detail panel).
- [x] 1.2 `selectedFamilyId` + `mazeExpanded` state on OverviewPage; `mazeExpanded` defaults **collapsed**, hydrated from a **device-local meta key `maze:homeExpanded`** (NOT in `SYNCED_META_KEYS`), persisted on expand/collapse.
- [x] 1.3 Family-card tap → `focusFamilyOnMaze(id)`: set `selectedFamilyId`, expand, `emitMazeFocus(id,{manual:true})` (sticky), `scrollIntoView` the panel. Reading start/resume reuses the same helper. Per-card 🆕/🔄/📖 entries unchanged.

## 2. Master-detail layout (responsive)

- [x] 2.1 `OverviewPage` wraps `FamilyPicker` (master) + the embedded `MazeGrid` (detail) in `.neurons-md`. Desktop ≥768px: CSS grid two-column (cards `minmax(0,1fr)` left, maze `minmax(320px,460px)` **sticky** right) — Chrome-verified at 1440px (`486px 460px`, `position: sticky`). Mobile <768px: block stack (cards, then maze below).
- [x] 2.2 **D6 no-remount**: ONE `MazeGrid` in a stable DOM slot (`.neurons-md__detail`); a card tap while already expanded does NOT remount (Chrome-verified: canvasCount stays 1 across selections). Realized via CSS reflow (grid↔block), not re-parenting. (The teaser→first-expand mounts once — acceptable.)
- [x] 2.3 `styles.css`: `.neurons-md` grid/stack + sticky detail; teaser + collapse-button styling in the neurons dark theme. Selected card gets an accent ring (`aria-current`).

## 3. Collapse / teaser

- [x] 3.1 Collapsed default renders a slim `.neurons-maze-teaser` strip (🧠 神經元腦圖 + hint + ▾); tapping it OR any family card expands; an `.neurons-maze-collapse`「🧠 腦圖 ▴ 收合」button collapses. Chrome-verified: default = teaser + **0 canvas**; after expand = 1 canvas + collapse button.
- [x] 3.2 The embedded `MazeGrid` mounts on expand and sizes to its panel via the §1 `ResizeObserver` (Chrome: maze canvas present inside `.neurons-md__detail`, no second canvas).
- [x] 3.3 New-player discoverability: resolved to **first-visit + default expanded** — `mazeExpanded` defaults `true`; a returning player's explicit collapse is respected via the `maze:homeExpanded='0'` pref (absent pref → stay expanded). (Owner-chosen, Fable-5 "A" review.)

## 4. Focus integration (subsumes sibling §5)

- [x] 4.1 Card-tap expand + sticky focus wired through `emitMazeFocus`/`onMazeFocus` + `frameContextual`. **The smooth one-shot focus-FLY (sibling §5) is now DELIVERED** in `redesign-neurons-maze-static-render` §5.1: `frameContextual` hands its target to a one-shot self-stopping rAF camera tween (`flyTo`; reduced-motion / trivial delta / resize-coinciding → instant snap). C′-safe: the manual-focus framing defers one microtask past React's commit so the fly is measured at the post-resize stage size, and the ResizeObserver lets a fly that already targets the current layout finish instead of snapping over it (no double-move on detail entry/exit; intra-detail + mobile-dock switches animate).
- [x] 4.2 🔭 全覽 control already lives inside `MazeGrid` (recenter to whole connectome) — sole whole-map entry; no separate button added.

## 5. Verify + ship

- [x] 5.1 `pnpm -r typecheck` clean + `pnpm --filter @study-rpg/neurons-tw test` 563/563 green. (`/simplify` — small/clean; `selectedFamilyId` is consumed for the card highlight, no dead writes.)
- [x] 5.2 Chrome non-regression: ONE `<canvas>` (asserted), teaser→expand works, desktop two-column sticky verified at 1440px, card-tap expands+focuses+highlights with no remount, no console errors.
- [x] 5.3 Zero schema/sync: collapse pref is device-local meta `maze:homeExpanded`; no Dexie store / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` edit. (`lint:dexie-fixtures` no-op — will run at ship.)
- [x] 5.4 **Owner iPhone verify** (✓ 2026-06-11): see §6.5 (now also covers the deep-integration + reward travel). Then batched merge → main → CF Pages + prod-verify (with the rest of the maze-redesign WIP).

## 6. Deep card↔maze integration + reward travel (post-Fable-5 review, owner-chosen "A" + follow-ups)

> Scope grew (owner): beyond repositioning, the maze and the family cards are now *deeply integrated*, plus a settle-triggered neuron-travel reward animation. Still ONE canvas, zero schema/sync/economy-value change. Two Fable-5 passes implemented these; main agent re-verified (tsc + 563 + Chrome desktop).

- [x] 6.1 **Pivot to "A" (pinned-map, inside the box)**: the maze moved INSIDE the `FamilyPicker` box as a `mazeSlot` (not a sibling). Desktop ≥768 = sticky right rail (`minmax(320px,420px)`, only when expanded; collapsed → cards full width). Mobile <768 = **in-flow** panel (NOT a sticky band — a first attempt at a `position:sticky;top:0` compact band covered ~60–70% of the iOS large-viewport + `touch-action:none` trapped page scroll → owner「腦圖展開會擋住整個視窗」→ reverted to in-flow; stage height `clamp(220px,40svh,320px)`, chrome `.maze-howto/.maze-expedition-band/.maze-legend/.maze-topbar` hidden on mobile). One canvas, no remount across breakpoint (CSS reflow).
- [x] 6.2 **Per-card axon progress strip** (deep card↔maze): each family card renders `AxonProgressStrip` — DOM node-dots in the family's accent colour mirroring its lit-node tract progress on the ONE maze (lit=filled / frontier=pulsing / unlit=hollow; 2nd-lap dots). Derived from `mazeHintByFamily` (lit/total/firstRouteCount/complete) off `mazeView`; NOT a second canvas.
- [x] 6.3 **Card↔maze spotlight + reverse-select**: selecting a card sets `emphasisFamilyId` → the maze bake dims other tracts/lit-nodes (~0.22/0.3 α) so the selected family's path pops (synapse sparks/landmarks stay full = cross-subject metaphor intact); topbar 🎯 chip + non-selected walker opacity. Reverse: tapping a walker on the maze (`onFamilyTap`, ~24px hit-test, drag/pan suppressed) selects + scrolls to that family's card (`#family-card-<id>`). 🔭 全覽 / 🎯✕ clears via the recenter bus (single selection state).
- [x] 6.4 **Settle-triggered neuron-travel reward animation**: when a family's maze-energy crosses a settle (the existing economy signal observed via `view` `settles`/`walkerFraction` — no new counter, no economy-value change), the walker eases along its sampled axon polyline (`easeInOutCubic`, sprite swell, family-colour trail pings + gold arrival ring + bounce), camera frames the family (single-family) / stays whole-map (multi-family expedition). **Gated** behind the variant-reveal modal queue (`revealQueueIdle` event added to `neuron-variant-gacha`) so it plays unobstructed. One-shot self-cancelling rAF chain (no steady-state); reduced-motion → snap. Hydration/cloud rehydrate (no due-tick) does NOT travel. Also fixed: connect-chime boot-misfire (seed-skip guard, mirror §3/§4).
- [x] 6.5 **Owner iPhone verify** (✓ 2026-06-11): mobile maze in-flow (does NOT block viewport / trap scroll); per-card axon dots legible + frontier pulse; card→spotlight + scroll-to-maze; walker→reverse-select card; 🔭 全覽 clears spotlight (no 🎯 chip on mobile); settle → neuron travels (trail + arrival bounce); reduced-motion → snap.

## 7. C′ desktop full-width expand + single-row chip rail (rev. 2 — supersedes rev. 1 sticky-rail-only)

> Desktop tap → FULL-WIDTH detail mode (DockHeader + maze + chip rail; 2-col grid hidden). detail-mode == `selectedFamilyId !== null` (reuse existing state). ONE canvas, never re-parented; snap all canvas-container size changes.

- [x] 7.1 `.neurons-md.is-detail` (== `selectedFamilyId !== null`): desktop ≥768 full-width single column — `.neurons-md__master` `display:none` (stays MOUNTED so liveQuery chips stay warm), detail spans full width. Non-detail keeps the 2-col rail (`:not(.is-detail)`). Stage detail-mode sizing: `max-width:none; aspect-ratio:auto; height:clamp(380px,62vh,640px)` (SNAP — no transition).
- [x] 7.2 **DockHeader** (`FamilyPicker.tsx`) = the full enlarged selected card above the maze: sprite + 科名/persona + AP + axon strip + mastery/variant/count chips + 🆕/🔄 quiz-mode chips (live badge counts) + 📖 reading button (live label) — mirrors `FamilyCard`, reuses `onStartQuiz`/`onToggleReading`. One-shot fade-in; CSS-hidden on mobile.
- [x] 7.3 **`FamilyChipRail`** (separate component, not a `display:contents` morph) — 11 chips (sprite + 科名 + 🆕 count, selected highlighted; 醫學一/醫學二 → divider). Below the maze, only in detail mode; CSS-hidden on mobile. Tap → `onFocusFamily` (zero-layout-shift switch).
- [x] 7.4 **Shift timing**: switching families (taps 2..n) = zero layout shift (DockHeader content + camera only; element persists → no re-fade). Entry (tap 1) = `scrollIntoView({block:'start'})` on `.neurons-md__detail` + one-shot fades; reduced-motion → instant. 🔭 全覽 / 🎯 chip = sole exit (recenter bus clears `selectedFamilyId`).
- [x] 7.5 **Perf**: `VIEW_DPR_CAP` kept + area-based clamp added to `drawCamera` (`sqrt(4_800_000/(vw·vh))`); NO size transition on `.neurons-md*` / `.maze-stage`.
- [x] 7.6 **Bug fix**: walker reverse-tap (`onMazeFamilyTap`) now `emitMazeFocus(id,{manual:true})` so the detail-mode resize doesn't reframe to the whole map.

## 8. A2 mobile dock-under-card (rev. 2 — supersedes rev. 1 in-flow-only)

> Tapping a card docks the single maze under it (accordion); the card's quiz chips stay on screen. CSS visual move, DOM unchanged → no re-parent/remount. New ephemeral `dockFamilyId` (NOT persisted).

- [x] 8.1 **`dockFamilyId: string \| null`** React state on OverviewPage — device-local / ephemeral, NOT persisted, NOT a meta key, NOT synced; cleared on reload. Separate from `selectedFamilyId` so mobile 🔭 全覽 clears spotlight but keeps the panel docked.
- [x] 8.2 `@media (max-width:767px)`: `.neurons-md__detail.is-docked` → `position:absolute; top:var(--maze-dock-top)`; tapped card `.is-dock-anchor` → `margin-bottom: calc(var(--maze-dock-h) + 0.55rem)`. Stage width unchanged (= box inner width) → ResizeObserver does NOT fire → no canvas re-bake. One-shot `@keyframes maze-dock-in`, reduced-motion → none.
- [x] 8.3 `useLayoutEffect([dockFamilyId, mazeExpanded])` (mobile-only): measure `--maze-dock-top` (card.bottom − md.top + 8) + `--maze-dock-h` (detail height); **anchor-scroll compensation** (card top recorded at tap-time in `dockAnchorRef`, `window.scrollBy(0, delta)` pre-paint); bounded `scrollIntoView({block:'nearest'})` if the panel overflows; `ResizeObserver` on `.neurons-md__master` re-measures on card-height change. Removed the old `requestAnimationFrame(scrollIntoView)` in `focusFamilyOnMaze`.
- [x] 8.4 Dismiss machine: tap card → dock+focus; other card → re-dock; 🔭 全覽 → clear `selectedFamilyId` only (stays docked); 「▴ 收合」(`collapseMaze`) → `dockFamilyId=null` + collapse to teaser; walker reverse-tap → scroll-to-card + re-dock; re-tap same card → idempotent re-focus. `touch-action:none` only on the stage; NO fixed/sticky band, NO body lock, NO backdrop.

## 9. Light/dark seam (D9 — both docks)

- [x] 9.1 Observation-well seam in `styles.css`: `.neurons-md__detail` mat (`#e7dabb` + copper `#8c6d4a` border + inset shadow); `.maze-panel` recessed navy with warm radial top-light + faint purple inner stroke; family-accent on `.is-detail` via `color-mix(var(--family-accent) ...)` (set inline on `.neurons-md`). Presentation-only — no canvas re-bake.

## 10. Verify (rev. 2)

- [x] 10.1 `tsc --noEmit` clean + `pnpm --filter @study-rpg/neurons-tw test` 563/563 green.
- [x] 10.2 Per-constraint: ONE canvas in stable `.neurons-md__detail` (class-toggle + grid-template only); no steady-state rAF (area-clamp is in the existing one-shot `drawCamera`); reduced-motion-safe (all new animations gated); zero Dexie/R2/SYNCED_META/economy/schema; area-based DPR clamp applied; NO canvas-size transition.
- [x] 10.3 **Owner iPhone verify** (✓ 2026-06-11) (mobile A2 — cannot test <768 here): dock under tapped card; anchor-scroll = zero jump; 🔭 全覽 keeps dock; 「▴ 收合」resets; no viewport-block / scroll-trap; reduced-motion → snap. Desktop C′ verified by tsc + tests + read (Chrome resize here doesn't change innerWidth).
