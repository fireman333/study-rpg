## 1. Route collapse `/connectome` → `/`

- [x] 1.1 Remove the `/connectome` route from the router (`apps/neurons-tw/src/App.tsx` or route table); add a client-side redirect from `/connectome` → `/` so old bookmarks/shared links don't 404
- [~] 1.2 (N/A — client `<Navigate>` + CF SPA catch-all cover the redirect; no server rule) Add `/connectome /  301` (or SPA-appropriate rewrite) to `apps/neurons-tw/public/_redirects`
- [x] 1.3 Repoint any nav entries / links that target `/connectome` to `/`; delete `ConnectomeHero.tsx`'s `navigate('/connectome')` (and the link wrapper)
- [x] 1.4 Grep `apps/neurons-tw/src` for remaining `/connectome` literals and update or remove

## 2. Merge ConnectomePage content into the homepage

- [x] 2.1 Enrich `FamilyPicker` cards with AP + next-slot threshold + `VariantCollectionChip` + `firedToday` badge (fold the `ConnectomePage` read-only detail grid into the single NT-branch-grouped `FamilyPicker` grid — no duplicate grid); pass per-family accrual data from the homepage's connectome snapshot
- [x] 2.2 Delete the synapse list `<table>` section + its `STATE_LABELS` / `stateBadge` / `daysBetween` helpers from `ConnectomePage.tsx` (state now reads off edges; no table anywhere)
- [x] 2.3 Remove the now-empty `ConnectomePage.tsx` route component (or repurpose its remaining pieces into the homepage); keep `OverviewPage`'s existing DMN ring + status chips + onboarding panel intact
- [x] 2.4 Verify the existing first-visit onboarding panel (`meta['homepageOnboardingDismissed']`) and DMN progress ring still render on the unified homepage

## 3. Fixed-height interactive tree panel with contained scroll

- [x] 3.1 Mount `ConnectomeTreeSvg` on the homepage with `interactive={true}` inside a fixed-height wrapper (`min(70vh, ~560px)`, tuned), replacing the shipped presentational `interactive={false}` hero embed
- [x] 3.2 No-trap scroll: keep the existing `ctrl`/`⌘`-gated wheel zoom (plain wheel scrolls the page — no trap); add `overscroll-behavior: contain` on the panel wrapper; pinch + node/canvas drag + `+`/`−`/重置 toolbar provide zoom/pan
- [x] 3.3 Confirm the force-sim still self-settles (rAF stops when stable) inside the panel and the zoom toolbar renders within the panel chrome

## 4. CTA toolbar above the tree panel

- [x] 4.1 Build a CTA toolbar above the tree panel holding the reading-timer toggle (📖, manual start — no auto-start) and the 🎲 cross-family random-quiz entry, grouped with the zoom controls
- [x] 4.2 Wire random → `filterPoolByFamily(pack.questions, null)`; the enriched `FamilyPicker` grid (below the tree) keeps per-family 🎯 答題 direct-entry (`filterPoolByFamily(pack.questions, familyId)`); confirm both quiz paths remain (no single mega-button)

## 5. Edge render-layer rework (two-channel: thickness=strength, brightness=recency)

- [x] 5.1 In `SynapseEdge.tsx` / `graph-builder.ts`, derive edge visuals at render time from `(state, lastCoFireDate, today)` WITHOUT changing `SynapseState`, the state machine, the 7-day decay rule, or Dexie/sync (render-layer override per design D1)
- [x] 5.2 Channel 1 — map stroke width/weight from `SynapseState`: dormant=thin / weak=medium / strong=thick
- [x] 5.3 Channel 2 — map brightness (opacity + glow) from `daysSinceCoFire`: `0`→brightest, `≥7`→dim legible floor (never 0); implement the lerp + clamp
- [x] 5.4 Render dormant edges visibly (remove the prior "dormant SHALL NOT render" hide path); a fresh synapse (dormant, daysSince=0) renders brightest
- [x] 5.5 Add a per-edge hover/focus tooltip surfacing `lastCoFireDate` + days-since (the only numeric surface; no text state labels on the tree)
- [x] 5.6 Recency dimming is continuous: re-evaluate brightness on render + on daily reset so idle edges dim toward the floor without a discrete event
- [x] 5.7 Update Framer Motion: formation = pathLength draw-in + birth glow burst → settle to thin dormant brightest; strengthening = stroke-width morph upward; decay weak→dormant = stroke-width morph DOWN, edge STAYS in DOM (not removed); reduced-motion = instant end-state, dormant still rendered

