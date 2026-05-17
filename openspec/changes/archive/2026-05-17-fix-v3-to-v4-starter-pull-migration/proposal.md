## Why

Dogfood users whose v3 save had an empty `doctors` table are permanently locked out of the hospital loop after upgrading to v4. The current v3→v4 migration in `ensureSeed` unconditionally force-sets `gameCounters.hasUsedStarterPull = true`, which hides the `StarterPullCard` UI and removes the only path to obtain a first doctor — the player ends up with `doctors: 0`, `mastery: 14` (proving they did play), zero room throughput, and no escape hatch.

This was confirmed live on prod (`fireman333.github.io/study-rpg/hospital/`): the dogfood owner's save shows `doctors: 0` + `hasUsedStarterPull: true` + `tier: 診所` + `reputation: 0`, exactly the failure mode predicted by reading `hospital-onboarding` spec §"v3 → v4 migrated save does not receive starter doctors" against `db/schema.ts` `ensureSeed` lines 197–222. The spec's original intent ("don't double-grant starter to dogfood users who already have doctors") was correct, but the implementation conflated "save was upgraded from v3" with "save has ≥1 doctor" — those two conditions are different, and v3 dogfood saves from very early versions (or saves whose doctors were cleared during testing) hit the empty branch.

## What Changes

- **MODIFY** `ensureSeed()` in `apps/medexam2-hospital-tw/src/db/schema.ts` to branch the v3→v4 patching on **actual doctor count**, not just on `hasUsedStarterPull === undefined`:
  - If `doctorCount === 0` (regardless of whether `hasUsedStarterPull` is `undefined` or `true`) → seed 2 P5 starter doctors AND set `hasUsedStarterPull = false` so the StarterPullCard appears
  - If `doctorCount > 0` AND `hasUsedStarterPull === undefined` → set `hasUsedStarterPull = true` (preserves original intent: dogfood users with existing doctors don't get a re-pull)
- **RECOVERY** branch handles the post-buggy-migration case too — users like the dogfood owner whose `hasUsedStarterPull` is already `true` but `doctorCount === 0` are still rescued (they cannot have reached this state through any normal play path).
- **NO schema bump**: changes are pure logic in the existing `ensureSeed` transaction; no new table, no new field, no new index, no v5 migration needed.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `hospital-onboarding`: split the single "v3 → v4 migrated save does not receive starter doctors" scenario into two branched scenarios (empty doctors → recover; non-empty doctors → preserve). Add a third recovery scenario covering already-migrated buggy saves where `hasUsedStarterPull = true` AND `doctorCount = 0`. Also amend the "Once true, never reset" clause to explicitly allow this single recovery codepath.

## Impact

- **Affected code** (1 file, ~15 lines of net change):
  - `apps/medexam2-hospital-tw/src/db/schema.ts` `ensureSeed` v3→v4 migration branch
- **Affected users**: any dogfood / early-tester with `doctors: 0` + `hasUsedStarterPull: true|undefined` on first boot of the patched build. Fresh new-saves (no v3 history) are unaffected — they already go through the `!counters` branch.
- **No spec breakage** to dependent capabilities (`recruitment-gacha`, `hospital-tycoon-engine`, `clinic-level-up`, `affinity-specialty-bonus`) — those consume `doctors` table state, not migration mechanics.
- **No API surface change** to `@study-rpg/core` — this is hospital-app-only.
- **Telemetry note**: after deploy, the dogfood owner's save self-heals on next page load; no manual DevTools intervention required.
