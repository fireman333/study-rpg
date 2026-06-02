## Why

Collected neuron variants are currently inert trophies: rolled, revealed once, then frozen in a grid with no story. The neurons-mode north star is Pikmin Bloom — where each collected creature carries the *context of the habit that grew it* (a Bloom Pikmin's decor reflects where you walked). Giving each variant a remembered **birth context** ("you wired this one the day you finally cracked a 藥理學 question you'd kept getting wrong") is the smallest, additive first step toward that feeling, and it lays the data substrate a later "study-context determines rarity" change can consume without re-plumbing signals.

## What Changes

- Each `neuronVariant` row gains **provenance**: the study context captured at mint time. Three signals on top of the always-recorded baseline (birth date + family):
  - **觸發脈絡** — `slotIndex` + `apAtUnlock` (already present in the `connectome.variantSlotUnlocked` payload; free to record).
  - **錯題救贖** — whether the triggering correct answer's question was previously `everWrong` → flags the variant a 救贖個體.
  - **里程碑** — the player's daily streak at mint → flags a milestone individual when streak ≥ a design-set threshold.
- The variant dex card renders a **single-line birth caption** derived from provenance (exact wording finalized in design; special tags 救贖/里程碑 embed in the same line).
- **Backfill**: variants rolled before this upgrade have no provenance. They are marked **傳承 / 元老** individuals; their existing `rolledAt` + `familyId` are displayed for free as date + subject; special tags remain empty (unrecoverable).
- **Display-only**: provenance does NOT affect gacha rarity, weights, floors, or any mechanic. Shipped gacha logic + tests are untouched. The schema is, however, designed **forward-compatible** so a future capability can read these fields to drive context-based rarity.
- **Cloud sync**: provenance fields travel in the neurons R2 bundle. The `neuronVariants` adapter stays LWW (provenance is immutable after mint).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neuron-variant-gacha`: the `neuronVariant` row shape gains additive provenance fields stamped at mint; old rows are backfilled as 元老; the dex card surfaces a birth caption; provenance fields sync via the neurons R2 bundle (LWW, immutable); fields are forward-compatible for a future context-rarity consumer (display-only now — no roll/rarity/floor behavior changes).
- `connectome-collection`: the `connectome.variantSlotUnlocked` event payload is extended **additively** to carry the triggering-answer context (the redemption signal) the mint point needs to stamp 救贖 provenance. (Design confirms the exact threading — payload extension vs. subscriber querying question-history — and the streak read.)

## Impact

- **Code (additive, no breaking changes)**:
  - `apps/neurons-tw/src/lib/db.ts` — additive optional `provenance` object on `NeuronVariantRow`. **No Dexie `.version()` bump**: provenance fields are non-indexed, so Dexie persists them transparently on existing v9 rows and new rows alike; the `neuronVariants` `.stores()` index string is unchanged. (This also means the `lint:dexie-fixtures` rule — which triggers only on a new `.version(N)` declaration — does not fire; see design for rationale so reviewers don't read it as a missed fixture.)
  - `apps/neurons-tw/src/lib/services/variant-gacha.ts` — stamp provenance at mint in `handleSlotUnlock` (read streak at mint; take redemption from payload). Old rows need no write — absence of `provenance` IS the 元老 marker, resolved at render.
  - `apps/neurons-tw/src/lib/services/connectome.ts` + `components/QuizModal.tsx` — `QuizModal` computes `wasRedemption` (triggering question's pre-answer `everWrong`) and passes it through an additive optional `recordCorrectAnswer(familyId, ctx?)` arg; connectome forwards it into the `connectome.variantSlotUnlocked` payload.
  - `apps/neurons-tw/src/lib/sync/r2/bundles.ts` — `SCHEMA_VERSION` **6 → 7** (`add-neurons-variant-collection-view` already took 5 → 6; provenance-evolution audit marker; the field rides transparently in whole-row JSON regardless, and `validateBundleMeta` already tolerates higher versions).
  - `apps/neurons-tw/src/lib/sync/r2/tables.ts` — `neuronVariants` adapter already snapshots/applies whole rows, so provenance flows with no logic change; stays LWW.
  - Dex card UI component — render the birth caption (and 元老 fallback when provenance is absent).
- **Tests**:
  - R2 cross-version bundle round-trip: v6 client reads v5 bundle (provenance absent → 元老 render path) and a v5-shaped row survives a round-trip through a v6 client (provenance preserved in whole-row JSON), mirroring the DMN v1→v2 forward-compat discipline.
  - Provenance capture unit test: redemption + streak-milestone flags stamped correctly at mint; 元老 detection when `provenance` is absent.
  - No Dexie upgrade fixture required (no `.version()` bump) — verified by `pnpm lint:dexie-fixtures` staying green.
- **Explicitly out of scope**: no new sprite art; no change to variant count, gacha weights/floors, or AP unlock ladder; no answer buffs, stakes, or loss mechanics.
- **Forward seam**: these provenance fields are the data substrate for two later changes — `context-driven-variant-art` (Bloom "hat = where it was born") and a study-context-determines-rarity ("種花的確定因果") cut.
