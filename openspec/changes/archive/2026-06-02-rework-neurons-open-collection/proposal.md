## Why

After shipping the P0–P5 variant pyramid (closed-cap Pokédex: fixed slots + rarity-labeled silhouettes + `X / N` completion), dogfooding the live build made the owner want the opposite feel: an **open-ended collection** where you only ever see what you've actually pulled, the total is never dangled in front of you, and pulling never "ends". The Pokédex framing (預顯未收集 rarity + 進度條 + 全部收集 disable) turns the page into a checklist to grind to 100%; the open framing keeps it a growing, surprise-driven menagerie. This is a deliberate UX范式 reversal, not a bug fix.

## What Changes

- **BREAKING (player-facing UX)**: the `/collection` dex renders **only collected variants** — no uncollected silhouettes, no pre-shown rarity for un-pulled slots, no per-family slot grid sized to the catalog.
- **Completion / totals hidden from the player**: the catalog is still finite (77), but the player never sees a denominator, progress bar, `X / N`, `全部收集`, or `100%`. Collected cards still show their own rarity (you earned that knowledge by pulling).
- **Count chips become pure counts**: `🧬 X / 7` → `🧬 X 隻` on the homepage family cards (`VariantCollectionChip`) and any collection总覽 chip.
- **Pull never disables on completion**: once a family's underlying slots are all collected, pulling continues and yields **dupes** (`copies + 1`); there is no `全部收集` disabled state. (Dupe consumption is a separate follow-up `add-neurons-dupe-fusion`; this change only lets dupes accrue.)
- **Achievements reframed**: drop the "科別全收集 / family-complete" concept; replace with **"收集 N 隻" total-count milestones** (family-agnostic). Adjust the achievement catalog predicates + the `total variant count` stat.
- **Leaderboard `family_complete` → total-count**: the neurons leaderboard publishes a total collected-variant count instead of a family-complete flag. Additive D1 column on `leaderboard_neurons` only (the shared Worker / `leaderboard_m2` is untouched in semantics).
- **Collection reset (3rd, owner-chosen clean slate)**: Dexie `v11 → v12` clears `neuronVariants` + resets P0 pity, **preserving neural-energy balance + study progress** (mirroring v11's preserve discipline, unlike v10 which zeroed energy).

Non-goals (explicit, deferred): dupe-fusion (衝卷軸) consumption, the ~110-sprite roster art-fill, and any "集滿彩蛋" easter egg.

## Capabilities

### New Capabilities

(none — this change modifies existing neurons capabilities)

### Modified Capabilities

- `neurons-variant-collection-view`: dex renders only collected variants (remove the silhouette / catalog-sized-grid requirement); count chip becomes pure count; pull control no longer disables on full collection (no `全部收集` state).
- `neuron-variant-gacha`: pull is always available; the "fully collected" / completion concept is hidden from the player and never disables pulling; post-completion pulls yield dupes.
- `neurons-achievements`: remove family-complete milestone requirements; add total-collected-count milestone requirements.
- `neurons-leaderboard`: replace the `family_complete` published field with a total collected-variant count.

## Impact

- **App (`apps/neurons-tw/`)**: `routes/CollectionPage.tsx` (render only collected, pure-count chip, pull never disables), `lib/services/variant-gacha.ts` (`getPullableState` completion semantics), `lib/services/achievement.ts` (stat: `familyCompleteCount` → total variant count), `lib/services/neurons-leaderboard.ts` (`family_complete` → total-count), `components/VariantCollectionChip.tsx` (`X / N` → `X 隻`), `lib/db.ts` (Dexie `v11 → v12` reset + `__tests__/` upgrade fixture).
- **Content (`packages/content-neurons-tw/`)**: `achievements.ts` catalog (family-complete entries → total-count milestones) + the achievement validator if the P1 `composite` rule is affected.
- **Cross-track (⚠️)**: `cloudflare/sync-worker/` leaderboard module + a D1 migration adding `total_variant_count` to `leaderboard_neurons` (additive). Touches the Worker shared with medexam2 — must keep `leaderboard_m2` behavior unchanged; `deploy-worker.yml` redeploys the whole Worker.
- **Sync**: neurons R2 bundle `SCHEMA_VERSION` bump (additive, reader-tolerant) if the leaderboard/achievement reframe adds synced meta keys; no Worker change for R2 transport (bundle-opaque).
- **CI gates**: `dexie-fixture-lint.yml` requires a `v11 → v12` upgrade fixture; `deploy-worker.yml` fires on the Worker change; `deploy-cf-pages.yml` ships neurons-tw.
- **Canonical seam preserved**: keep using `slotsForFamily` / `VARIANT_COUNT_BY_FAMILY` for any internal slot-count math; no new magic `=== 5/6/7`.
