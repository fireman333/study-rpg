## 1. Constant — content-neurons-tw

- [x] 1.1 In `packages/content-neurons-tw/src/dmn-types.ts`: add `FAMILY_BUFF_ENERGY_MULT = 2` (dogfood-tunable game-loop number; doc-comment it as the family-buff maze-energy multiplier, replacing the old +AP semantics). Keep `DMN_FAMILY_BUFF_DURATION_MS`.
- [x] 1.2 In `packages/content-neurons-tw/src/index.ts`: export `FAMILY_BUFF_ENERGY_MULT`.
- [x] 1.3 Rebuild: `pnpm --filter @study-rpg/content-neurons-tw build`.

## 2. family-buff: AP bonus → maze energy multiplier

- [x] 2.1 In `dmn-event-dispatcher.ts`: rename `getActiveFamilyBuffBonus(familyId)` → `getActiveFamilyBuffMultiplier(familyId)`; return `FAMILY_BUFF_ENERGY_MULT` when an unexpired family-buff matches, else `1`. Update its doc comment (energy multiplier, not AP bonus).
- [x] 2.2 In `connectome.ts` `recordCorrectAnswer`: drop the `+ dmnApBonus` term from `newAp` (family-buff no longer pumps AP); remove the now-unused in-tx bonus read. Capture `familyBuffMult = await getActiveFamilyBuffMultiplier(familyId)` (read before/around the energy faucet) and apply at the post-commit faucet: `accrueMazeEnergy(branch, CORRECT_ENERGY * streakMultiplier(current) * masteryMult * familyBuffMult)`.
- [x] 2.3 Confirm no other caller of the old `getActiveFamilyBuffBonus` name remains (grep).

## 3. quick-review-batch: placeholder → actionable 5-question 出征 mini-batch

- [x] 3.1 In `dmn-event-dispatcher.ts`: add a UI event `dmn.quickReviewStart` to `dmnUiEvents` (the existing bus). `dmn.quickReviewBatchRequested` emission stays.
- [x] 3.2 In `DmnQuickReviewToast.tsx`: render a clickable "▶ 5 題快速複習" CTA on `dmn.quickReviewBatchRequested`; clicking emits `dmn.quickReviewStart`. (Auto-dismiss behaviour preserved.)
- [x] 3.3 In `OverviewPage.tsx`: add a `quickReviewPool` state (≤5 slice of `buildWrongQuestionPool(pack.questions, questionHistory)`); listen for `dmn.quickReviewStart` → set it + open the expedition `QuizModal` on that capped pool with `onComplete={onExpeditionComplete}`. If the wrong pool is empty, do not open (toast already handles the empty CTA). Mutually exclusive with the full 出征 modal (reuse/guard `expeditionOpen` semantics).
- [x] 3.4 Add a pure helper for the cap (e.g. `buildQuickReviewPool(pool, history, n=5)` in `expedition.ts`) so it is unit-testable, OR inline a `.slice(0,5)` — prefer the helper for the test in §5.2.

## 4. UI copy — HelpMenu

- [x] 4.1 Update `HelpMenu.tsx` DMN event list: family-buff 「隨機 family AP +2/正確」→「隨機 family 的 maze 能量 ×2、1hr」; quick-review-batch 「5 道 SRS due 題彈出」→「5 題錯題快速複習（出征 mini-batch）」.

## 5. Tests (Vitest — no schema change)

- [x] 5.1 `getActiveFamilyBuffMultiplier`: returns 1 unbuffed; `FAMILY_BUFF_ENERGY_MULT` for the matching family while active; 1 for a non-matching family; 1 after expiry.
- [x] 5.2 family-buff faucet ratio test (mirror `mastery-energy-faucets.test.ts`): a buffed correct answer in family A accrues `FAMILY_BUFF_ENERGY_MULT`× the branch energy of an unbuffed identical answer (isolate via fresh-db ratio so streak/mastery cancel); a correct answer in family B under an A-buff accrues 1×.
- [x] 5.3 `buildQuickReviewPool`: caps at 5; returns all when <5; returns [] when 0.
- [x] 5.4 Run `pnpm --filter @study-rpg/neurons-tw test` — all green.

## 6. Verify + hygiene

- [x] 6.1 `pnpm -r typecheck` clean; no dangling `getActiveFamilyBuffBonus` references.
- [x] 6.2 Confirm NO Dexie `.version()` bump, NO R2 `SCHEMA_VERSION` change, NO `SYNCED_META_KEYS` change (grep the diff).
- [x] 6.3 Chrome MCP smoke: draw/inject a family-buff → confirm a correct answer in the buffed family accrues 2× branch energy (live `__db` read); draw/inject a quick-review-batch → toast CTA appears → click opens a ≤5-question expedition → clearing credits a DMN draw.
- [x] 6.4 Re-confirm file set vs parallel `add-neurons-instance-rename` (no overlap on db.ts/bundles.ts/tables.ts/CollectionPage.tsx); re-report via session-bus.
- [x] 6.5 Update `openspec/project.md` Roadmap row.
