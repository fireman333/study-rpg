## 1. Dexie v12 reset (foundation)

- [x] 1.1 Bump `apps/neurons-tw/src/lib/db.ts` to `.version(12)`; `.upgrade()` clears `neuronVariants` + resets every `familyAccrual` row's `pullCount=0` / `unlockedSlots=[]`; PK unchanged
- [x] 1.2 Confirm preservation split: AP / synapses / mastery / questionHistory / bookmarks / achievements / `totalStudyMinutes` / `neuralEnergyEarned` / `neuralEnergySpent` all untouched by the v12 callback
- [x] 1.3 Add `apps/neurons-tw/src/__tests__/db-v11-to-v12-migration.test.ts` fixture: seed a v11 save (collected variants + non-zero AP/synapses + non-zero energy) → reopen at v12 → assert `neuronVariants` empty, `pullCount=0`, and study+energy preserved (satisfies `dexie-fixture-lint`)

## 2. Gacha service — pull never disables, completion hidden

- [x] 2.1 `apps/neurons-tw/src/lib/services/variant-gacha.ts` `pullVariant(familyId)`: drop the "not fully collected" precondition; require only balance ≥ `PULL_COST`; fully-collected pulls proceed and yield a dupe
- [x] 2.2 `getPullableState`: remove the player-facing `complete`/disable semantics (control disables only below cost); drop the now-dead `'complete'` reject reason
- [x] 2.3 Confirm within-tier uniform pick + P0-once-owned exclusion still hold so a fully-collected family deterministically yields a dupe

## 3. Collection view — render only collected + pure count

- [x] 3.1 `apps/neurons-tw/src/routes/CollectionPage.tsx`: iterate **collected `neuronVariants` rows** grouped by family; remove the catalog-slot silhouette grid + rarity-labeled empty slots + AP/threshold remnants
- [x] 3.2 Remove every denominator / progress / `X / N` / `100%` / 全部收集 indicator; collection count chip → `🧬 X 隻`
- [x] 3.3 Pull control: disabled only below cost (never on full collection); keep energy HUD + family headers + filter chips rendering even at zero collection (page never blank)
- [x] 3.4 Empty family section: render header with no cards (default: no faint hint) so filter chips stay meaningful
- [x] 3.5 `apps/neurons-tw/src/components/VariantCollectionChip.tsx`: `🧬 X / N` → `🧬 X 隻`; drop the `X === N` celebratory (gold/🏆) branch

## 4. Achievements reframe — distinct-variant milestones

- [x] 4.1 `packages/content-neurons-tw/src/achievements.ts`: drop family-complete predicates; lower tiers become an ascending distinct-count ladder (50 for the reframed P2); the P1 鑽石 capstone stays a genuine composite (`variantCount >= 60 && naturalP1DistinctFamilies >= 3`, no degenerate full-dex AND, no validator change)
- [x] 4.2 `apps/neurons-tw/src/lib/services/achievement.ts`: remove `familyCompleteCount` stat (+ orphan `variantsByFamily`/`VARIANT_COUNT_BY_FAMILY`); `variantCount` = `db.neuronVariants` row count (distinct, not copies)
- [x] 4.3 `packages/content-neurons-tw/src/achievement-types.ts`: drop `familyCompleteCount` field; build runs the validator (`pnpm --filter @study-rpg/content-neurons-tw build`) green

## 5. Leaderboard client adapter

- [x] 5.1 `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` `pushNeuronsLeaderboardRow`: stop computing/sending `family_complete` (+ orphan `VARIANT_COUNT_BY_FAMILY`); `variant_count` = `db.neuronVariants` row count at push time; drop `family_complete` from `LeaderboardRow` / payload types
- [x] 5.2 Leaderboard UI (`LeaderboardPage` + `styles.css` grid): drop the `family_complete` cell + header; `variant_count` cell shows a pure count (no `/55`, no `/77`); composite tab tie-break = `variant_count DESC, total_study_min DESC`; grid template 7→6 cols

## 6. Worker — neurons leaderboard (cross-track, isolate from leaderboard_m2)

- [x] 6.1 `cloudflare/sync-worker/src/neurons-leaderboard.ts` composite ORDER BY drops `family_complete` → `variant_count DESC, total_study_min DESC`; `SNAPSHOT_COLUMNS` drops `family_complete`
- [x] 6.2 Upsert validation: `variant_count` bound `[0,55]` → `[0,77]`; remove `family_complete` bound + parse; INSERT drops the column (vestigial via `DEFAULT 0`); legacy `family_complete` field ignored (no rejection)
- [x] 6.3 Diff-review the Worker — ZERO change to the `leaderboard_m2` / 二階 code path (`leaderboard.ts` untouched); no D1 migration added (family_complete column left vestigial)

## 7. Tests

- [x] 7.1 `gacha-pull.test.ts`: rewrote "rejected when fully collected" → "pulls a dupe (no rejection) when fully collected"
- [x] 7.2 `leaderboard-study-min.test.ts`: added open-collection cases (`variant_count` = distinct row count; payload carries no `family_complete`)
- [x] 7.3 `pnpm --filter @study-rpg/neurons-tw test` green (215); content build (validator) green; `pnpm -r typecheck` green (12/12); `pnpm lint:dexie-fixtures` green

## 8. Spec Purpose hygiene (stale-text touch flagged in design)

- [x] 8.1 Hand-touched stale `Purpose` paragraphs: `neurons-variant-collection-view` (silhouette wording), `neurons-leaderboard` (`family_complete` / `0–55` field list + composite sort), `neuron-variant-gacha` (`55` / `5 slots` / `X / 5` chip + AP-slot remnants) — requirements remain the source of truth
- [x] 8.2 Project `CLAUDE.md` checked — the only `silhouette`/`Pokédex` hits are the achievements page + DMN fate-cards (unrelated, still valid); no stale variant-collection closed-cap refs to fix

## 9. Verify + smoke (gate before archive / post-deploy)

- [x] 9.1 Chrome MCP smoke (localhost:5175): v12 reset confirmed (collection empty, energy preserved); `/collection` renders only collected (1 card not 7 — no silhouettes), `🧬 X 隻` pure-count chips, pull mints then dupes (`× 2` badge), pull stays enabled, console clean
- [x] 9.2 Leaderboard smoke: no 家族 column, 變體 present, 5 tabs render, console clean (empty grid in dev = no KV rows without auth; column removal confirmed statically + typecheck)
- [ ] 9.3 Post-deploy (Step 9): 二階 leaderboard regression check after the shared-Worker redeploy (a `leaderboard_m2` row still ranks/displays correctly)
