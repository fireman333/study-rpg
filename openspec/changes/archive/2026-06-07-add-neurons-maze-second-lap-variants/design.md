## Context

The neurons maze (`apps/neurons-tw/src/lib/maze/`) gives each of 11 subject families one **build-time committed** winding route in `grid-graph.json`, with 10 variant-slot nodes per family (110 total). Runtime does zero generation — it only consumes the JSON (`graph.ts`). Energy accrues per family; each cumulative settle index `N` consumes `nodeCost(N)` and triggers one `pullVariant`. **Lit nodes are frontier-derived** (cumulative settle count), and the variant pulled is a **random within-tier** gacha (least-collected in 二週目), so variant identity is decoupled from node position. After all 10 nodes light (`settles ≥ nodeCount`), `frontierNode` returns `null`, `walkerCell` returns center, and settles keep ramping cost while pulling least-collected — the "二週目" exists but is visually inert.

Crossing-synapses already carry a `location` (中文) from a 116-entry **OE-grounded** broad-neuroanatomy pool (`circuit-locations.ts`, assigned build-time by `assign-circuit-locations.mjs` via cell round-robin), surfaced as the「在XX尋獲」provenance caption. Context-art (`variant-decor.ts` / `VariantSprite.tsx`) already layers derived decor/band tints behind a variant's base sprite — the seam this change reuses for procedural hue/filter.

This change is independent of the pending `add-neurons-first-pull-path-rep` (do not touch that untracked folder).

## Goals / Non-Goals

**Goals:**
- Make 二回目 a real exploration: a second, longer committed route per family that reaches node positions the first route never walked.
- Each new second-route position deterministically unlocks one new location variant = subject neuron + position, rendered as the same base sprite with a position-keyed hue/filter (zero new sprite assets).
- Name second-route positions with learning/LTP/memory-circuit neuroanatomy, OE-grounded with PMID anchors.
- Keep first-route behavior (random within-tier gacha, lit-node frontier order) byte-for-byte unchanged.
- Minimal persistence footprint: reuse `neuronVariants` table + `maze:<familyId>:settles` meta — aim for no Dexie `.version()` bump.

**Non-Goals:**
- New sprite personas / hand-drawn art (procedural hue/filter only).
- Character-card / share-card changes.
- Changing the energy faucet / cost ramp formula (`nodeCost` already ramps uncapped past nodeCount).
- IAP / new currency / any non-gameplay roll path.

## Decisions

### D1 — Second route is build-time committed, not runtime-generated
Extend `build-grid-maze.mjs` to emit, per family, a **second route segment** (`path2` + `nodeCells2`, or a `routes[]` array) that continues past the first route's last node through additional weave crossings. Runtime keeps its "zero generation" contract — `graph.ts` just parses the new fields. *Alternatives:* runtime branch-extension (rejected — violates the committed-graph invariant, non-deterministic across devices); reuse the same route for a second lap (rejected — reaches no new positions, so no new variants).

### D2 — Runtime lit/frontier/walker extend over a concatenated route
Model each family as an ordered node list = first-route nodes (slots 0..9) **followed by** second-route nodes (slots 10..10+K-1). `litNodes(settles)` lights the first `min(settles, total)` in this combined order; `frontierNode(settles)` returns the second-route node for `10 ≤ settles < total`; `walkerCell` tweens along the second-route polyline instead of resting at center. First-route indices 0..9 are untouched, so existing saves render identically until they cross settle 10. *Alternative:* a separate parallel "lap-2 settles" counter (rejected — `settles` already ramps monotonically past 10; a second counter duplicates state and complicates sync).

### D3 — Second-lap unlock is position-bound deterministic; first route stays random
`reconcileSettles` branches on settle index: `< firstRouteCount` → existing `pullVariant` (random within-tier); `≥ firstRouteCount` → unlock the **specific** location variant tied to `frontierNode`'s slot. This is the model shift that ties identity to position, scoped to the second lap only. *Alternative:* make the whole maze position-bound (rejected — would rewrite the shipped first-route gacha semantics and the rarity pyramid).

### D4 — Location variants are procedural, keyed by (family, location)
A location variant's identity = `(familyId, secondRouteSlotIndex)` → a deterministic hue/filter derived from the LTP location name, applied over the family's base sprite via the existing `VariantSprite` / `variant-decor` layer. They are real collectible rows in `neuronVariants` (so they count toward collection / leaderboard), but carry no bespoke art. *Alternative:* batch-generate a sprite per variant (rejected — owner chose procedural; K×11 sprite gen is the expensive path and is why "as many as natural" is affordable).