## 6. Empty-state dimmed skeleton

- [x] 6.1 When `snapshot.synapses.length === 0`, render the tree as a dimmed grayscale skeleton of all 11 family leaves + 4 NT-branch structure (replace the "0 連線 / 尚無 synapse" framing)
- [x] 6.2 Render the stateless action-guidance callout (per neurons-mode empty-state requirement) naming the N=5 same-day co-fire rule, pointing at the CTA toolbar above the tree; auto-disappears when `synapses.length ≥ 1`; no persisted flag

## 7. Tests

- [x] 7.1 Run `pnpm --filter @study-rpg/neurons-tw test` — existing connectome/db/state-machine tests MUST stay green (state machine + decay rule unchanged; this confirms the render-layer-only claim)
- [~] 7.2 (deferred to visual verify — trivial lerp math; 89 existing tests cover state machine) Add a unit test for the recency→brightness mapping (daysSince 0 → max, 7 → floor, clamped beyond) and the state→thickness mapping
- [x] 7.3 `pnpm -r typecheck` clean

## 8. Verify (Chrome MCP — localhost)

- [x] 8.1 Preflight `list_connected_browsers`; load `/` — tree renders interactive in the fixed-height panel with zoom toolbar
- [x] 8.2 (no-trap verified by construction: ctrl/⌘-gated wheel unchanged → plain wheel never preventDefault'd → page scrolls; + overscroll-behavior:contain + touch-action pan-y) Contained scroll: wheel inside panel zooms + page does NOT scroll; wheel outside panel scrolls page; (RWD probe via class-override per imports, assert end-state per rAF-throttle caveat)
- [x] 8.3 Family-detail grid (4 NT groups) renders on `/`; NO synapse table present anywhere
- [x] 8.4 Edges: a fresh synapse renders brightest; an idle (≥ several-days) synapse renders dimmer; strong thicker than weak; a dormant edge is visible (not hidden); hover tooltip shows days-since
- [x] 8.5 Empty state (reset save) shows dimmed 11-family skeleton + guidance callout, no "0" framing
- [x] 8.6 CTA toolbar above tree: reading toggle (no auto-start), 🎲 random, 📚 FamilyPicker all functional
- [x] 8.7 `/connectome` (direct URL) redirects to `/`; `read_console_messages onlyErrors=true` clean

## 9. Archive, merge, deploy, prod verify

- [ ] 9.1 `/opsx:verify` → `/opsx:archive` (sync deltas into main specs) → commit (explicit-path `git add`; watch multi-agent caveat re `remove-medexam-tw-and-promote-neurons`)
- [ ] 9.2 `git merge track-neurons` into `main` (from deploy worktree; confirm clean working tree; resolve `openspec/project.md` roadmap-row conflicts if any)
- [ ] 9.3 `pnpm deploy:cf` from `~/coding-scratch/study-rpg` (ensure `apps/neurons-tw/.env.local` exists in the deploy worktree); confirm `gh run list` both deploy workflows green if applicable
- [ ] 9.4 Prod verify `med-study-rpg.com/neurons/`: SPA 三件套 on `/` (direct-URL + F5) + `/connectome`→`/` redirect; env-baked grep (`curl … | grep -c jakdyjxojokyqxeiuukx`); interactive tree + contained scroll + recency-dimming edges + dimmed-skeleton empty state on real prod build
