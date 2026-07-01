## Why

The just-shipped `relax-neurons-fusion-last-copy-protection` let fusion consume ANY held individual of a tier (removing the per-slot「keep one」 gate). On reflection the owner prefers the original collection-preserving rule: **fusion should only ever eat DUPLICATES** — you always keep the first copy of each variant. The downside of the relaxed rule (fusing can silently destroy the sole copy of a distinct art) outweighed its convenience. The player-facing confusion that motivated `relax` (「有 4 隻 P4 卻融不了」/「數字對不上」) is instead addressed by a **prominent in-UI hint** that fusion only consumes duplicates, plus a clearer button label.

## What Changes

- **Fusion consumes DUPLICATES only** (re-instate per-slot last-copy protection): the eligible pool for a tier `T` is the SURPLUS = Σ over slots of `max(0, held_in_slot − 1)` (the oldest held individual of each slot is protected). Revert `eligibleForTier` (full held set, dupes-first) → `eligibleSurplusByTier` (surplus only). A promote never empties an owned slot single-device.
- **Cost stays a flat `K = 3`** (owner decision — no per-tier escalation). `PROMOTE_COST_K` restored; the per-tier cost table explored mid-iteration is dropped.
- **Prominent「only duplicates fuse」hint**: the collection view renders a callout above the tier buttons —「融合 只吃『重複』的神經元 — 每種各保留 1 隻，多出來的重複個體才能拿去融合」. The button label counts duplicate surplus explicitly:「T→T−1（重複 N/K）」; the tooltip reads「消耗 K 隻重複的 T → 一隻 T−1（每種各留 1 隻）」. This directly resolves the original「button 2 vs card ×3」confusion without weakening protection.
- **Ghost-slot card hiding KEPT** (from `relax`): a `neuronVariants` row with 0 held individuals still does not render a card. Under dupes-only these only arise from the acknowledged cross-device race; hiding them keeps the cards consistent with the distinct-owned chip. `ownedSlotCount` projections unchanged.
- **Zero persistence-schema change**: no Dexie / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` bump. `consumedAt` monotonic-OR, `copies` MAX-merge unchanged.

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `neuron-variant-fusion`: (1)「Player SHALL be able to tier-promote…」requirement reverted to surplus/duplicates-only semantics (drops the relax「full held pool / dupes-first / spread-one-per-slot fusable」language); (2) RE-ADD「Last-copy protection SHALL keep at least one individual per owned slot」requirement (relax removed it); (3) ADD a requirement that the fusion UI prominently indicates only duplicates are consumed. Collection-view ghost-slot-not-rendered requirement is unchanged (kept).
- `neuron-instance-rename`: the「fusion unaffected by nicknames」scenario reverts to `eligibleSurplusByTier` / surplus wording.

## Impact

- **Code（engine）**：`packages/content-neurons-tw/src/variants.ts` — restore `PROMOTE_COST_K = 3` (drop `PROMOTE_COST_BY_TIER` / `promoteCostForTier`); `src/index.ts` export reverted. `apps/neurons-tw/src/lib/services/variant-fusion.ts` — `eligibleForTier` → `eligibleSurplusByTier` (surplus/last-copy); `PromoteState.heldCount` → `surplusCount`, `cost` → `costK`; consume `surplus.slice(0, PROMOTE_COST_K)`.
- **Code（UI）**：`apps/neurons-tw/src/routes/CollectionPage.tsx` — `heldCountByTier` → `surplusByTier`; button shows「重複 N/K」; prominent hint callout (`promoteBlock/Hint/HintEmphasis` styles); tooltip clarifies duplicates + keep-1; show tiers with surplus > 0. Ghost-slot `familyRows` filter retained.
- **Tests**：`apps/neurons-tw/src/__tests__/variant-fusion.test.ts` reverted to surplus/last-copy assertions (sole-copy protected, one-per-slot = 0 surplus, consume-K-dupes → mint T−1, energy untouched). 770 vitest pass, typecheck clean.
- **驗證**：Chrome MCP localhost — seed 免疫學 slot7×4 + slot2×1 → hint callout renders,「P4→P3（重複 3/3）」enabled; click consumes 3 from slot7 (dupes), leaves slot7×1 + slot2×1 (both protected), mints 1 P3.
- **不影響**：rarity rolls / P0 soft-pity / 能量 / 抽卡 / 成就 / leaderboard / sync merge。`ownedSlotCount` projections unchanged.
