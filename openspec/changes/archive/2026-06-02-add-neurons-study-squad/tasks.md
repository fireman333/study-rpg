## 1. Active squad state service

- [x] 1.1 Add `lib/services/study-squad.ts` mirroring `representatives.ts`: `ACTIVE_SQUAD_META_KEY = 'activeSquad'`, envelope type `{ members: VariantKey[]; updatedAt: number }`, `parseSquadEnvelope` (tolerate bare-array legacy → `updatedAt: 0`), `readSquadEnvelope`.
- [x] 1.2 Add `MAX_SQUAD_SIZE` constant (5 — owner-confirmed) + `addSquadMember(familyId, slotIndex)` (reject uncollected via `neuronVariants.get`; reject when at cap or already present; stamp `updatedAt`), `removeSquadMember(...)`, returning success booleans.
- [x] 1.3 Add pure `filterStaleSquadMembers(members, collectedKeys)` + `pickActiveSquadLWW(localRaw, incomingRaw)` + `variantKey` / `parseVariantKey` + `useActiveSquad()` hook, exported for unit test.

## 2. Sync wiring (no Dexie bump)

- [x] 2.1 Add `'activeSquad'` to `SYNCED_META_KEYS` in `lib/sync/tables.ts`.
- [x] 2.2 Add `lib/sync/backfill/active-squad.ts` `backfillActiveSquadLWW` (mirror representatives); wire into `runOnPullComplete` (step 1c).
- [x] 2.3 Bump `SCHEMA_VERSION` 7 → 8 in `lib/sync/r2/bundles.ts` + append the v8 history comment.
- [x] 2.4 Confirmed NO Dexie `.version()` change (squad rides the `meta` envelope) — `lint:dexie-fixtures` green, no new fixture.

## 3. Squad party on the connectome homepage

- [x] 3.1 Add `components/StudySquadPanel.tsx` (reuse `VariantSprite`) rendering the active squad as a party row on `routes/OverviewPage.tsx`.
- [x] 3.2 Placed as its own block above the connectome tree (no overlap with SVG graph / quiz entry / year filter); responsive grid editor.
- [x] 3.3 Empty-squad state: assemble-your-squad placeholder (distinguishes 0-collected vs 0-in-squad).
- [x] 3.4 Squad picker (collapsible 編輯隊伍): toggle collected variants in/out up to `MAX_SQUAD_SIZE` (disabled when full).
- [x] 3.5 Respect `prefers-reduced-motion` (no idle animation on the panel; celebration class is reduced-motion-guarded).

## 4. Correct-answer squad celebration

- [x] 4.1 `components/SquadCelebration.tsx` + render in `QuizModal` on the `isCorrect` reveal branch alongside the hero flourish.
- [x] 4.2 Synchronized CSS `@keyframes squad-celebrate-bounce` (single play, staggered delay); empty squad → no-op.
- [x] 4.3 Respect `prefers-reduced-motion` (static), mirroring `.neuron-sprite--alive`.

## 5. Expedition (出征) + reward seam

- [x] 5.1 `lib/services/expedition.ts`: `buildWrongQuestionPool(pool, history)` intersecting questions with `lastResult === 'wrong'` rows (all subjects, no family/year filter); pure + unit-tested.
- [x] 5.2 Homepage 出征 action (StudySquadPanel button) → OverviewPage opens `<QuizModal pool={expeditionPool} />`; empty pool → disabled button + empty-state hint, no modal.
- [x] 5.3 No-op reward seam `onExpeditionComplete(session)` in `expedition.ts`; QuizModal `onComplete` fires it on expedition session end.
- [x] 5.4 Confirmed NO reward / probabilistic / gacha / currency / pull-rate logic introduced.

## 6. Tests

- [x] 6.1 `study-squad.test.ts` — add/remove, reject uncollected, no-double-add, cap, `filterStaleSquadMembers`, `pickActiveSquadLWW`, `parseSquadEnvelope`, `variantKey`/`parseVariantKey`.
- [x] 6.2 `expedition.test.ts` — `buildWrongQuestionPool` wrong-only, spans subjects, empty, ignores non-pool ids; `onExpeditionComplete` no-op.
- [x] 6.3 `squad-bundle-sync.test.ts` — activeSquad snapshots into v8 bundle; v7 bundle preserves local on omission; updated `dmn-bundle-cross-version` assertion 7→8.
- [x] 6.4 `pnpm --filter @study-rpg/neurons-tw test` green (184/184); `typecheck` green.

## 7. Verify (end-to-end)

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw build` (TS strict + Vite) green.
- [x] 7.2 Chrome MCP smoke (browser preflight OK): homepage party panel renders, does NOT overlap the connectome SVG (`panelVsSvgOverlap: false`); assemble-squad placeholder shown for an empty squad; seeded squad → party sprites render, placeholder gone. Seeded TEST rows cleaned up afterward (dogfood DB restored).
- [x] 7.3 Celebration wired + styled: `.squad-celebrate` CSS rule loaded; `SquadCelebration` imported into the `isCorrect` reveal branch; reduced-motion-guarded; logic unit-covered. (Live bounce not force-triggered to avoid mutating the dogfood save; rAF is throttled in a backgrounded MCP tab anyway — verified-by-construction.)
- [x] 7.4 Chrome MCP smoke: 出征 opens `QuizModal` on the wrong pool (`第 1/3 題 · 病理學`); button disabled with hint when pool is empty (code path) + enabled with count when non-empty; Esc closes (fires the no-op seam); console clean (no errors).
- [x] 7.5 `/simplify` (4 cleanups applied, 184 tests green) + `/opsx:verify` (3-dim: 0 critical / 0 warning) pass. Chrome MCP smoke served as the `/verify` end-to-end pass.
