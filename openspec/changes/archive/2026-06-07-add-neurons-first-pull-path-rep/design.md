# Design — per-family first-pull + path representative (replace 4-branch 舊制度)

## Context

neurons-tw (track-neurons). The maze is the homepage; 11 subject families each own one carved tract (flat grid, no NT branches). Reality at apply time (verified):

- Variant collection runs through `pullVariant(familyId, resolveFamilyDisplayName, opts?: { silent? })` in `lib/services/variant-gacha.ts` — there is **no** `rarity` override option (the prior design assumed one wrongly). `Rarity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5'`; **P5 is the common tier**, P0 is the pity tier.
- A per-family representative ALREADY exists: `lib/services/representatives.ts` (`representativeVariants` meta key, timestamped `{ map, updatedAt }` envelope, LWW via `backfillRepresentativesLWW` post-pass, `setRepresentative(familyId, slotIndex)` with a collected-guard). It's already in `SYNCED_META_KEYS`. A re-select UI is already live on `CollectionPage`. `character-card.ts` consumes it (4-branch derivation).
- The walker head is `walkerVariant: pickWalkerVariant(rows)` in `useMaze.ts:131` — currently the **rarest** collected variant; positioned at the family `entryCell` even at `settles = 0`.
- The shipped 舊制度 first-pull is a 4-branch CTA (`first-pull.ts`, `FirstPull.tsx`, hosted in `HomepageOnboarding`) gated on `meta['firstPullDone']`, lighting nodes via `meta['maze:<branch>:starterFamily']` read by `litNodesWithStarter` in `graph.ts`.

Persistence is Dexie **v17** synced as R2 bundles (**SCHEMA_VERSION 17**).

## Goals

- First answer of any family (correct or incorrect) → one free guaranteed-P5, exactly once per family, becomes that family's representative.
- The representative is the family's path neuron, shown at the tract walker head.
- The player can re-select the representative (existing CollectionPage picker).
- Survive cross-device sync. No Dexie schema change.
- Remove the 4-branch 舊制度 entirely (net deletion).

## Non-Goals

- #2 quiz zoom-focus, #4 recruitment reveal, #5 per-subject reading, #6 expedition selection.
- The shareable **character card** redesign (still 4-branch; untouched here).
- Any energy / acceleration / economy effect — the first-pull P5 is purely a collectible + representative.

## Decisions

