## Why

A first-time user opening `/connectome` after signing into `https://med-study-rpg.com/neurons/` sees a fully-built connectome SVG with 11 family nodes but **zero synapses** — and zero affordance pointing to where the interaction lives. The current empty-state cues are weak:

- A 1-line italic mechanics description ("11 個 neuron family 分布於 4 條 NT 分支 · 同一天兩個 family 各答對 5 題即 wire 出 synapse") buried under the page header
- No visual cue that synapses **can** form here
- No CTA pointing to the debug panel below the SVG (which is currently the only way to record correct answers — neurons-tw has no real quiz UI yet; the debug panel is the dogfood interaction surface)

Without polish, first-time users see "a static tree" and bounce. This is the **last user-facing copy gap** between the current state and a Threads-ship-ready intro post.

This change is the smallest of the three "polish-neurons-pre-ship" pieces documented in the project roadmap. The other two (reading-timer wire-up, study-category achievement triggers) are larger and coupled — they will ship as a separate change.

## What Changes

- Add a prominent first-time-only callout banner inside `ConnectomePage` that surfaces when `snapshot.synapses.length === 0`:
  - Brief mechanic explanation (1-2 sentences, friendly tone)
  - Visual arrow / pointer drawing the eye toward the `ConnectomeDebugPanel` below the SVG
  - Localized CTA copy explaining "select a family → click `+1 答對` → first synapse forms after 5 correct on each of 2 families on the same day"
- Banner SHALL auto-hide once `snapshot.synapses.length >= 1` (first synapse formed) — no manual dismissal button needed; the user's first action removes the banner naturally
- Keep the existing 1-line italic mechanic description in the header (mechanic reference; valuable even after empty-state ends)
- No new persistent state (banner visibility derived entirely from current `synapses.length`; no localStorage / Dexie flag needed)
- No spec delta required at the `connectome-collection` capability level (banner is presentation-layer cue, not a normative behavior change). Add identity-locking requirement to `neurons-mode` umbrella capability instead, mirroring the precedent set by `generate-neurons-sprites` for visual-identity locks.

**不做**：

- 不 ship a real quiz UI (separate larger work; debug panel remains the interaction surface for now)
- 不 add reading-timer service (separate change, `wire-neurons-reading-timer`)
- 不 add study-category achievement trigger wire-up (depends on reading-timer)
- 不 add a dedicated empty-state route or modal — banner is inline within `/connectome`
- 不 persist a "user dismissed the welcome" flag (banner visibility is purely derived from synapse count)
- 不 add multi-step tutorial or interactive walkthrough — copy + arrow only

## Capabilities

### New Capabilities

- 無

### Modified Capabilities

- `neurons-mode`: add one identity-locking requirement (`### Requirement: ConnectomePage SHALL surface a first-time empty-state callout pointing users to the interaction surface`) that formalizes the empty-state UX contract — when the user has zero synapses, the page MUST provide a prominent CTA explaining the mechanic and pointing to where they can record their first correct answer. Mirrors the precedent set by `generate-neurons-sprites` which added an identity-locking requirement to `neurons-mode` for sprite real-artwork coverage. Protects against future regressions to the silent-empty-state.

## Impact

- **Code**:
  - `apps/neurons-tw/src/routes/ConnectomePage.tsx` (modified: ~30-50 lines added for the conditional callout block + styles)
  - Possibly extract callout component to `apps/neurons-tw/src/components/ConnectomeEmptyStateCallout.tsx` if the inline JSX exceeds ~30 lines (decision deferred to apply phase)
- **APIs**: none
- **Dependencies**: no new npm packages
- **Data**: no Dexie / R2 / event schema changes; no localStorage usage
- **Backwards compat**: zero — banner appears for existing-zero-synapse users automatically (welcome them retroactively); disappears the moment they form their first synapse. No state migration.
- **Sync**: untouched
- **Spec touched**: one ADDED requirement to `neurons-mode`
- **Bundle delta**: ~1 KB additional JS for the inline JSX + styles (negligible)
- **Deploy path**: standard `pnpm deploy:cf` + GH Actions auto-deploy on push to `main`
