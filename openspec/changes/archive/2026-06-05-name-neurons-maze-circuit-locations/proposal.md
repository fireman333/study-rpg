## Why

The weave-grid maze's ~135 crossing-synapses are currently anonymous cells. Giving each crossing a **real neuroanatomical name** (tract / nucleus / circuit / named synapse) turns every collected variant into a Pikmin-Bloom-style souvenir — 「在弓狀束尋獲的神經元」 — which deepens the collection's sense of place and reinforces real neuroscience for the med-student audience. The naming pool is already researched (105 OE-grounded names, 2026-06-05).

## What Changes

- Add a curated **circuit-location name pool** to `@study-rpg/content-neurons-tw` (`circuit-locations.ts`) — ~105 real neuroanatomical structures (中文 + English), each OE/PubMed-grounded, sourced from `~/.claude/scratch/neurons-circuit-location-candidates-2026-06-05.md`.
- Add a build-time **assigner** (`apps/neurons-tw/scripts/assign-circuit-locations.mjs`) that reads the committed `grid-graph.json`, deterministically assigns each synapse a `location` from the pool (seed-stable order; routes untouched), and writes the JSON back. Adds `location` to each `synapses[]` entry only.
- Add `location?` to the `GridSynapse` type + a pure derivation helper `synapseLocationFor(familyId, slotIndex)` in `lib/maze/graph.ts` (node → its synapse cell → location; `null` for padded non-synapse nodes).
- Surface the provenance in `lib/variant-caption.ts`: a collected variant whose slot node sits at a named crossing reads 「在 <location> 尋獲」 woven into its caption. Because `variantBirthCaption` is the single caption helper used by both `VariantUnlockModal` (mint reveal) and `CollectionPage` (individual view), one edit surfaces it everywhere.

**Zero schema/sync change** — the location is purely derived from the already-synced `(familyId, slotIndex)` + the committed `grid-graph.json` (mirrors the `variant-decor` context-art precedent). No Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump, no fixture, no Worker change.

## Capabilities

### New Capabilities

- `neurons-maze-circuit-locations`: each maze crossing-synapse carries a real neuroanatomical location name (build-time, OE-grounded); a collected variant minted at a named crossing surfaces 「在 <location> 尋獲」 provenance, derived purely from `(familyId, slotIndex)` + the committed grid graph (no new stored state).

### Modified Capabilities

<!-- none — neuron-variant-gacha / neurons-brain-maze unchanged in behavior; caption is additive -->

## Impact

- **Content**: new `packages/content-neurons-tw/src/circuit-locations.ts` (name pool + export).
- **Data**: `apps/neurons-tw/src/assets/maze/grid-graph.json` gains `synapses[].location` (additive; routes/nodes byte-identical otherwise). New `apps/neurons-tw/scripts/assign-circuit-locations.mjs`.
- **Code**: `apps/neurons-tw/src/lib/maze/graph.ts` (`GridSynapse.location` + `synapseLocationFor`); `apps/neurons-tw/src/lib/variant-caption.ts` (location clause).
- **No** Dexie/R2/Worker/economy/route change. Neuroscience facts are OE-grounded per the project's neuroscience-verification rule.
- **Out of scope**: per-rarity location flavoring (lyrical names → rare variants); a dedicated map legend of named circuits; the maze renderer showing location labels on hover (could be a follow-up).