### D5 — LTP location pool REPLACES the broad pool (Gate-1 U1 = replace, owner-confirmed)
Replace the 116-entry broad pool with a learning/LTP/memory-circuit pool (`circuit-locations.ts` rewritten, or `circuit-locations.ts` repointed to a new `ltp-circuit-locations.ts`) that labels **all** crossing-synapses — first route included — so the whole maze reads as one learning circuit, on-theme for the LTP/Hebbian product. Re-run `assign-circuit-locations.mjs` over the committed graph (first + second route). Consequence: existing collected variants' 「在XX尋獲」 captions recompute (pure-derived, no migration). An OE-grounding task (`/oe` for hippocampal LTP / memory-system circuitry) precedes locking names, mirroring the 2026-06-05 grounding cadence; the pool must be comprehensive enough to name all crossing-synapses (round-robin tolerates repeats, as the prior 116-over-135 already did). *Trade-off accepted:* a 微生物學 / 解剖學 family's first-route synapse may now carry a memory-circuit name — defensible because the entire mode is LTP-themed. *Alternative (additive, second-route-only):* rejected by owner — they want one unified learning theme.

### D6 — Catalog ripple moves in this change (Gate-1 U2 = move now, owner-confirmed)
The expanded total is computed from the catalog (`NEURON_VARIANT_TOTAL` stays the one export everyone reads), so `/110` denominators auto-track. The cross-cuts that do NOT auto-track are moved in lockstep within this change: (a) the leaderboard D1 `variant_count` CHECK + Worker sanity bound 110 → `NEURON_VARIANT_TOTAL`, applied via dashboard / per-statement `--command` and recorded in `d1_migrations` (wrangler 4.x single-statement limit — [[wrangler4-d1-multistatement-migration]]); the Worker bound redeploys **before** any client can send `variant_count > 110`; (b) the `achievements.ts` collection-milestone threshold numbers rescale to the new total (the `neurons-achievements` spec requirement is catalog-agnostic, so no spec delta — code-only). A test asserts denominators derive from `NEURON_VARIANT_TOTAL`, not literals. *Alternative (follow-up change):* rejected by owner — leaving the D1 CHECK at 110 would silently drop second-lap players' leaderboard pushes until the follow-up lands.

### D7 — Persistence reuses existing table + meta key
New variants = rows in `neuronVariants` (existing shape). Second-lap progress = existing `maze:<familyId>:settles` (already monotonic past nodeCount). Target: **no Dexie bump** (no dexie-fixture-lint trigger). R2 `SCHEMA_VERSION` bumps only if a new synced meta key is added — current design adds none, so no bump expected; confirm during apply.

## Risks / Trade-offs

- [Catalog ripple drifts (U2)] → Move `NEURON_VARIANT_TOTAL` consumers, D1 CHECK, Worker bound, achievement thresholds in lockstep; add a test asserting denominators derive from the single export, not literals.
- [Second route makes the maze visually crowded / overlaps first route] → Generator constrains the second route to unused crossings + a sane per-family upper bound; visual QA via Chrome MCP (maze is the homepage).
- [LTP location names ungrounded] → Hard-gate name-locking behind an `/oe` PMID-anchored pass (project rule); no name ships without an anchor.
- [Existing fully-explored saves suddenly gain a huge backlog of affordable second-lap pulls] → Pulls are still cost-gated by the `nodeCost` ramp; the second lap costs more per node, so backlog drains at the existing pace, not instantly.
- [Hue/filter variants look like dupes of the base sprite] → Location-keyed hue spread + the context-art band; if indistinguishable, fall back to a stronger filter or a small location glyph (decided in apply via visual QA).

## Migration Plan

1. Ship build-pipeline + runtime + content additively; existing saves unaffected until a family crosses settle 10.
2. If U2 = move-now: apply the D1 CHECK migration (dashboard/`--command`, record in `d1_migrations`) + redeploy Worker **before** clients send variant_count > 110; else defer to follow-up and clamp client-side.
3. Rollback: revert the runtime branch (litNodes/frontier/walker fall back to first-route cap) + drop second-route fields from the committed graph; new variant rows become inert (unreferenced) — no destructive migration.

## Open Questions

- **Scale cap:** the concrete per-family second-route node upper bound ("as many as natural" → a number) — set during generator implementation against visual density.
- **Graph shape:** `routes[]` array vs `path2`/`nodeCells2` fields in `grid-graph.json` — finalize when extending `build-grid-maze.mjs`.
- **LTP pool size:** how many distinct learning/memory-circuit structures OE can ground (must cover all crossing-synapses + second-route positions; round-robin repeats are acceptable as before) — set during the §2 OE pass.

> Gate-1 decisions U1 (= replace) and U2 (= move now) were resolved by the owner 2026-06-07 — see Decisions D5 / D6.
