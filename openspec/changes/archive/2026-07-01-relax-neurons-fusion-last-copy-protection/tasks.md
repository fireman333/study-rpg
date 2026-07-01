# Tasks — relax-neurons-fusion-last-copy-protection

## 1. Fusion service (variant-fusion.ts)
- [x] 1.1 `eligibleSurplusByTier` → `eligibleForTier`: return ALL held individuals of the tier (drop per-slot last-copy gate), in dupes-first consume order (each slot's oldest copy last)
- [x] 1.2 `PromoteState.surplusCount` → `heldCount` (total held of the tier); `getPromoteState` reports `eligibleForTier().length`
- [x] 1.3 `promoteTier` consumes `eligibleForTier().slice(0, K)`; doc + DEV handle (`surplus` → `eligible`) updated

## 2. Collection UI (CollectionPage.tsx)
- [x] 2.1 `surplusByTier` → `heldCountByTier` (total held per rarity — matches card ×N sum)
- [x] 2.2 Fusion button: show at held ≥ 2, enable at ≥ K, numerator = total held; drop「保留每槽第一隻」tooltip
- [x] 2.3 Filter `familyRows` to slots with ≥ 1 held individual (hide ghost slots created by single-device fusion)

## 3. Spec deltas
- [x] 3.1 `neuron-variant-fusion`: modify tier-promote requirement, remove last-copy-protection requirement, modify collection-view requirement (ghost slot not rendered)
- [x] 3.2 `neuron-instance-rename`: modify the「fusion unaffected by nicknames」scenario wording to `eligibleForTier` / any-K-held

## 4. Tests + verification
- [x] 4.1 Rewrite `variant-fusion.test.ts` for the new eligibility + dupes-first order + cross-slot K fuse
- [x] 4.2 `pnpm --filter @study-rpg/neurons-tw test` — 771 pass; typecheck clean
- [x] 4.3 Chrome MCP localhost smoke: 4 P4 across 2 slots → button「4/3」enabled → fuse consumes 3, mints P3; ghost card hidden; counts consistent

## 5. Ship
- [x] 5.1 `/opsx:archive` (sync deltas into main specs)
- [x] 5.2 Commit + merge track-neurons → main + deploy verify on prod
