## Why

`neurons-leaderboard`'s「Push leaderboard row」 Requirement currently specifies the `total_settles` build expression as:

> sum of `meta['maze:da:settles']` + `['maze:5ht:settles']` + `['maze:gaba:settles']` + `['maze:glu:settles']` → `total_settles`

These four `maze:<branch>:settles` keys (one per neurotransmitter branch) were the maze economy schema **before** `decouple-neurons-subjects-from-nt-branches` (archived 2026-06-06) replaced them with **11 per-family keys** `maze:<familyId>:settles`. The code in `apps/neurons-tw/src/lib/maze/economy.ts:84` now writes `settlesKey = (familyId) => 'maze:${familyId}:settles'` for each of the 11 families, and the leaderboard adapter at `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts:109` correctly does `FAMILY_IDS.map((f) => 'maze:${f}:settles')`. The implementation is right; the spec is stale.

Practical consequence of letting this drift persist:

- A reader of the spec who implements the adapter from scratch would read the four old keys, get `0` (the keys aren't written anymore), push `total_settles = 0` to the leaderboard, and silently lose every player's exploration progress ranking.
- The「Worker sanity bounds」 Requirement also references `total_settles ≥ 0` without constraint on the upper bound — fine in practice because settles are monotonic counters, but the staleness compounds the drift.
- A future reorganization (e.g. moving families around or adding a 12th family) that touches the leaderboard adapter would have no spec authority for what keys to read.

The fix is pure spec-tightening: update the build expression to match the implementation. Code is already correct, so apply phase is read-only confirmation. Same shape as `document-family-mastery-sync-semantics` (Codex audit P2 gap — implementation correct, spec stale).

## What Changes

- **MODIFY `neurons-leaderboard`**: the「Push leaderboard row」 Requirement's `total_settles` build expression updates from「sum of four per-branch keys」 to「sum of 11 per-family `maze:<familyId>:settles` keys, one per neuron family declared by the content pack」. The defensive `Number(value) || 0` read pattern is preserved (legacy saves without a key contribute 0). The 4-branch legacy keys are explicitly noted as **retired** with a leave-and-ignore rule (existing physical writes from pre-`decouple` saves continue to exist in some saves' meta tables but SHALL NOT be read).
- **No** Worker / D1 / KV change. The `total_settles` value range stays `≥ 0`. Worker enforcement unchanged.
- **No** other Requirement touched.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-leaderboard`: update `total_settles` build expression in the「Push leaderboard row」 Requirement to per-family aggregation, retiring the 4-branch legacy enumeration.

## Impact

- **Specs**: 1 modified (`neurons-leaderboard`). No new capability.
- **⚠️ Archive-order dependency on change 3**: `unify-distinct-owned-projection-across-fusion-achievements-leaderboard` (change 3 in this propose batch) ALSO MODIFIES the same「Push leaderboard row」 Requirement (changing `variant_count` source to `ownedSlotCount(db)`). To prevent the later archive from overwriting the earlier fix, this change's MODIFIED requirement text incorporates **both** change 3's `ownedSlotCount` wording **and** this change's 11-family settles wording. **Archive order MUST be: change 3 first, then this change.** Tasks.md gates §5 archive on change 3's archive status. If change 3 has not yet archived when this change is ready to archive, hold until it does (or rebase this change's MODIFIED text against the then-current spec).
- **Code**: zero expected. The implementation at `services/neurons-leaderboard.ts:109` already reads per-family keys. Apply phase confirms via grep + adds a regression-guard test.
- **Persistence**: no Dexie bump, no R2 `SCHEMA_VERSION` bump, no D1 migration.
- **Player-visible**: zero behavior change (the implementation was always correct). The spec catches up.
- **Test**: 1 regression-guard vitest covering the adapter's `total_settles` field equals the sum of per-family settles keys for a state with non-zero settles across 3 families.
