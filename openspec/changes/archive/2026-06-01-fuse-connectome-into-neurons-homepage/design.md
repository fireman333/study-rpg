## Context

Two homepage iterations already shipped: `revamp-neurons-homepage-experience` (hook+dashboard) and `revise-neurons-homepage-hero-real-tree` (real labeled tree as a **presentational** `interactive={false}` hero that routes to `/connectome` on click). The owner wants the next step: **the connectome IS the homepage**, not a thumbnail. The grill (`~/.claude/scratch/grilled-connectome-as-homepage-fusion-2026-06-01.md`) locked the structural decisions and the synapse-indicator rework.

Current relevant state:
- `ConnectomeTreeSvg.tsx` (~680 lines): force-sim radial layout, rAF self-settles + stops when stable, `interactive` prop gates wheel/touch (`addEventListener`) + pointer (React props) + zoom toolbar. Renders its own `<section>`, self-loads via `loadConnectome()`, subscribes to connectome events.
- Edge rendering (`SynapseEdge.tsx` + the polished-tree spec): **dormant edges do not render at all**; weak → 1.5px amber; strong → 3px blue + glow. Decay weak→dormant **fades out and removes the edge from the DOM**.
- Synapse state machine (`state-machine.ts` + `connectome.ts`): new synapse created `dormant` ([connectome.ts:166](apps/neurons-tw/src/lib/services/connectome.ts:166)); strengthens on subsequent-day co-fire; LTD decay one step after >7 days idle, resetting `lastCoFireDate` to the decay date ([connectome.ts:66-72](apps/neurons-tw/src/lib/services/connectome.ts:66)). `SynapseState` persists to Dexie, syncs via the R2 m2 bundle, and feeds leaderboard derivation.
- `OverviewPage.tsx` (current `/`: onboarding, hero, DMN ring, status chips, CTA, FamilyPicker) and `ConnectomePage.tsx` (`/connectome`: tree + first-visit callout + family-detail grid + synapse table) are two separate routes.

## Goals / Non-Goals

**Goals:**
- Merge the **interactive** tree + family-detail grid onto `/`; remove the separate `/connectome` page.
- Resolve the interactivity-vs-page-scroll conflict via a fixed-height contained-scroll panel.
- Replace misleading text synapse-state labels with recency-driven edge visuals (new = brightest, dims toward decay) **without** changing the underlying state machine, Dexie schema, decay rule, or sync/leaderboard contract.
- Keep all other indicators (DMN ring, AP chips, status chips) and the 7-day decay mechanic exactly as-is.

**Non-Goals:**
- Changing the synapse **state machine** (dormant/weak/strong), the **N=5 co-fire rule**, or the **7-day LTD decay** logic. Only their *visual surfacing* changes.
- Any Dexie schema version bump, R2 bundle `SCHEMA_VERSION` change, or leaderboard-derivation change. (Render-layer-only.)
- Changing the DMN time-axis, AP threshold ladder, or family-mastery mechanics.
- Auto-starting the reading timer or collapsing the two quiz entry paths.

## Decisions

### D1 — Visual change is a RENDER-LAYER override, not a state-machine change

`SynapseState` (`dormant | weak | strong`) stays the **internal source of truth** for persistence, R2 sync, and leaderboard. The new visuals are derived **at render time** from `(state, lastCoFireDate, today)` — the SVG decouples *displayed intensity* from the stored state.

- **Why over changing the state machine:** the v1 R2-migration incident (pk-change broke prod for all users) is a standing reminder that touching persisted schema/state semantics is high-risk. The grill explicitly did NOT pick "重新考慮 decay 機制." A pure render-layer change needs no Dexie version bump, no `SCHEMA_VERSION` bump, no leaderboard re-derivation, and no upgrade fixture.
- **Alternative considered:** change the state machine so a new synapse starts at `strong` (to look bright/thick immediately). Rejected — it would lie about accumulated LTP, corrupt the decay ladder, and break cross-device/leaderboard meaning.

### D2 — Two visual channels: thickness = accumulated strength, brightness = recency

The grill's three "edge" answers (new=brightest, dims-toward-decay, preserve strong-vs-weak) unify into **two orthogonal channels**:

