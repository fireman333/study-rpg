## Context

The connector neuron capability shipped 2026-06-08 with a backfill rule that explicitly includes legacy 早期連線 wires. The `connectome-collection` capability (most recently reworked by `rework-neurons-connectome-expedition-driven` and `polish-neurons-connectome-visual`) holds the rule that legacy wires don't count toward 穩定連線數 and don't conduct energy until re-validated. Both rules are individually correct. Their interaction is what's under-specified.

A reader of either spec alone cannot answer the question「does a legacy strong wire unlock a connector?」 consistently:

- The connector spec says yes, with no commentary.
- The connectome spec implies「legacy wires confer no benefit until re-validated」 — which a reasonable reader would take to include collectibles.

The 2026-06-08 mechanics audit flagged this as P2. The right fix is **not** to change behavior (backfill including legacy is consistent with the connector's own「monotonic permanence」 rule, which is itself a lifetime / catalog-history concept that cannot regress) but to **document the lifetime vs currently-validated split as a deliberate design pattern**.

The same conceptual split is already adopted by `unify-distinct-owned-projection-across-fusion-achievements-leaderboard` in this propose batch: `copies` lifetime-mint vs `ownedSlotCount` currently-held. Here: connector unlock = lifetime ever-wired vs 穩定連線數 = currently-validated. Three specs adopting the same pattern within a single audit cycle is signal that this is the right model, not an ad-hoc fix.

## Goals / Non-Goals

**Goals:**
- Make the lifetime-ownership-vs-validated split explicit in `neurons-connector-family` so the divergence between connector count and 穩定連線數 is documented rather than discovered.
- Add a `unlockSource` provenance marker so a UI consumer can surface the distinction without redefining either stat.
- Preserve existing behavior: connectors stay permanent once unlocked, backfill stays inclusive, sync stays union-merge.
- Stay backward-compatible with already-unlocked-without-provenance rows.

**Non-Goals:**
- Changing backfill scope. The legacy-inclusion is the design intent; this change documents it, doesn't reverse it.
- Modifying `connectome-collection`. Its legacy-trace requirement is the authoritative source for「validated vs legacy」 semantics and this change defers to it.
- Forcing the UI provenance marker. The marker is MAY, not SHALL; a build that omits it is still correct.
- Backfilling `unlockSource` onto pre-change rows. Tolerate `undefined` indefinitely.
- Coupling `unlockSource` to sync semantics. Connector sync remains union-merge by `pairKey`; `unlockSource` is a per-row optional field that propagates as-is.

## Decisions

**Decision 1 — Document the lifetime-vs-validated split as a deliberate two-stat pattern, do not collapse to one stat.** *Alternative considered:* exclude legacy from backfill so connector count aligns with 穩定連線數 — rejected, would break the connector's own monotonic-permanence rule (a player who had a legacy strong wire pre-change could lose the「I ever achieved this」 collectible signal entirely, since the wire might never be re-validated). *Alternative considered:* expose only one stat and hide 穩定連線數 — rejected, 穩定連線數 conveys gameplay-active wire status that the player wants to know.

**Decision 2 — `unlockSource` is optional and tolerant of `undefined`.** Existing unlocked connectors stay valid without backfill. *Alternative considered:* migration that classifies every existing row — rejected, requires scanning wires + dates, can't reliably classify rows whose underlying wire has since decayed (the `lastCoFireDate` may have moved post-epoch via decay-then-restrengthen, masking the original unlock provenance). Better to tolerate unknown forever.

**Decision 3 — UI provenance marker is MAY-clause, scoped to「legacy-backfill + currently-legacy」 conjunction.** The marker is meaningful only when both conditions hold; for any other combination it would be either redundant (validated wires are the norm) or misleading (a re-validated legacy wire is now a stable wire — surfacing「早期」 would be wrong). *Alternative considered:* always surface for legacy-backfill provenance — rejected, would persist the「early」 chip even after re-validation, which inverts the intended「provenance tells you about the path here」 framing.

**Decision 4 — No Dexie `.version()` bump, no R2 `SCHEMA_VERSION` bump.** The field is additive, optional, and defensively-read. Older clients drop it; newer clients tolerate its absence. Forward-compat with no migration. *Alternative considered:* bump Dexie defensively — rejected, adds upgrade-fixture burden for a purely-optional field.

**Decision 5 — The provenance marker disappears when the wire is re-validated, computed at render time.** No state update fires; the UI reads `wire.lastCoFireDate` at render and decides. *Alternative considered:* freeze the marker on first render and persist — rejected, would require a follow-up write on every re-validation event, far more complexity than benefit.

## Risks / Trade-offs

- **[A future contributor reading just the connector spec still doesn't understand 穩定連線數 semantics] →** Mitigated: the backfill Requirement now cross-references `connectome-collection`'s legacy-trace rule and includes the explicit two-stat table. Anyone implementing connector code now has the pointer.
- **[Player who has both legacy unlocks and post-epoch unlocks sees a mixed marker state on the collection page] →** Acceptable. The MAY-clause means the marker is intentionally low-stakes; a hot-mixed display still reads correctly.
- **[The MAY-clause leaves room for UI inconsistency between releases] →** Acceptable. The provenance field is the contract; the UI is presentation. A consistent decision (always-show or never-show) can be made in a future polish change without spec churn.

## Migration Plan

No data migration. The `unlockSource` field is added on next unlock (forward or backfill). Existing rows stay valid without it. R2 bundles round-trip transparently. No banner. No version bump.

Rollback: pure code revert. Any rows that received `unlockSource` stays harmless (older code drops the field on read).
