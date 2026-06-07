# Tasks — per-family first-pull + path representative (replace 4-branch 舊制度)

## 1. Remove the 4-branch 舊制度 (net deletion)

- [x] 1.1 Delete `apps/neurons-tw/src/lib/services/first-pull.ts` + `first-pull-keys.ts`; delete `apps/neurons-tw/src/components/FirstPull.tsx`.
- [x] 1.2 `components/HomepageOnboarding.tsx`: remove the `<FirstPullButton placement="onboarding" />` + its import; tidy the CTA row.
- [x] 1.3 `lib/maze/graph.ts`: replace `litNodesWithStarter(...)` usage with pure `litNodes(familyId, settles)`; remove the `starterFamilies` param + starter-union logic.
- [x] 1.4 `lib/maze/useMaze.ts`: remove `readStarterFamily` import, `readStarterFamilies()`, the `starterFamilies` read in `recompute`, and the starter-key dependency in the `liveQuery`. Lit nodes = pure frontier.
- [x] 1.5 `lib/services/connectome.ts`: remove the first-pull re-arm (`FIRST_PULL_DONE_KEY` / `STARTER_FAMILY_KEYS`) from the account-reset path + its `first-pull-keys` import.
- [x] 1.6 `lib/sync/tables.ts` `SYNCED_META_KEYS`: drop `firstPullDone` + the 4× `maze:<branch>:starterFamily` entries (leave-and-ignore — comment why).
- [x] 1.7 Delete dead tests: `__tests__/first-pull.test.ts`, `__tests__/first-pull-graph.test.ts`; remove first-pull / starterFamily assertions from `__tests__/db-v16-to-v17-migration.test.ts` (keep the migration fixture itself — it covers the v17 schema, just drop the first-pull-specific asserts).

## 2. Per-family first-pull grant (guaranteed P5, once per family)

- [x] 2.1 First-pull set helper (`lib/services/family-representative.ts` or `first-pull.ts` rewritten): `firstPulledFamilies()` (read the `firstPullFamilies` meta set), `recordFirstPull(familyId)` (monotonic add).
- [x] 2.2 Guaranteed-P5 mint: extend `pullVariant` with an internal `opts.forceRarity?: Rarity` (preferred) OR a `grantFirstPull(familyId)` helper that mints a P5 via the same catalog→instance→persist path; call with `{ silent: true }`; stamp a first-pull provenance.
- [x] 2.3 `grantFirstPullIfNeeded(familyId, resolveName)`: if family not in the first-pull set → mint guaranteed-P5 → `setRepresentative(familyId, newSlotIndex)` → `recordFirstPull(familyId)`. Idempotent on set membership.
- [x] 2.4 Hook both `recordCorrectAnswer(familyId)` and `recordIncorrectAnswer(familyId)` in `connectome.ts` to call `grantFirstPullIfNeeded` post-commit, best-effort try/catch (channel `[first-pull]`).

## 3. Representative drives the walker head (+ silhouette before first answer)

- [x] 3.1 `lib/maze/useMaze.ts`: read `representativeVariants` in `recompute` + the `liveQuery` deps; pass the family's representative slot into the walker pick.
- [x] 3.2 `pickWalkerVariant(rows, representativeSlot?)`: prefer the representative (owned) → else rarest heuristic → return null when the family has zero collected variants (so the renderer can show the silhouette).
- [x] 3.3 Walker renderer: when `walkerVariant` is null (no collected variants in the family), render a **grayscale silhouette** placeholder (CSS `filter: grayscale()` + opacity over the default sprite — confirm at apply) instead of the old growth-cone fallback.

## 4. Persistence + sync (no Dexie bump; R2 SCHEMA_VERSION 17 → 18)

- [x] 4.1 `lib/sync/tables.ts`: add `firstPullFamilies` to `SYNCED_META_KEYS`; add a **monotonic-union** post-pass for it (mirror the `representativeVariants` LWW / counters MAX-merge post-pass in the `onPullComplete` backfill). Representative reuses the existing `representativeVariants` LWW (no new work).
- [x] 4.2 `lib/sync/r2/bundles.ts`: bump `SCHEMA_VERSION` 17 → 18; add `firstPullFamilies` to the meta allowlist; keep `validateBundleMeta` forward-compatible (info+continue on `> SCHEMA_VERSION`). v17 clients drop the unknown key; v18 reading v17 preserves local.
- [x] 4.3 Confirm no Dexie `.version()` change → no `db-v*-migration` fixture needed; `pnpm lint:dexie-fixtures` is a no-op for this change.
- [x] 4.4 Worker is bundle-opaque — confirm no Worker change.

## 5. Tests

- [x] 5.1 First-pull: first answer (correct) grants one P5 + sets representative; second answer no-ops; incorrect-first-answer also grants (per D1).
- [x] 5.2 Walker: `pickWalkerVariant` returns the representative when set+owned, falls back to rarest when unset, null when no collected variants.
- [x] 5.3 Sync merge: `firstPullFamilies` monotonic-union (fresh device does not re-grant); `representativeVariants` LWW unchanged — lock the carve-out.
- [x] 5.4 Bundle cross-version: v17 client drops `firstPullFamilies`; v18 reading a v17 bundle preserves local first-pull set.

## 6. Verify + spec + ship gate

- [x] 6.1 `pnpm -r typecheck` · `pnpm --filter @study-rpg/neurons-tw test` · `pnpm lint:dexie-fixtures` (no-op) · build.
- [x] 6.2 Chrome MCP smoke: fresh family → answer once → P5 appears at the tract walker head; un-answered family shows grayscale silhouette; re-select on CollectionPage changes the walker sprite; reload persists; console clean. Old 首抽 CTA gone from onboarding.
- [x] 6.3 `openspec validate add-neurons-first-pull-path-rep --strict`; `/verify`; archive + commit (explicit per-file); owner decides ship.
