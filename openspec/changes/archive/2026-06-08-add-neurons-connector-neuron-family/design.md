## Context

`apps/neurons-tw` reskins the 一階國考 question bank as an LTP/Hebbian "connectome" collection game. The connectome (gameplay wires between subject families) was just reworked (`rework-neurons-connectome-expedition-driven`): wires `form` (`dormant → weak`) and `strengthen` (`weak → strong`) through **expedition co-repair**, evaluated at expedition settlement in `creditConnectomeFromExpedition` (`apps/neurons-tw/src/lib/services/connectome.ts`), which emits a `connectome.synapseStrengthened` event on any tier change. Wires can also decay one tier per 7 idle days (never removed) and carry a "突觸傳導" conduction perk.

Reaching `strong` is the hardest connectome milestone but currently yields no keepsake. This change adds **連結神經元 (connector neurons)** — a closed 55-member collectible set (one per family pair) unlocked on first `strong` wire — as the collection-side payoff.

Current code state (from this session's integration map):
- Dexie highest version = **v17** (`apps/neurons-tw/src/lib/db.ts`); the v16→v17 fixture (`__tests__/db-v16-to-v17-migration.test.ts`) is the canonical upgrade-test pattern; `pnpm lint:dexie-fixtures` fails any `.version(N)` bump lacking a `v(N-1)→v(N)` fixture.
- Synapse state machine: `dormant → weak → strong` (`lib/connectome/state-machine.ts` `nextStateOnStrengthen`); strength is **state-based, not a numeric counter**.
- R2 sync bundle `SCHEMA_VERSION = 19` (`lib/sync/r2/bundles.ts`); adapters registered in `NEURONS_ADAPTERS` (`lib/sync/tables.ts`); union/monotonic merge precedent = `neuronInstancesAdapter`.
- Collection page (`routes/CollectionPage.tsx`) = per-family sections; a flat connector section slots in after them.
- Families: 11 ids in `FAMILY_IDS` + `FAMILY_COLOR` map (`packages/content-neurons-tw/src/families.ts`).

## Goals / Non-Goals

**Goals:**
- A closed, deterministic 55-connector set keyed by canonical `pairKey`.
- Permanent unlock on a pair's first `weak → strong` transition, hooking the existing event with no new player action.
- Retroactive backfill so existing saves (incl. legacy strong wires) show earned connectors immediately.
- Monotonic persistence + additive, union-merge cross-device sync (a connector can never be un-unlocked).
- A shippable procedural-placeholder visual now; per-pair art deferred without code change.
- A collection-page「連結神經元 N/55」section.

**Non-Goals:**
- The 55 unique hand-drawn sprites (→ follow-up `generate-connector-sprites`).
- Leaderboard / achievement integration of connector count (deferred).
- Share-card surfacing of connector unlocks (roadmap #4 `enhance-neurons-share-cards`).
- Onboarding that teaches connectors (roadmap #5).
- Any change to maze topology / `graph.ts` / `MazeGrid` path rendering, or to the sync Worker (bundle-opaque).
- Changing the conduction perk, decay, or streak mechanics.

## Decisions

### D1 — Unlock hook = the existing `weak → strong` transition (not per-answer, not polling)
Unlock fires inside `creditConnectomeFromExpedition` at the branch where `nextStateOnStrengthen` produces `toState === 'strong'` from `fromState === 'weak'` (the same branch that pushes `connectome.synapseStrengthened`). The connector service is called there (post-transaction, best-effort try/catch so a connector failure never breaks the expedition settlement), mirroring how other neurons trigger hooks wrap game actions.
- **Alternatives:** (a) a UI-side listener on the `synapseStrengthened` event — rejected: backfill still needs a direct path, and a second listener risks double-firing; (b) per-answer check — rejected: strength is only resolved at settlement.

### D2 — Dedicated `connectorNeurons` Dexie table (not a flag on `synapses`, not pure-derived)
New table, PK `pairKey`, shape `{ pairKey, familyA, familyB, unlockedAt, updatedAt }`.
- **vs `everStrong` boolean on the `synapses` row:** rejected — mixes ephemeral gameplay-wire state with a permanent collectible; a connector must survive even conceptual changes to wire storage, and the collection view + sync want a clean collectible table.
- **vs pure-derived (no storage):** impossible — "ever reached strong" is not recoverable from a wire that has since decayed (`synapses` keeps only current `state` + `lastCoFireDate`). Permanence requires its own record.

### D3 — Retroactive backfill in the v18 upgrade callback, including legacy strong wires
The `.version(18)` upgrade callback scans `synapses`, and for every row with `state === 'strong'` writes a `connectorNeurons` row if absent. Legacy「早期連線」strong wires count — the connector is a permanent collectible decoupled from the「穩定連線數」narrative stat (which may still exclude legacy wires elsewhere). Backfill `unlockedAt` uses a deterministic value (the wire's `lastCoFireDate` if present, else a fixed epoch constant) so it is reproducible and cross-device-stable; idempotent (skip if present).
- **Owner decision (this session):** backfill chosen over "only new transitions count" so the owner's existing dogfood save surfaces its connectors at launch and the section is immediately verifiable.

### D4 — Monotonic permanence + union sync merge
`connectorNeuronsAdapter` (registered in `NEURONS_ADAPTERS`): snapshot = all rows; apply = UNION by `pairKey`, keep the **earlier** `unlockedAt` on conflict, never delete. Mirrors `neuronInstancesAdapter`'s monotonic merge. Bundle `SCHEMA_VERSION` 19 → 20, additive + reader-tolerant (v19 clients drop the unknown key; v20 reading a v19 payload preserves local unlocks). No Worker change.

### D5 — Procedural placeholder now, per-pair sprites deferred (registry ready)
The connector card is rendered **procedurally** in React: a split-color frame from the two families' `FAMILY_COLOR` + an inline SVG/CSS bridge-axon glyph + a synaptic glow — **zero image asset**, so #2 ships visually complete. The theme sprite registry adds a `connector/*.png` glob keyed `connector:<pairKey>`; the resolver returns the procedural placeholder when no PNG is registered (missing asset is never a broken image). Dropping in PNGs later (follow-up `generate-connector-sprites`) upgrades visuals with no app code change.
- **Owner decision (this session):** 55 unique PNGs wanted eventually, but split into a follow-up — mirrors the DMN-card / achievement-atlas placeholder→generate pattern.

### D6 — Canonical `pairKey` = sorted family ids joined with `|`
`pairKey(a, b) = [a, b].sort().join('|')` using JS default string comparison (stable, deterministic across devices). Derived helpers (`allPairKeys()`, `familiesOf(pairKey)`, `colorsOf(pairKey)`) live in `packages/content-neurons-tw`. Sprite key = `connector:${pairKey}`. The follow-up sprite change owns the PNG filename ↔ key encoding.

### D7 — Neuroscience framing = connector hub / participation coefficient / rich-club (OE/PubMed-verified)
A connector neuron is framed as a **connector hub** — a node with high participation coefficient bridging two functional modules — emerging as two modules become densely co-wired (rich-club, "rich-get-richer"). This deliberately avoids the over-broad "interneurons connect everything" framing. Player-facing copy and the design rationale draw on:

| Claim used in framing | Anchor |
|---|---|
| Connector hubs (high participation coefficient) bridge functional modules; provincial nodes stay local; rich-club is the integration substrate | van den Heuvel MP, Sporns O. *J Neurosci.* 2013;33(36):14489-14500. doi:10.1523/JNEUROSCI.2128-13.2013 |
| Connectors / rich-club emerge as modules densely co-wire ("rich-get-richer") during development | Schroeter MS et al. *J Neurosci.* 2015;35(14):5459-5470. doi:10.1523/JNEUROSCI.4259-14.2015 |
| The rich club gates cross-network communication | Senden M et al. *Hum Brain Mapp.* 2018;39(3):1246-1262. doi:10.1002/hbm.23913 |
| Connector-hub identification via participation coefficient | Bagarinao E et al. *NeuroImage.* 2020;222:117241. doi:10.1016/j.neuroimage.2020.117241 |

Game mapping: 11 subjects = modules; a pair's wire reaching `strong` = the two modules forming a rich-club bond → a connector hub neuron emerges bridging them.

### D8 — New self-contained capability `neurons-connector-family`
Unlock + storage + sync + collection section live in one new capability. No existing capability's requirements change: the unlock only *observes* `synapseStrengthened`; Dexie/R2 additions follow existing guard + bundle-additive requirements.

## Risks / Trade-offs

- **[Backfill timestamp drift across devices]** Two devices computing different `unlockedAt` for the same backfilled connector → union keeps the earlier one, so they converge; the value is cosmetic (collection ordering). → Mitigation: derive from `lastCoFireDate`/fixed epoch (deterministic), and union-min on merge.
- **[Dexie v18 upgrade is the risky surface]** A pk-change-class mistake bricked prod once (`dexie_pk_change_pitfall`). This change only ADDS a table (no pk change to existing tables) → low risk, but the **v17→v18 fixture is mandatory** (seed v17, reopen v18, assert backfill + `verno===18` + no DatabaseClosedError).
- **[Unlock inside settlement could throw]** → Mitigation: call connector unlock post-transaction in try/catch (channel `[connector]`); never blocks expedition settlement.
- **[Sprite key vs filename mismatch with follow-up]** `pairKey` uses `|`; PNG filenames may need a different separator. → Mitigation: #2 ships no PNGs and renders procedurally; the follow-up change owns and tests the filename↔key mapping.
- **[55 silhouettes could clutter the collection page]** → Mitigation: a single collapsible/flat section with `N/55` progress; locked = compact silhouette.

## Migration Plan

1. Land content helpers + connector service + Dexie v18 (table + backfill callback) + v17→v18 fixture.
2. Wire the unlock hook in `creditConnectomeFromExpedition`; add R2 adapter + `SCHEMA_VERSION` 19→20; add the collection section + procedural card + sprite-registry glob.
3. Verify: `pnpm --filter @study-rpg/neurons-tw test` (incl. fixture + merge tests), `pnpm -r typecheck`, `pnpm lint:dexie-fixtures`, Chrome MCP smoke (backfill shows connectors; a new `weak→strong` unlocks one; F5 persists; console clean).
4. Archive → merge `track-neurons` → `main` → push → CF Pages deploy → prod smoke at `med-study-rpg.com/neurons/`.

**Rollback:** purely additive (new table + additive bundle key + new UI section). Revert the change commits; v19 clients already tolerate v20 payloads, and the orphaned `connectorNeurons` table on a reverted client is inert. No Worker / D1 / Supabase action needed.

## Open Questions

- None blocking. Follow-ups (own changes): `generate-connector-sprites` (55 PNGs), connector surfacing on share cards (#4) and onboarding (#5), and any later leaderboard/achievement tie-in.