### D1 — Trigger: first *answer* (correct or incorrect), once per family
Hook both `recordCorrectAnswer(familyId)` and `recordIncorrectAnswer(familyId)` in `connectome.ts` (owner: 對錯都算). On entry, if the family is not in the first-pull set, grant + record. Idempotent via the set membership. Runs post-commit in a best-effort try/catch (channel `[first-pull]`) so it never breaks the answer flow (mirrors the achievement / question-history hook discipline). **No explicit CTA ritual** (owner re-decided 2026-06-07: auto on first answer, superseding the Jun-4 grill's CTA choice).

### D2 — First-pull = guaranteed P5, minted silently via the existing gacha
The existing `pullVariant` has no rarity override, so add a thin **rarity-forcing path** for the first-pull only: either (a) a new internal `opts.forceRarity?: Rarity` on `pullVariant` (preferred — keeps the catalog→instance→persist path single-sourced), or (b) a small `grantFirstPull(familyId)` helper that performs the same mint pinned to a P5 catalog entry. Confirm at apply which is cleaner; **(a) preferred**. Called with `{ silent: true }` so there is no per-pull reveal and no inline achievement-toast flood; achievements still unlock + persist (boot backfill is the safety net). P0 **pity counter** and **dupe** handling follow the gacha's normal behavior. A first-pull provenance is stamped on the minted instance.

### D3 — Representative drives the walker head; reuse `representativeVariants`
No new Dexie table. The first-pull sets the family's representative by writing the existing `representativeVariants` meta-key via `setRepresentative(familyId, slotIndex)`. `pickWalkerVariant` is extended to take the family's representative slot: if set and resolving to an owned variant row, the walker head shows THAT variant; else the current rarest heuristic; else (no owned variants at all) a **grayscale silhouette** placeholder (was: growth-cone fallback — owner F6). `useMaze` recompute reads `representativeVariants` (and drops the `starterFamilies` read).

### D4 — First-pull idempotency: one synced `firstPullFamilies` meta key (monotonic union)
A single synced meta key `firstPullFamilies` holding the set of familyIds already first-pulled (JSON array). Merge = **monotonic UNION** (a family present on either side stays present; never removed) — mirrors `dmnEventLog` / `everWrong` discipline, so a fresh device can't re-trigger a grant. Added to `SYNCED_META_KEYS` with a dedicated union post-pass (the generic meta adapter is first-write-wins, insufficient for a growing set — mirror how `representativeVariants` gets its LWW post-pass). Representative persistence itself reuses the existing `representativeVariants` LWW.

### D5 — Remove the 4-branch 舊制度 (net deletion)
Delete `lib/services/first-pull.ts` + `first-pull-keys.ts`, `components/FirstPull.tsx`; remove `<FirstPullButton>` from `HomepageOnboarding.tsx`; drop `firstPullDone` + 4× `maze:<branch>:starterFamily` from `SYNCED_META_KEYS` (leave-and-ignore — stray incoming keys are simply not in the allowlist); replace `litNodesWithStarter` with `litNodes` (pure frontier) in `graph.ts` + `useMaze.ts` and remove `readStarterFamily`/`readStarterFamilies`; drop the first-pull re-arm in `connectome.ts` account-reset. Remove the dead tests (`first-pull.test.ts`, `first-pull-graph.test.ts`) and the first-pull assertions in any migration fixture.

### D6 — Persistence/sync: no Dexie bump, R2 SCHEMA_VERSION 17 → 18
No Dexie `.version()` change (reuse `meta`). `bundles.ts`: bump `SCHEMA_VERSION` 17 → 18; add `firstPullFamilies` to the meta allowlist; keep `validateBundleMeta` forward-compatible (info+continue on `> SCHEMA_VERSION`). Reader tolerance: v17 clients drop the unknown `firstPullFamilies` key; v18 reading a v17 bundle finds none (local first-pull set preserved via monotonic merge). `representativeVariants` is already in the allowlist with its LWW post-pass. Worker is bundle-opaque — no Worker change. **No dexie-fixture-lint trigger** (no `.version()`).

### D7 — character-card untouched
`character-card.ts` still calls `pickBranchRepresentatives(representativeMap)` over the (now unused) NT-branch grouping. Left as-is this change (owner: 本 change 不碰 character-card). It still reads the same `representativeVariants` map so it won't crash; its 11-family redesign is a separate change.

## Risks / Mitigations

- **Re-grant on cross-device**: neutralised by `firstPullFamilies` monotonic-union merge — locked by a sync-merge test.
- **Walker fallback**: if a family's representative points at a since-removed slot (shouldn't happen — variants aren't deleted), `pickWalkerVariant` null-safely falls back to rarest, then silhouette.
- **Removing starter-lit**: fresh families now have 0 lit nodes until first settle (owner-approved — rep shows at the tract head, lighting is pure frontier). No data migration.
- **No Dexie bump** sidesteps the pk-change incident class entirely.

## Migration plan

No Dexie migration. Old `firstPullDone` / `starterFamily` keys are leave-and-ignore (dropped from the allowlist). Only the owner is testing → the new per-family rule applies directly; each family's first answer grants its P5. Rollback = revert the change (reuses existing meta-keys; a v18 bundle's `firstPullFamilies` is simply dropped by the reverted v17 client).

## Open questions (resolve at apply)

- D2 mint path: `pullVariant` internal `forceRarity` option vs a dedicated `grantFirstPull` helper — pick the one that keeps the catalog→instance→persist path single-sourced.
- D3 grayscale silhouette: CSS `filter: grayscale()` + opacity over the existing default/generic sprite (preferred, zero new asset) vs a dedicated placeholder PNG.
- `firstPullFamilies` post-pass placement: alongside the representatives/counters backfill post-pass in the `onPullComplete` hook.
