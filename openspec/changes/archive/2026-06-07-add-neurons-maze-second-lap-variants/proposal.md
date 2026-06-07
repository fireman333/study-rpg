# Add neurons maze second-lap (二回目) + node-position location variants

## Why

Once a subject family lights all 10 of its maze nodes, the "二週目" today is a dead end: the walker just rests at center and keeps rolling least-collected pulls — the route never changes, nothing new is reached, and there is no fresh reward to chase. The maze is the homepage, so a fully-explored subject becomes a static picture. This change turns the second lap into a real exploration: the walker takes a **longer route**, reaches **node positions it never walked before**, and each new position unlocks a new **「在XX位置解鎖」location variant** of that subject's neuron — giving full-collection (endgame) players a meaningful reason to keep grinding and a visibly different maze on the second pass.

## What Changes

- **Second-lap auto-entry:** when a family's cumulative settles reach its first-route node count (currently 10), it automatically enters 二回目 — no player action, no UI gate (reuses the existing implicit `settles ≥ nodeCount` definition).
- **Second build-time route per family:** the maze graph generator pre-generates, per family, a **second longer route** that threads through extra crossing cells the first route never visited. Committed into `grid-graph.json` (runtime still does zero generation). Each family's second route has its own shape (asymmetric) → different subjects get different second-lap scenery.
- **Node-position location variants (catalog expansion):** each new second-route node position deterministically unlocks one new variant = *that subject's neuron* + *that position*. Visually it is the **same base sprite with a position-keyed hue/filter shift** (procedural, layered on the existing context-art system — **zero new sprite assets**). This grows the catalog beyond the current 110.
- **Position-bound unlock (second lap only):** first-route settles keep their existing random-within-tier gacha; second-lap settles switch to **deterministic position-bound** unlock (walk to position X → get the X variant). First-route behavior is unchanged.
- **LTP / memory-circuit location names:** second-lap positions are named with **learning / LTP / memory-circuit neuroanatomy** (hippocampal CA3/CA1, Schaffer collaterals, perforant path, dentate gyrus, mossy fibers, LTP synapse, engram, place cells, sharp-wave ripples …) to reinforce the "neurons that fire together wire together" core narrative. Names are **OpenEvidence-grounded with PMID anchors** (per project neuroscience-rigor rule).
- **Scale "as many as natural":** the number of new variants per family = the extra crossings the second route naturally reaches (with a sane upper bound), not an artificial low cap — affordable because the art cost is procedural.

**Resolved decisions (owner-confirmed at Gate 1, 2026-06-07):**
- **U1 = REPLACE.** The learning/LTP/memory-circuit pool **replaces** the existing 116 broad-anatomy pool entirely — it labels ALL crossing-synapses (including first route) so the whole maze reads as one learning circuit, consistent with the LTP/Hebbian theme. Existing collected variants' 「在XX尋獲」 captions recompute (pure-derived, no migration). Accepted trade-off: first-route synapses across all 11 subjects now carry memory-circuit names.
- **U2 = MOVE NOW.** The catalog-size ripple is handled **in this change**: `NEURON_VARIANT_TOTAL`, achievement variant-count thresholds, the leaderboard D1 `variant_count` CHECK + Worker bound, and all `/110` denominators move together — no prod-inconsistency window, no client-side clamp. The D1 CHECK is applied via dashboard / per-statement `--command` (wrangler 4.x single-statement limit).

## Capabilities

### New Capabilities
- `neurons-maze-second-lap`: the second-lap (二回目) exploration loop — auto-entry on full first-route completion, the second longer route, position-bound deterministic unlock of location variants, and the scale/upper-bound rules.

### Modified Capabilities
- `neurons-brain-maze`: a family now has a second committed route; lit-node / frontier / walker logic extends past the first-route node count instead of resting at center; 二回目 entry condition is spec'd.
- `neuron-variant-gacha`: second-lap settles use a position-bound deterministic unlock path (first-route random-within-tier path unchanged).
- `neurons-maze-circuit-locations`: a learning/LTP/memory-circuit location name set (additive per U1 recommendation) used to label second-route node positions, OE-grounded with PMID anchors.
- `neurons-variant-context-art`: location-keyed hue/filter rendering for second-lap variants, layered on the existing context-art system.
- `neurons-leaderboard`: **(U2 = move now)** the `variant_count` sanity bound + D1 CHECK rise from 110 to `NEURON_VARIANT_TOTAL` (second-lap variants count toward `variant_count`).

> **Achievements note:** `neurons-achievements` needs NO requirement change — its collection-milestone requirement is catalog-agnostic (ladder + composite capstone, no literal 110 in spec text). Only the concrete threshold numbers in `achievements.ts` rescale (code-level, tasks §9.3), so it stays under Impact, not Capabilities.

## Impact

- **Affected specs:** `neurons-maze-second-lap` (new), `neurons-brain-maze`, `neuron-variant-gacha`, `neurons-maze-circuit-locations`, `neurons-variant-context-art`, `neurons-leaderboard`.
- **Affected code:**
  - Build: `apps/neurons-tw/scripts/build-grid-maze.mjs` (second route per family + extra nodes) + `assign-circuit-locations.mjs` variant (stamp LTP-pool names onto second-route nodes), committed `assets/maze/grid-graph.json`.
  - Runtime maze: `apps/neurons-tw/src/lib/maze/{graph,economy,useMaze}.ts` (`litNodes` / `frontierNode` / `walkerCell` extend past first-route nodeCount), `components/maze/MazeGrid.tsx` (render second-route nodes/walker).
  - Gacha: `apps/neurons-tw/src/lib/services/variant-gacha.ts` (position-bound deterministic unlock for second-lap settles).
  - Content: `packages/content-neurons-tw/src/circuit-locations.ts` (or new `ltp-circuit-locations.ts` pool per U1), the variant catalog + `NEURON_VARIANT_TOTAL`.
  - Render: `VariantSprite` / `variant-decor` (location-keyed hue/filter), no new sprite asset.
  - Catalog ripple (U2 = move now): leaderboard D1 migration (`variant_count` CHECK 110 → `NEURON_VARIANT_TOTAL`) + sync Worker bound + `achievements.ts` threshold rescale + all `/110` denominators.
- **Persistence / sync:** new variants are additional rows in the existing `neuronVariants` Dexie table (no new table); second-lap progress reuses the existing per-family `maze:<familyId>:settles` meta key (already ramps past nodeCount) → **likely no Dexie `.version()` bump** (so no dexie-fixture-lint trigger). R2 bundle `SCHEMA_VERSION` bumps only if a new synced meta key is introduced; cross-version tolerance follows the established neurons bundle pattern.
- **Player impact:** existing players keep all collected variants; second-lap content accrues from the upgrade onward as each family reaches full first-route completion. Zero economy-currency change (no IAP / new currency; pulls remain gameplay-triggered).
- **Risk:** catalog-size ripple (U2) is the main cross-cut — must move all denominators/thresholds in lockstep or the leaderboard/achievement UI shows wrong totals. OE-grounding for the LTP pool must precede locking the location names (project neuroscience-rigor rule).
- **Out of scope:** new sprite personas/art (procedural hue/filter only); character-card / share-card changes; the pending `add-neurons-first-pull-path-rep` change (independent, untouched).
