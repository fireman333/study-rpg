## Why

The reworked connectome (change `rework-neurons-connectome-expedition-driven`) makes wires *form* and *strengthen* through expedition co-repair, but reaching the `strong` tier currently yields only an invisible-ish conduction perk — there is no **keepsake** for the milestone. Collectors have no reason to chase the *hardest* connectome state, and the "wire together" narrative has no trophy. This change adds **連結神經元 (connector neurons)**: a closed set of 55 unique collectibles, one per subject pair, each unlocked the first time that pair's wire reaches `strong`. It is the collection-side payoff for deep, sustained cross-subject study — grounded in real network-neuroscience (a *connector hub neuron* that bridges two functional modules).

## What Changes

- **New collectible class "連結神經元" (connector neuron)** — a *bridge class*, distinct from the 11 subject families and from the variant gacha. Closed set = 11 families choose 2 = **55**. No gacha, no rolls, no 12th family.
- **Unlock trigger** — when a pair's synaptic wire **first reaches `strong`** (the existing `weak → strong` transition emitted as `connectome.synapseStrengthened` inside `creditConnectomeFromExpedition`), permanently unlock that pair's connector. Unlock is **monotonic**: the connector stays unlocked even if the wire later decays `strong → weak → dormant`.
- **Retroactive backfill** — on first load after upgrade, every pair whose wire is *currently* `strong` (including legacy 早期連線 synapses) immediately unlocks its connector, so existing saves see their earned connectors at once.
- **Collection-page section** — a new "連結神經元 N/55" section on the collection page: unlocked connectors shown as colored cards, locked ones as silhouettes.
- **Procedural placeholder visual** — each connector renders as a split-color frame of its two families' colors + a shared bridge/axon silhouette + synaptic glow. The 55 unique hand-drawn sprites are **deferred** to a follow-up change (`generate-connector-sprites`); the sprite registry ships ready so a dropped-in PNG upgrades a connector with zero code change.
- **Persistence + cross-device sync** — a new `connectorNeurons` Dexie table (v18) and an additive R2 sync adapter (bundle schema 19 → 20) carry the unlocked set, with union/monotonic merge so a connector can never be un-unlocked by a stale device.

## Capabilities

### New Capabilities
- `neurons-connector-family`: the connector-neuron collectible — closed 11C2=55 set, first-`strong`-wire unlock trigger, retroactive backfill on upgrade, monotonic persistence, cross-device union merge, procedural-placeholder rendering, and the collection-page section.

### Modified Capabilities
<!-- None. The unlock observes the existing connectome.synapseStrengthened event without changing its contract; the Dexie/R2 additions are additive implementation following established guard + bundle-additive requirements. -->

## Impact

- **Content** (`packages/content-neurons-tw/src/`): connector catalog helpers (derive the 55 pairKeys from `FAMILY_IDS`, lexicographic ordering, two-color lookup from `FAMILY_COLOR`). All numbers dogfood-tunable.
- **App** (`apps/neurons-tw/src/`):
  - `lib/db.ts` — Dexie **v17 → v18**, new `connectorNeurons` table + upgrade callback doing the retroactive backfill.
  - `lib/services/connectome.ts` — hook the `weak → strong` branch in `creditConnectomeFromExpedition` to unlock the pair's connector.
  - `lib/services/` — new connector service (unlock, list, derive locked/unlocked).
  - `lib/sync/r2/bundles.ts` (`SCHEMA_VERSION` **19 → 20**) + `lib/sync/tables.ts` (new `connectorNeuronsAdapter`, union/monotonic, registered in `NEURONS_ADAPTERS`).
  - `routes/CollectionPage.tsx` — new connector section.
  - `__tests__/db-v17-to-v18-migration.test.ts` — required upgrade fixture (enforced by `pnpm lint:dexie-fixtures`).
- **Theme** (`packages/theme-pixel-neurons/src/sprites.ts`): new `connector/*.png` glob keyed `connector:<familyA>|<familyB>` with a transparent/procedural fallback (no PNGs ship yet).
- **No change** to: maze topology / `graph.ts` / `MazeGrid` path rendering; the sync Worker (bundle-opaque); leaderboard / achievements / share cards / onboarding (deferred to roadmap #4 / #5).
- **Neuroscience anchor** (design.md): connector-hub / participation-coefficient / rich-club framing, OE/PubMed-verified (van den Heuvel & Sporns 2013 *J Neurosci*; Schroeter 2015; Senden 2018; Bagarinao 2020).
