## Why

The neurons "Collection 2.0" mini-milestone (deep-grilled 2026-06-02; see
`openspec/decisions/2026-06-02-neurons-squad-expedition-plan.md`) reframes the collected variants
from a passive dex into a **living squad that studies WITH you**. Phase 1 ships the modest, low-risk
core: a player-assembled active squad that appears while answering, celebrates each correct answer,
and a homepage 出征 ritual that drills the player's cross-subject wrong questions.

This phase deliberately leaves the reward economy, gacha flip, P0 tier, and dupe fusion to later
phases. It exists to (a) give the squad/expedition *surface* that Phase 4 rewards will plug into, and
(b) turn answering into a felt, motivating ritual without touching collection balance.

## What Changes

- **Active squad** — the player picks a small subset of their collected neuron variants as their
  "active squad". Persisted as a synced `meta` envelope (mirrors `representativeVariants` — no new
  Dexie table, LWW across devices). Reuses existing collected-variant data + `VariantSprite`.
- **Squad = party on the connectome homepage** — the active squad renders as a party row on the
  connectome homepage, beside (never crowding) the connectome SVG graph; responsive + reduced-motion.
- **Correct-answer celebration** — answering correctly in `QuizModal` triggers a synchronized squad
  celebration animation at the correct-answer moment, alongside the existing hero-variant flourish;
  respects `prefers-reduced-motion`.
- **All-subject wrong-question 出征** — a homepage 出征 action opens the existing `QuizModal` on the
  cross-subject "currently unmastered" pool (questions with `lastResult === 'wrong'` in
  `questionHistory`). Not per-family — all subjects in one deploy.
- **Reward seam** — a clearly-marked, no-op `onExpeditionComplete` extension point so Phase 4
  (`add-neurons-expedition-rewards`) can plug in probabilistic supplement drops without rework. No
  reward / probabilistic / gacha logic ships here.

## Capabilities

### New Capabilities
- `neurons-study-squad`: player-assembled active squad (synced selection state), its party rendering
  on the connectome homepage, the correct-answer celebration, the all-subject wrong-question 出征
  ritual, and the no-op reward seam for later phases.

### Modified Capabilities
<!-- None — this change is purely additive. The 出征 reuses neurons-wrong-answer-list's questionHistory
     as a read source and neurons-mode's QuizModal as the drill surface, but changes neither's spec. -->

## Impact

- **New code**: `lib/services/study-squad.ts` (squad envelope read/write + LWW backfill, mirroring
  `representatives.ts`); `lib/services/expedition.ts` (wrong-question pool builder + no-op reward
  seam); squad party component on the connectome homepage; squad celebration in `QuizModal`.
- **Sync**: add `activeSquad` to `SYNCED_META_KEYS` in `lib/sync/tables.ts` + a `backfillActiveSquadLWW`
  in the `onPullComplete` hook (mirror `backfillRepresentativesLWW`); bump R2 bundle `SCHEMA_VERSION`
  7 → 8 in `lib/sync/r2/bundles.ts` (additive; reader-tolerance already built in).
- **No Dexie `.version()` bump** — squad rides the existing `meta` table envelope (representatives
  precedent), so no schema migration and no `dexie-fixture-lint` trigger.
- **Reused read sources** (unchanged): `questionHistory` (wrong-question pool), `neuronVariants` +
  `representatives` (collected set), `QuizModal` (drill surface), `quiz-pool.ts` (pool helpers).
- **Tests**: unit tests for the squad envelope LWW + the wrong-question pool builder; Chrome MCP smoke
  for the homepage party + celebration + 出征 flow.
