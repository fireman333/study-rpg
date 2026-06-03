## Why

`/maze-beta` shows the brain-maze exploration statically — the growth cones advance, but there's no visceral sense of the player's collected neurons *going somewhere*. A lightweight, opt-in "expedition" animation gives the collected variants a moment of presence and makes the maze page feel alive, at zero gameplay cost. Owner-requested during a prototype spike; formalized here after the design was dogfood-approved.

## What Changes

- Add a **cosmetic side-scrolling expedition animation band** above the maze stage on `/maze-beta`: a 3-layer CSS parallax (far brain-sulci sky / cute pastel neural-tissue ground / fast synapse particles) with a squad of the player's rarest collected neuron variants bobbing in the foreground, simulating the team marching deeper into the brain.
- The band is **decorative only** — it does NOT alter maze game state. The growth-cone journey always runs (per `neurons-brain-maze` design D11); this band is a *viewer*, not a pausable activity.
- Add an **opt-in show/hide** affordance (the owner's "hide animation when it distracts during reading/answering" request): default hidden, toggled by a header chip and an on-band "−" minimize button, both driving one `localStorage`-persisted state; respects `prefers-reduced-motion`.
- Squad sprites reuse existing collected-variant artwork but are rendered as **clean transparent sprites** (deliberately skipping `VariantSprite`'s context-art decor/band) so the busy parallax stays readable. Empty collection → growth-cone fallback marchers.
- Ship two background image assets (codex-generated cute tissue + Gemini-generated sulci sky), 64-color-quantized PNGs.
- **Not breaking.** Purely additive; the maze and all other surfaces are untouched.

## Capabilities

### New Capabilities
- `neurons-maze-expedition`: a decorative, opt-in, persisted, motion-respecting side-scrolling expedition animation on `/maze-beta` whose foreground squad is derived from the player's collected variants, with no effect on game state.

### Modified Capabilities
<!-- none — no existing requirement's behavior changes; this is purely additive -->

## Impact

- **New**: `apps/neurons-tw/src/components/MazeExpedition.tsx`; `apps/neurons-tw/src/assets/maze/expedition-bg.png` + `expedition-sky.png`.
- **Modified**: `apps/neurons-tw/src/routes/MazeBetaPage.tsx` (import + persisted `expeditionOn` state + header toggle chip + conditional render with `onHide`).
- **No** new Dexie version/table, **no** R2 sync change, **no** maze SVG/graph change, **no** change to `VariantSprite` (dex card keeps its context-art).
- **Read dependency**: `db.neuronVariants` (live-query, read-only) and `SPRITE_MAP` from `@study-rpg/theme-pixel-neurons`.
- **Note**: most implementation is already committed on `track-neurons` under the sibling change `expand-neurons-brain-maze-all-branches` (the prototype was swept into that commit because `MazeBetaPage.tsx` imports it). This change formalizes the capability spec-after-prototype and carries the remaining refinements (hide feature, "−" glyph, clean-sprite rendering, label rename).
