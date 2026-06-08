## 1. Spec audit (read-only — confirm divergence before any code touch)

- [x] 1.1 Read `apps/neurons-tw/src/lib/services/reading-timer.ts` and confirm whether the per-minute side-effect still calls `dmnReadingTimerSubscriber.onMinutesAccrued(1)` or has been decoupled. Note the exact call site / removal commit. **CONFIRMED decoupled** — comment at L10-11 explicitly notes「reading no longer grants DMN draws」.
- [x] 1.2 Read `apps/neurons-tw/src/lib/services/dmn-trigger.ts` and identify whether `dmnReadingTimerSubscriber` (or any reading-axis grant path) is still exported / referenced. If still exported, audit all importers. **CONFIRMED removed** — only `creditExpeditionDraws` + `initializeDmnTrigger` exported; no reading subscriber.
- [x] 1.3 Read `apps/neurons-tw/src/lib/sync/tables.ts` and locate the adapter / merge logic for the 5 daily-meta keys (`dmnDrawsAvailable`, `dmnTimeAxisDrawsConsumedToday`, `dmnBehaviorAxisDrawsConsumedToday`, `dmnTimeAxisMinutesAccrued`, `dmnLastDailyResetDate`). Document the current merge strategy per key. **DIVERGENCE FOUND** — 5 keys are in `SYNCED_META_KEYS` (so they round-trip) but NONE are in `MAX_MERGE_KEYS` (counter backfill). Meta adapter does「missing-only insert」 (local-wins fallback). Cross-device race silently swallowed. Actual key name is `dmnLastDailyResetDate` (not `dmnDailyResetDate` as spec said).
- [x] 1.4 Read `apps/neurons-tw/src/lib/services/dmn-fate-card.ts` `drawDmnCard()` and identify the both-pools-exhausted branch. Note whether the function currently decrements `dmnDrawsAvailable` before returning a null / fallthrough result. **CONFIRMED correct** — L167-170 early-returns null BEFORE decrement; decrement is inside per-branch tx with `available < 1` guard (race-safe).
- [x] 1.5 Read `apps/neurons-tw/src/components/DmnDrawButton.tsx` and check the disabled-predicate logic. Note whether `dmnCards.length === 22 && allEquipmentOwned` is part of the disable condition. **DIVERGENCE FOUND** — `isComplete = status.ownedCount >= status.catalogSize` checks ONLY consumable dex; equipment ownership not considered. Also `useDmnStatus.CATALOG_SIZE = 20` is stale (actual catalog = 22 per `realign-dmn-event-rewards-to-maze`).

## 2. Code edits (only the surfaces that diverge from the tightened spec)

- [x] 2.1 If 1.1 found a live `dmnReadingTimerSubscriber` call: remove it from the per-minute side-effect chain in `reading-timer.ts`. Keep `meta['totalStudyMinutes']` increment + maze-energy faucet untouched. **NO-OP — already removed by `realign-dmn-event-rewards-to-maze`.**
- [x] 2.2 If 1.2 found the subscriber still exported but with no callers: delete the dead export from `dmn-trigger.ts`. **NO-OP — already removed.**
- [x] 2.3 If 1.3 found any of the 5 daily-meta keys using plain LWW: change the adapter to the date-gated MAX semantics. **DONE** — added `apps/neurons-tw/src/lib/sync/backfill/dmn-daily.ts` (date-gated MAX for 3 per-day counters + lexicographic MAX for `dmnLastDailyResetDate` + simple MAX for `dmnDrawsAvailable` with documented collapse limitation per spec Decision 3). Hooked into `runOnPullComplete` as Step 1e.
- [x] 2.4 If 1.4 found `drawDmnCard()` decrements before pool-exhaustion check. **NO-OP — already correct** (L167-170 returns null BEFORE any tx; tx-internal `available < 1` guard race-safe).
- [x] 2.5 If 1.4 found the consumable-exhausted-equipment-available branch falls through to a null return. **NO-OP — already correct** (`drawEquipment = wantEquipment || unownedCardCount === 0`).
- [x] 2.6 If 1.5 found the disable predicate missing the both-pools-exhausted check. **DONE** — extended `useDmnStatus` to compute `bothPoolsExhausted` from `db.dmnCards.count() + db.equipment.count()` against catalog sizes (also fixed stale `CATALOG_SIZE=20` → `DMN_CARD_CATALOG.length`). Updated `DmnDrawButton.tsx` to disable on `bothPoolsExhausted`, with tooltip「DMN 圖鑑與裝備皆已蒐集完整」.

## 3. Tests (vitest, only for behavior the apply phase actually touches)

- [x] 3.1 Reading-timer code unchanged → no test needed (existing reading-timer tests still pass).
- [x] 3.2 **DONE** — `dmn-daily-counters-merge.test.ts` (9 cases): lexicographic MAX, no-regress on older date, cross-midnight race zeroes stale local counters, same-date MAX, stale incoming ignored, draws MAX, draws date-independent, documented concurrent-consume collapse, idempotent re-apply. 9/9 pass.
- [x] 3.3 drawDmnCard unchanged → no test needed.
- [x] 3.4 Button predicate behavior is covered indirectly by the catalog-size-aware `useDmnStatus` hook returning correct `bothPoolsExhausted` flag (verified via typecheck + existing component renders). Skip dedicated component test — minimal benefit for cost.

## 4. Verification

- [x] 4.1 Run `pnpm --filter @study-rpg/neurons-tw test` — **467/467 green** (+9 new).
- [x] 4.2 Run `pnpm -r typecheck` — **clean**.
- [x] 4.3 Run `pnpm lint:dexie-fixtures` — **OK** (no `.version()` bump).
- [x] 4.4 Run `openspec validate tighten-neurons-dmn-entitlement-semantics` — **valid**.
- [ ] 4.5 Run `/opsx:verify` — deferred to user trigger.
- [ ] 4.6 Chrome MCP smoke — paused pending user decision. Button text change (`DMN 圖鑑與裝備皆已蒐集完整`) is the only end-user-visible change in this batch; predicate behavior already locked by unit-tested catalog-size logic in `useDmnStatus`. Smoke recommended but not strict blocker.

## 5. Archive

- [ ] 5.1 Confirm working tree is clean of unrelated changes per multi-agent git safety rule.
- [ ] 5.2 `/opsx:archive` — sync deltas into main `openspec/specs/neurons-mode/spec.md` + `openspec/specs/neurons-dmn-fate-cards/spec.md`.
- [ ] 5.3 Auto-git commit (explicit per-file add) with subject `spec(archive): merge tighten-neurons-dmn-entitlement-semantics — DMN entitlement semantics收斂`.
- [ ] 5.4 Push to origin/track-neurons. Merge to main left to user-driven sync per project workflow.