| Channel | Encodes | Source | Range |
|---|---|---|---|
| **Stroke width / weight** | Accumulated strength (real repeated LTP) | internal `SynapseState` | dormant = thin, weak = medium, strong = thick |
| **Brightness / glow (opacity + drop-shadow)** | Recency of co-firing | `daysSinceCoFire = today − lastCoFireDate` | 0 days = full bright, → 7 days = dim floor |

- A **newly-wired** synapse is `dormant` (thin) but `daysSinceCoFire = 0` → **brightest**. This fixes "新 synapse 叫休眠 / invisible" while staying honest about it being a young, not-yet-strengthened connection.
- A long-cultivated `strong` synapse that hasn't fired in 6 days is **thick but dim** — visibly "fading," reading the decay countdown without numbers.
- Co-firing resets `daysSinceCoFire → 0` → brightness snaps back to full.
- **Dormant edges now RENDER** (thin + brightness-by-recency), reversing the current "dormant = no edge." This is the core behavioral change to edge styling.
- **Why two channels over a single recency axis:** a single axis would erase the strong-vs-weak distinction (a day-old dormant and a months-old strong would look identical when both just fired). Two channels keep accumulated LTP legible while making recency the dominant "alive vs fading" cue. The owner picked "只用邊的視覺強度" (no text/numbers) — thickness + brightness are both "visual intensity," satisfying that.

### D3 — Brightness mapping (recency → opacity/glow)

`brightness = lerp(BRIGHT_MIN, BRIGHT_MAX, 1 − clamp(daysSinceCoFire / 7, 0, 1))`. At `daysSinceCoFire = 0` → `BRIGHT_MAX`; at ≥ 7 → `BRIGHT_MIN` (a legible floor, never 0 — dormant edges stay visible). Exact `BRIGHT_MIN/MAX` + glow radius tuned during apply against the EEG cyan/amber aesthetic. Tooltip on hover/focus surfaces `lastCoFireDate` + days-since for users who want the number (the only place numbers appear).

- **Birth celebration:** on `connectome.synapseFormed`, the new edge plays a one-shot pulse (path draw-in + brief glow burst + momentary thickness overshoot) over `SYNAPSE_TIMINGS.formation`, then settles to its steady (thin + brightest) state. This is the "最亮/最粗 慶祝新生" the owner picked — *thickest* is the celebration transient, *thin* is the steady dormant width.
- Reduced-motion: skip the pulse, render the steady end-state instantly (per existing `useRespectsReducedMotion` discipline).

### D4 — Fixed-height interactive panel with contained scroll

The tree mounts on `/` inside a **fixed-height container** (e.g. `min(70vh, 560px)`, tuned in apply) with `interactive={true}`. Wheel events inside the panel zoom the tree and must **not** propagate to page scroll; outside the panel the page scrolls normally.

- Mechanism: the tree's existing wheel `addEventListener` (gated by `interactive`) calls `preventDefault()` inside the panel; combine with CSS `overscroll-behavior: contain` + `touch-action` tuning on the panel wrapper so touch pinch/drag stays inside and vertical page drag outside still scrolls. Verify empirically with Chrome MCP (the rAF-throttle + RWD-probe caveats apply — assert end-state, model breakpoints via class override, don't trust `resize_window`).
- **Why a contained panel over full-viewport takeover:** the grill picked the fixed-height panel; full takeover ("hover locks page scroll") was rated higher device-experience risk. Contained scroll is the conventional, well-understood solution and keeps the dashboard reachable by normal page scroll below the panel.
- The shipped `ConnectomeHero` (presentational wrapper that navigates away) is **removed/repurposed** — the tree is no longer a link.

### D5 — Route collapse `/connectome` → `/`; `OverviewPage` + `ConnectomePage` merge

`/` renders the unified homepage = CTA toolbar + fixed-height interactive tree panel + family-detail grid (+ DMN ring + status chips + onboarding, unchanged). `/connectome` is removed from the router and **redirects to `/`** (client-side) so old bookmarks/shared links don't 404.

- `public/_redirects` adds `/connectome /  301` (or SPA-appropriate rewrite); nav entries pointing at `/connectome` repoint to `/`; the hero's `navigate('/connectome')` is deleted.
- The family-detail grid keeps its NT-branch grouping (DA / 5-HT / GABA / Glu) and `FamilyCard` AP/slot/mastery chips — it just lives on `/` now.
- The **synapse table is deleted** (not relocated). Decay/recency information it carried now reads off the edges (dimming) + hover tooltip.
- **Why remove rather than keep as a deep alias:** the grill explicitly chose "消失,整個變成 `/`" — the two-pages friction only fully dissolves with no second page.

