> ✅ **UNBLOCKED 2026-06-01** — prerequisite `add-neurons-variant-collection-view` archived.
> The dex card `VariantSlotCard` in [`apps/neurons-tw/src/routes/CollectionPage.tsx`](../../../apps/neurons-tw/src/routes/CollectionPage.tsx)
> renders a reserved `data-provenance-caption` row (already min-height-reserved → no reflow on fill).
> §4 fills that row + surfaces the caption in `VariantUnlockModal`. R2 bump is **6→7** (collection-view took 5→6). Ready to apply.

## 1. Types & content constant

- [x] 1.1 Add `NeuronVariantProvenance` interface (`bornAtISO: string`, `apAtUnlock: number`, `wasRedemption: boolean`, `streakAtMint: number`) and an optional `provenance?: NeuronVariantProvenance` field on `NeuronVariantRow` in `apps/neurons-tw/src/lib/db.ts`. Do NOT change the `neuronVariants` `.stores()` index string and do NOT add a `.version()` declaration (non-indexed additive field — see design D2).
- [x] 1.2 Export `MILESTONE_STREAK_THRESHOLD = 7` as a single tunable constant from the content pack (`packages/content-neurons-tw/src/variants.ts`), with a comment that it is the dogfood-tunable milestone gate.

## 2. Redemption signal threading (connectome-collection delta)

- [x] 2.1 Extend `recordCorrectAnswer(familyId, ctx?: { wasRedemption?: boolean })` in `apps/neurons-tw/src/lib/services/connectome.ts` (additive optional arg; omitted → treat as `false`).
- [x] 2.2 Add `wasRedemption` to the `connectome.variantSlotUnlocked` event payload type and populate it from `ctx` when emitting the unlock event.
- [x] 2.3 In `apps/neurons-tw/src/components/QuizModal.tsx`, before recording the correct answer, read `questionHistory.get(q.id)?.everWrong` to compute `wasRedemption`, and pass it via `recordCorrectAnswer(q.subject, { wasRedemption })`. (Confirm read happens before `recordQuestionResult` flips `everWrong`.)

## 3. Provenance capture at mint (neuron-variant-gacha delta)

- [x] 3.1 In `apps/neurons-tw/src/lib/services/variant-gacha.ts` `handleSlotUnlock` / roll-and-persist, build the `provenance` object: `bornAtISO` = today's local date, `apAtUnlock` + `wasRedemption` from the payload, `streakAtMint` read from the streak service at mint. Write it on the variant row inside the existing Dexie transaction, before the reveal event fires.
- [x] 3.2 Ensure provenance is NOT written for the silent backfill path (`apAtUnlock = -1` / forceUnlock) in a way that fabricates context — backfilled/forced rows either get a clearly-synthetic provenance or none; align with the 元老 rule (absence = 元老). Decide and document inline.
- [x] 3.3 Verify the roll/rarity/floor path is otherwise unchanged (no edits to `VARIANT_RARITY_WEIGHTS`, `SLOT_RARITY_FLOOR`, reroll cap, or existing gacha tests).

## 4. Dex card caption UI

- [x] 4.1 Add a pure helper that maps a `NeuronVariantRow` → single caption line: standard / 救贖 / 里程碑 (`streakAtMint >= MILESTONE_STREAK_THRESHOLD`) / 元老 fallback (`provenance === undefined` → `rolledAt`-derived date + `familyId`). Use the design D4 templates (copy tunable).
- [x] 4.2 Fill the reserved `data-provenance-caption` row in `VariantSlotCard` (`apps/neurons-tw/src/routes/CollectionPage.tsx`) with the helper output — one line, the row already reserves min-height so no reflow. Confirm 元老 fallback renders for provenance-absent rows with no 救贖/里程碑 tags. Also surface the caption in `VariantUnlockModal` at mint.

## 5. R2 sync

- [x] 5.1 Bump `SCHEMA_VERSION` 6 → 7 in `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (add-neurons-variant-collection-view already took 5 → 6) and extend the `SCHEMA_VERSION history` comment noting the provenance row-field addition (no new adapter/meta key).
- [x] 5.2 Confirm the `neuronVariants` R2 adapter snapshots/applies whole rows so `provenance` flows automatically (LWW unchanged); add no monotonic-merge logic.

## 6. Tests

- [x] 6.1 Provenance capture unit test: mint stamps `{ bornAtISO, apAtUnlock, wasRedemption, streakAtMint }`; redemption flag set when triggering question was `everWrong`; 里程碑 flagged at `streakAtMint >= 7`; plain case not flagged.
- [x] 6.2 元老 detection test: a row with `provenance === undefined` resolves to the 元老 caption from `rolledAt` + `familyId`, and no write is performed.
- [x] 6.3 R2 cross-version round-trip test: v6 client applies a v5-shaped bundle (provenance absent → 元老 path, no validation error); a provenance-bearing row survives a round-trip through a v5-schema read (preserved in whole-row JSON). Mirror the DMN v1↔v2 forward-compat test pattern.
- [x] 6.4 Confirm `pnpm lint:dexie-fixtures` stays green (no `.version()` bump → no fixture required) and `pnpm --filter @study-rpg/neurons-tw test` passes.

## 7. Verify & QA

- [x] 7.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw build` clean.
- [x] 7.2 Chrome MCP end-to-end (per chrome_mcp_preflight): answer to mint a variant, confirm caption renders correctly for standard / 救贖 / 里程碑; confirm a pre-existing variant shows the 元老 caption; console clean.
- [x] 7.3 Finalize caption copy at this visual pass (design open question); retune `MILESTONE_STREAK_THRESHOLD` only if dogfood signals warrant. → Copy locked as design D4 (reads cleanly for the med-student audience; verified rendering in Chrome MCP). `MILESTONE_STREAK_THRESHOLD` stays 7 — no dogfood telemetry yet to warrant retuning.
- [x] 7.4 `/opsx:verify` green on completeness / correctness / coherence before archive.
