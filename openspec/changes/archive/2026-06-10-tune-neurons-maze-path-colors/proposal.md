## Why

The maze's 11 family corridors are meant to be colour-traceable per subject (per the `neurons-brain-maze` "Each family's corridor is colour-traceable" scenario), and the content pack now ships 11 distinct per-subject colours (`decouple-neurons-subjects-from-nt-branches`). But in the renderer the gold myelin sheath is drawn ~2.6× wider than the family-colour axon core (`sheathW = 1.05·tile` vs `coreW = 0.4·tile`) and the unexplored core sits at only `alpha 0.4`, so every route visually reads as the same gold and the distinct subject colours are barely perceptible — the corridors are not actually traceable by colour.

## What Changes

- **Make the family colour the dominant visual weight of each corridor**, with the gold myelin sheath reduced to a framing accent on either side (rather than the dominant band). Concretely, widen the family-colour axon core and raise its unexplored-route alpha in the maze renderer's Layer ② so each of the 11 subject colours is legible at a glance, while keeping the gold myelin / nodes-of-Ranvier metaphor as a frame.
- No change to maze topology, routes, autotiling, economy, fog-of-war, node/shape encoding, schema, or sync — this is a pure render-weight tuning of `apps/neurons-tw/src/components/maze/MazeGrid.tsx` Layer ②.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `neurons-brain-maze`: the "Maze SHALL read as a brain (neural-fiber design language)" requirement's colour-traceable scenario gains a clause that the family colour SHALL be the corridor's **dominant visual weight** (gold myelin sheath = framing accent), so all 11 families are distinguishable by colour at a glance — locking the new weighting against future regression.

## Impact

- **Code (presentation only)**: `apps/neurons-tw/src/components/maze/MazeGrid.tsx` Layer ② constants (`coreW` width + the unexplored-baseline family-core alpha; optionally the gold sheath alpha). No other file.
- **No schema / sync / economy impact**: zero Dexie / R2 / Worker change; maze routes + grid graph untouched. `lint:dexie-fixtures` no-op.
- **Accessibility preserved**: node colour + node-shape redundancy and the corridor-route spatial channel are unchanged, so color-blind distinguishability (the "Color-blind-friendly team encoding" requirement) still holds.