### D6 — Empty state = dimmed 11-family skeleton + action guidance

When `snapshot.synapses.length === 0`, the tree still renders all 11 family leaf nodes + NT-branch structure in a **dimmed/grayscale skeleton** so the player sees "what it can grow into," with an action-guidance callout (answer 5 correct in two families today to wire your first synapse) replacing the "0 連線 / 尚無 synapse" framing. The existing first-visit onboarding panel (gated on `meta['homepageOnboardingDismissed']`) is retained.

### D7 — CTA toolbar above the tree panel

The reading-timer toggle (📖), 🎲 cross-family random quiz, and 📚 FamilyPicker entry move into a **toolbar above the tree panel**, visually merged with the zoom controls. Both quiz entry paths and the manual-start (non-auto) reading timer are preserved (per `neurons-homepage` R5). FamilyPicker's per-card direct-entry semantics (`neurons-mode` Overview requirements) are unchanged — only its on-page position relative to the tree changes.

## Risks / Trade-offs

- **Contained-scroll fighting page scroll on touch devices** → mitigate with `overscroll-behavior: contain` + `touch-action` tuning + explicit Chrome MCP verification of "wheel inside zooms, outside scrolls; touch pinch zooms, vertical drag outside scrolls." This was the original reason for `interactive={false}`; budget apply time for it.
- **Dormant edges now rendering could clutter the tree** (every formed-but-never-strengthened pair shows a thin dim line) → the brightness floor keeps them faint; tune `BRIGHT_MIN` so dormant-idle edges recede without disappearing. Acceptable: making them visible is the explicit fix for "new synapse invisible."
- **Losing the synapse table removes the only at-a-glance days-since list** → hover/focus tooltip preserves the number on demand; the dimming gradient gives the at-a-glance signal the owner actually wanted.
- **Route removal breaks deep links to `/connectome`** → 301/redirect to `/` covers it; verify in prod via SPA 三件套 (direct-URL `/connectome` → lands on `/`).
- **Spec scenarios referencing `/connectome` as the tree surface** → updated to `/` in the deltas; risk of missing one → grep the three specs for `/connectome` during apply.
- **Two homepages' worth of components on one route (perf / first paint)** → the tree already self-settles its rAF; family grid is lightweight; no new data fetch. Monitor first-paint in prod verify.

## Migration Plan

1. Implement on `track-neurons` worktree (render-layer + route + layout only; no Dexie/sync change → no migration fixture needed).
2. `pnpm --filter @study-rpg/neurons-tw test` (existing connectome/db tests must stay green — they assert state-machine behavior, which is unchanged).
3. Chrome MCP verify on localhost: interactive tree on `/` in fixed-height panel + contained scroll (wheel-in zooms / out scrolls; touch) + dormant edge renders + brightest-fresh-edge + recency dimming + dimmed-skeleton empty state + toolbar CTAs + `/connectome`→`/` redirect.
4. `/opsx:verify` → `/opsx:archive` → commit → `git merge track-neurons` into `main` (watch multi-agent caveat: `remove-medexam-tw-and-promote-neurons` may overlap; explicit-path `git add`).
5. `pnpm deploy:cf` from `~/coding-scratch/study-rpg` deploy worktree (needs `apps/neurons-tw/.env.local` there). Prod verify all 3 URLs + **SPA 三件套 on `/` and `/connectome`-redirect** + env-baked grep.
- **Rollback:** render-layer-only + route change → revert the commit and redeploy; no data migration to unwind (internal `SynapseState` untouched, so reverting visuals is safe for existing saves).

## Open Questions

- Exact fixed-height value + `BRIGHT_MIN/MAX` + glow radius + dormant stroke width — tuned empirically in apply against the EEG aesthetic; not blocking.
- Whether the birth-celebration thickness overshoot is worth the complexity vs. a glow-only burst — decide in apply after seeing it; the steady-state (thin + bright) is the contract, the overshoot is polish.
- Whether `_redirects` `/connectome → /` should be a hard 301 or an SPA rewrite that preserves any future deep-link params — `/connectome` carries no params today, so a simple redirect suffices; revisit only if a param-bearing deep link is added.
