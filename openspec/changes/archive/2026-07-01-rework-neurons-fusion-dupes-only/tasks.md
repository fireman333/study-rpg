# Tasks — rework-neurons-fusion-dupes-only

## 1. Cost + content package
- [x] 1.1 Restore `PROMOTE_COST_K = 3` in `variants.ts` (drop `PROMOTE_COST_BY_TIER` / `promoteCostForTier`); revert `index.ts` export

## 2. Fusion service (variant-fusion.ts)
- [x] 2.1 `eligibleForTier` → `eligibleSurplusByTier` (surplus = held minus protected oldest-per-slot)
- [x] 2.2 `PromoteState.heldCount` → `surplusCount`, `cost` → `costK`; `getPromoteState` / `promoteTier` use surplus + `PROMOTE_COST_K`; DEV handle `eligible` → `surplus`

## 3. Collection UI (CollectionPage.tsx)
- [x] 3.1 `heldCountByTier` → `surplusByTier`; show tiers with surplus > 0; button label「重複 N/K」; tooltip clarifies duplicates + keep-1
- [x] 3.2 Prominent「只吃『重複』的神經元」callout above the tier buttons (promoteBlock/Hint/HintEmphasis styles)
- [x] 3.3 Keep the ghost-slot `familyRows` filter (from relax)

## 4. Spec deltas
- [x] 4.1 `neuron-variant-fusion`: revert tier-promote requirement to surplus semantics; re-add last-copy-protection requirement; add「only duplicates」UI-hint requirement
- [x] 4.2 `neuron-instance-rename`: revert the「fusion unaffected by nicknames」scenario to `eligibleSurplusByTier` / surplus wording

## 5. Tests + verification
- [x] 5.1 Rewrite `variant-fusion.test.ts` for surplus/last-copy + flat-K
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` — 770 pass; typecheck clean
- [x] 5.3 Chrome MCP localhost smoke: hint renders; slot7×4+slot2×1 →「重複 3/3」enabled; fuse consumes 3 dupes from slot7, keeps both last copies, mints P3

## 6. Ship
- [x] 6.1 `/opsx:archive` (sync deltas into main specs)
- [x] 6.2 Commit + merge track-neurons → main + deploy verify on prod
