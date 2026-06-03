## Why

The shipped homepage renders the real connectome tree as a **non-interactive thumbnail** that routes to a separate `/connectome` page on click. The owner's repeated intent is that **the connectome IS the homepage** — a thumbnail-into-a-second-page keeps the "two-pages friction" the design was meant to remove. Separately, the connectome's **synapse state indicators mislead**: a freshly-wired synapse is created `dormant` (and currently doesn't even render on the tree), the 7-day decay countdown is invisible, the three-state bilingual jargon is abstract, and the weak→strong arc reads like a false "mastery progress." Both problems are resolved by fusing the interactive tree + family detail onto `/` and replacing text state labels with recency-driven edge visuals.

## What Changes

- **BREAKING (route): `/connectome` is removed and becomes `/`.** The interactive tree + family-detail grid live on the homepage; `/connectome` redirects to `/` (preserve old bookmarks); nav + `_redirects` + the hero's `navigate('/connectome')` are updated.
- **Tree becomes the homepage's interactive centerpiece in a fixed-height panel** with **contained scroll** — wheel/pinch zoom inside the panel, page scrolls outside it (passes `interactive={true}`, replacing the shipped presentational `interactive={false}` hero embed).
- **Family-detail grid (per-NT-branch `FamilyCard` AP/slot/mastery chips) merges onto `/`.** The dense-detail-stays-on-`/connectome` constraint reverses.
- **Synapse list table is REMOVED.** Synapse state surfaces only on the tree edges.
- **Synapse state → edge visual intensity (no text labels / no numbers):**
  - **Dormant synapses now RENDER** (previously invisible on the tree).
  - **Newly-wired edge renders brightest** (celebrate birth — fixes "新 synapse 叫休眠"); a birth animation pulses it on formation.
  - **Edge brightness dims toward the 7-day decay** (visual countdown for the previously-opaque decay); co-fire restores brightness.
  - **Two visual channels:** edge **thickness/weight = accumulated strength** (the internal `dormant/weak/strong` state, real repeated LTP); edge **brightness/glow = recency** (birth + decay countdown).
  - Implemented as a **render-layer override** — internal `SynapseState` and the 7-day decay rule are unchanged (persistence / R2 sync / leaderboard semantics intact).
- **Empty connectome** (zero synapses) shows a **dimmed 11-family tree skeleton** + action guidance, replacing the "0 連線 / 尚無 synapse" framing.
- **Action CTAs** (reading-timer toggle, 🎲 cross-family random quiz, 📚 FamilyPicker) move into a **toolbar above the tree panel**, merged with the zoom controls; both quiz entry paths and the manual (non-auto-start) reading timer are preserved.
- **Untouched** (explicitly not flagged as misleading): `DmnDrawProgressRing`, per-family AP chips (`next @ X / k/5`), top status chips, the DMN time-axis, and the 7-day decay mechanic itself.

## Capabilities

### New Capabilities

(none — this change modifies existing capabilities)

### Modified Capabilities

- `neurons-homepage`: R1 (hero is now THE interactive tree in a fixed-height contained-scroll panel, not a presentational embed routing to `/connectome`); R3 (the dense family-detail grid now merges onto `/`, the synapse table is removed — the "no dense merge" constraint reverses); R5 (the read/quiz/FamilyPicker CTAs relocate into the tree toolbar while remaining preserved and non-collapsed).
- `connectome-collection`: the stub-connectome-view requirement (route `/connectome` → `/`; synapse table removed; family grid relocates to homepage; empty-state → dimmed skeleton); the polished-SVG-tree edge-styling requirement (dormant edges now render; two-channel thickness=strength + brightness=recency encoding; decay-countdown dimming); the SVG-tree-animation requirement (decay weak→dormant no longer removes the edge from the DOM since dormant is now visible; formation = brightest birth celebration); the toast requirement (decay visibility moves from the removed synapse-table columns to edge dimming).
- `neurons-mode`: the ConnectomePage first-time empty-state-callout requirement (the interaction surface is now the homepage `/`, and the empty state is the dimmed-skeleton + guidance rather than the prior callout copy).

## Impact

- **Routes / deploy**: `apps/neurons-tw/src/App.tsx` (or router), `public/_redirects`, nav components, `ConnectomeHero.tsx` (`navigate('/connectome')` removed). SPA 三件套 must re-verify in prod (`/` direct-URL + F5 + old `/connectome` redirect).
- **Components**: `OverviewPage.tsx` + `ConnectomePage.tsx` merge into one homepage; `ConnectomeTreeSvg.tsx` (contained-scroll fixed-height interactive mode + render-layer edge override); `SynapseEdge.tsx` (two-channel intensity + dormant rendering + recency dimming); `ConnectomeHero.tsx` (repurposed or removed); CTA toolbar; empty-state skeleton.
- **Service / data (unchanged semantics)**: `lib/services/connectome.ts`, `lib/connectome/state-machine.ts`, `lib/db.ts` `SynapseState`, `lib/sync/r2/` — internal state machine, Dexie schema, 7-day decay, and sync bundle stay as-is (render-layer-only visual change → no Dexie version bump, no sync/leaderboard contract change).
- **Specs**: 3 spec files modified (`neurons-homepage`, `connectome-collection`, `neurons-mode`); scenarios referencing `/connectome` as the tree surface update to `/`.
- **No new dependencies.** No engine/core API change. No content-pack change.
