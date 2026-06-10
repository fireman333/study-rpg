## 1. Catalog + content pack (MVP, placeholder art)

- [x] 1.1 Add a `mockVariantCatalog` typed array in `packages/content-neurons-tw/src/` — `{ variantId, rarity: P0..P5, displayName, spriteKey, neuroAnchorTODO }`, ~12–16 entries across the rarity pyramid; export from index
- [ ] 1.2 (DEFERRED — neuroAnchorTODO markers in place; PMID anchoring pending) For each entry's neuro-identity, run `/oe` / `/oe-triangulate` and attach PMID anchors; entries not yet anchored keep `neuroAnchorTODO: true` (persona visual/story may be freer; NT/anatomy/mechanism facts must be rigorous)
- [x] 1.3 Add a default rarity-title mapping + placeholder `spriteKey` glyph fallback (stable keys for the follow-up art swap)
- [x] 1.4 Build the content pack (`pnpm run build:neurons-content`) and confirm no orphan/skip

## 2. Schema: dedicated synced table (Dexie v20 + R2 21)

- [x] 2.1 Add `mockExamVariants` table to `apps/neurons-tw/src/lib/db.ts` at `.version(20)` (additive, no-callback); row type `{ variantId, rarity, displayName, spriteKey, copies, firstRolledAt, lastRolledAt }`, PK `variantId`
- [x] 2.2 Add the sibling v19→v20 upgrade fixture test (must contain literal `.version(19).stores(`) per `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` so `lint:dexie-fixtures` passes
- [x] 2.3 Add `mockExamVariantsAdapter` to `apps/neurons-tw/src/lib/sync/tables.ts` (mirror `neuronVariantsAdapter`): snapshot/apply, ownership monotonic, `copies` monotonic-max, display fields LWW by `lastRolledAt`; register in the adapter list + `SYNCED_META`/tracked tables as needed
- [x] 2.4 Bump `SCHEMA_VERSION` 20→21 in `apps/neurons-tw/src/lib/sync/r2/bundles.ts` + add the history comment
- [x] 2.5 Add the per-paper daily-cap marker `mockVariantRollDates: Record<paperKey, isoDate>` to synced `meta` (LWW via `metaAdapter`)

## 3. Gacha service (independent pool)

- [x] 3.1 New `apps/neurons-tw/src/lib/services/mock-variant-gacha.ts`: pure `rollMockVariant(score, stats, rng?)` reusing core `rollGachaWithFloor`; app-side score-band → P5..P0 weight table (default `<60/60–79/80–89/90–100`, monotonic toward rare); soft-pity ≥P2 after N dry rolls (tunable constants, documented)
- [x] 3.2 Persistence wrapper: resolve `(score)` → catalog entry, upsert `mockExamVariants` row (new = copies 1; dupe = copies+1, bump `lastRolledAt`), advance pity stats in `meta`
- [x] 3.3 Daily-cap guard: `canRollForPaper(paperKey, today)` reading `mockVariantRollDates`; stamp on successful roll

## 4. Wire the roll into mock submit

- [x] 4.1 In `MockExamRunner.tsx` submit handler, AFTER the existing `Promise.all(wrongs.map(recordQuestionResult …))`, call the gacha service gated by the daily cap; capture the roll result
- [x] 4.2 Show a reveal moment (reuse `CelebrationHalo` / `ParticleBurst`) after the score screen; dupe vs new indicated; placeholder sprite
- [x] 4.3 Confirm zero touch to maze `neuronVariants` / energy / connectome / DMN in this path (grep guard)

## 5. Collection view

- [x] 5.1 New mock-variant collection component/section (own count only, `🧬 X` pure-count chip, grouped by rarity, placeholder sprites); reachable from the 題庫/模考 area
- [x] 5.2 Live query `mockExamVariants` via Dexie liveQuery/useLiveQuery; empty-state copy

## 6. Tests + verify

- [x] 6.1 Unit: gacha distribution (score-band monotonicity over N rolls), pity guarantee after dry streak, daily-cap (no second roll same day / re-opens next day)
- [x] 6.2 Unit: R2 adapter round-trip + idempotent re-apply (no double-count), monotonic ownership/copies merge
- [x] 6.3 Unit: Dexie v19→v20 upgrade fixture (additive, no data loss) — `lint:dexie-fixtures` green
- [x] 6.4 `pnpm -r typecheck` + full vitest green; confirm no `SCHEMA_VERSION` / `SYNCED_META` mismatch
- [x] 6.5 Chrome MCP smoke: v20 schema opens clean (IndexedDB v200, mockExamVariants present); real in-browser `submitMockVariantRoll` → P3 variant persisted; same-paper-same-day → null (capped); collection page 1/13 with owned tile; F5 persists. No new console errors.
- [x] 6.6 Diff hygiene: revert any `meta.json` builtAt churn; confirm no maze-pool / leaderboard / Worker / D1 diff
