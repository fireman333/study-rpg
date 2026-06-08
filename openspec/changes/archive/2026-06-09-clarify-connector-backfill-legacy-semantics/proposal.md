## Why

`neurons-connector-family` and `connectome-collection` describe overlapping but inconsistent treatment of legacy 早期連線 (same-day-co-fire) strong wires:

- `neurons-connector-family` Req「Retroactive backfill on upgrade」 explicitly **includes** legacy 早期連線 wires in the unlock backfill: every currently-`strong` wire unlocks a connector at install time, no validation distinction.
- `connectome-collection` Req「Legacy same-day-co-fire synapses」 explicitly **excludes** legacy wires from the 穩定連線數 narrative stat and from energy conduction, until a new expedition co-repair re-validates them.

So a player on day-1 after upgrade can have「5 connectors unlocked」 and「0 stable wires」 simultaneously. The two narrative surfaces — connector dex (lifetime-ish) and 穩定連線數 (currently-validated) — track different things by design, but neither spec acknowledges the other or explains why they diverge. A reader of either spec alone walks away with the wrong mental model:

- A reader of the connector spec assumes connector ownership tracks the same thing 穩定連線數 does, and is then surprised by the divergence.
- A reader of the connectome spec assumes legacy wires confer no benefit at all and is then surprised that they DO unlock a permanent collectible.

The fix is not to change behavior (the current backfill rule is consistent with the connector's own「monotonic permanence」 — once unlocked, never re-locked, mirrors the lifetime concept already established) but to **make the lifetime-vs-validated split explicit in spec**, document why the two stats diverge, and surface a provenance signal so a UI consumer can render the distinction without redefining either stat.

This is the same conceptual split this track adopted in `unify-distinct-owned-projection-across-fusion-achievements-leaderboard`: `copies` = lifetime mint, `ownedSlotCount` = currently held. Here: connector unlock = lifetime ever-wired, 穩定連線數 = currently-validated wired. Same family of pattern, same fix shape.

## What Changes

- **MODIFY `neurons-connector-family`**:
  - The「Retroactive backfill on upgrade」 Requirement is rewritten to explicitly acknowledge the legacy-inclusion design choice and to cross-reference `connectome-collection`'s legacy-trace requirement. New scenarios assert that connector count and 穩定連線數 are intentionally distinct stats and that legacy backfill stamps a `unlockSource: 'legacy-backfill'` provenance marker on the unlocked connector row.
  - The「Unlock on first strong wire」 Requirement is tightened: legacy strong wires (`lastCoFireDate` precedes the conduction-rework ship epoch) unlock connectors immediately on backfill with `unlockSource: 'legacy-backfill'`; validated strong wires (post-epoch) unlock with `unlockSource: 'validated'`. The distinction is provenance-only — the connector row itself is identical otherwise and ownership is permanent for both.
  - The「Collection-page connector section」 Requirement gains a clause: when rendering an unlocked connector whose underlying wire is currently a historical / legacy trace per `connectome-collection`, the UI MAY surface an unobtrusive provenance marker (e.g.「早期連線·已收藏」 chip) without gating ownership.
- **No** delta to `connectome-collection`. Its legacy-trace requirement is correct as written and is the authoritative source of「validated vs legacy」 semantics. This change defers to it.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-connector-family`: backfill / unlock / collection-page requirements gain explicit「lifetime ownership ≠ currently-validated」 framing, a `unlockSource` provenance marker, and a UI MAY-clause for surfacing legacy status without gating ownership.

## Impact

- **Specs**: 1 modified (`neurons-connector-family`). No new capability. `connectome-collection` untouched.
- **Code**: minimal. The backfill helper at `apps/neurons-tw/src/lib/services/connector-neuron.ts` (or wherever the connector data layer lives) gains an `unlockSource` field on insert: `'legacy-backfill'` for wires with pre-epoch `lastCoFireDate`, `'validated'` for everything else. The collection-page render gains an optional chip when both `unlockSource === 'legacy-backfill'` AND the underlying wire is still in the legacy trace state per `connectome-collection`.
- **Persistence**: ⚠️ adds one nullable field `unlockSource?: 'legacy-backfill' | 'validated'` to the connector row shape. Per Dexie practice this can be additive without a `.version()` bump if the field is defensively-read with a sensible default (treat `undefined` as「unknown provenance」). Apply phase confirms; if a fixture-lint requires a bump, scope-cut and document in tasks. R2 bundle `SCHEMA_VERSION` unchanged either way (the field is forward-compatible: older clients drop it on read, newer clients tolerate its absence).
- **Player-visible**: zero behavior change for already-unlocked connectors (their `unlockSource` stays `undefined` and the UI treats them as unknown / shows no extra chip). New backfill runs (first-load-after-this-change for a save that hasn't backfilled yet — rare since the connector feature has already shipped) stamp the field. Validated unlocks moving forward also stamp it. Existing unlocked-connectors-without-provenance are tolerated indefinitely.
- **Test**: 2 vitest cases — backfill helper writes `'legacy-backfill'` on pre-epoch wires and `'validated'` on post-epoch wires; an integration test asserting that an existing unlocked-without-`unlockSource` row is unaffected by the change (idempotency + backward compat).
