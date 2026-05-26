## 1. Schema migration (Dexie v19 → v20)

- [ ] 1.1 Confirm v19 is taken by `dac4eae` retirement tombstone; pick v20 as next free slot in `apps/medexam2-hospital-tw/src/db/schema.ts`
- [ ] 1.2 Add `lastInteractionEventAt: number | null` field to `GameCountersRow` type
- [ ] 1.3 Write v20 upgrade callback: for each gameCounters row, set `lastInteractionEventAt = row.lastEventResolvedAt ?? null` (seed from old field), then `delete row.eventRollTickCounter` + `delete row.erConsultTicksUntilRoll`
- [ ] 1.4 Update fresh-save seed (`createDefaultGameCounters` or equivalent) to include `lastInteractionEventAt: null`
- [ ] 1.5 Update `clearLocalSyncTables` / `wipeLocalSyncedTables` / account-switch flows to reset `lastInteractionEventAt`

## 2. Content-pack probability constants

- [ ] 2.1 Add `EVENT_ROLL_PROBABILITY = 0.05` and `ER_ROLL_PROBABILITY = 0.035` to `packages/content-medexam2-tw/src/events.ts`
- [ ] 2.2 Export both from `packages/content-medexam2-tw/src/index.ts`
- [ ] 2.3 Add `@deprecated since @study-rpg/core@0.6.0 — interaction-based trigger replaces tick-based cadence; constant retained for external fork backwards-compat` JSDoc to `EVENT_TICK_INTERVAL` in same file
- [ ] 2.4 Add same `@deprecated` JSDoc to `EVENT_POST_RESOLUTION_COOLDOWN_MS` (statement: superseded by wall-clock cooldown `lastInteractionEventAt`; service layer passes `lastResolvedAt: null` to `rollEvent` so inner check is no-op)
- [ ] 2.5 Add same `@deprecated` JSDoc to `ER_CONSULT_TICK_INTERVAL_MIN` + `_MAX` in `packages/core/src/lib/er-consultation.ts`
- [ ] 2.6 Verify `@study-rpg/core` current version in `packages/core/package.json` (was 0.5.0 at proposal time) — bump for this change goes to 0.6.0 minor (additive deprecations + new content-pack constants don't break consumer APIs)

## 3. New service: `non-reading-event-trigger.ts`

- [ ] 3.1 Create `apps/medexam2-hospital-tw/src/services/non-reading-event-trigger.ts`
- [ ] 3.2 Implement `isInReadingSession()` — reads `db.gameCounters.get('singleton')`, returns `currentSessionStartedAt != null`
- [ ] 3.3 Implement `isInCooldown()` — same fetch, returns `Date.now() - (lastInteractionEventAt ?? 0) < 180_000`
- [ ] 3.4 Implement `isPlayerContentRoute(pathname: string): boolean` — `/`, `/quiz*`, `/leaderboard*`, `/roster*`, `/achievements*`, `/bookmarks*`. Inline comment: "新玩家內容頁記得加進來"
- [ ] 3.5 Implement `maybeRollNonReadingEvent(source: 'quiz' | 'nav')` — gate sequence: reading → cooldown → mutex → event roll (call existing `rollEvent`) → ER roll (call existing `maybeRollAndPersistERConsult`)
- [ ] 3.5a **TOCTOU mitigation** — wrap the gate-read → roll → write sequence in a single Dexie `db.transaction('rw', db.gameCounters, ...)` so concurrent hooks contend at the IDB transaction layer. Re-read `pendingEventId` + `currentSessionStartedAt` + `lastInteractionEventAt` inside the transaction (not before), and write `pendingEventId` atomically if event lands. Same for ER write (`erConsultActive`). Spec rationale: gate-time state must equal write-time state, otherwise two hooks both see "clean" state and both fire.
- [ ] 3.5b **Single-flight guard** — at module level, hold an `inFlight: Promise<void> | null` reference; `maybeRollNonReadingEvent` returns early if `inFlight !== null` (returns the existing promise so callers can still await). Cleared in `finally`. Prevents the same hook source from re-entering during async DB read.
- [ ] 3.6 Add DEV-only `globalThis.__events` debug handle: `{ getStats, resetStats }` exposing rollAttempts / eventFires / erFires / skipReadingSession / skipCooldown / skipMutex per source. Gate with `if (import.meta.env.DEV)`.
- [ ] 3.7 Verify prod build strips DEV block: `pnpm --filter @study-rpg/medexam2-hospital-tw build` → `grep -r "__events" dist/` → 0 hits

## 4. Surgical strip of event/ER roll from tick.ts (preserve auto-resolve + auto-skip)

**CRITICAL** — `tick.ts` lines 247-353 contain four interleaved concerns. Only TWO are removed; TWO must be preserved verbatim. Always re-read current line numbers before editing (may have drifted since proposal):

| Concern | Approx lines | Action |
|---|---|---|
| Malpractice auto-resolve after 24hr (`pendingEventId === 'medical-malpractice'` + age check) | 247-275 | **PRESERVE** — owner stays responsible for auto-penalty even when popup is no longer rolled by tick |
| Event roll loop (`if (eventRollTickCounter >= EVENT_TICK_INTERVAL ...)` + `rollEvent` call + toast/modal branches) | 276-319 | **REMOVE** — moves to non-reading-event-trigger service |
| ER consult auto-skip on expiry (`if (erConsultActive && isERConsultExpired ...)` + `appendERConsultLog` + clear) | 321-340 | **PRESERVE** — expiry still needs to log + clear regardless of trigger mechanism |
| ER consult tick-countdown roll (`erConsultTicksUntilRoll -= 1` + `shouldRollERConsultFlag = true` when ≤ 0 + `jitterTicksUntilNextERConsult()` reset) | 341-353 | **REMOVE** — moves to service |

- [ ] 4.1 Re-read `apps/medexam2-hospital-tw/src/lib/tick.ts` and confirm the four-section line range above still matches before editing
- [ ] 4.2 **REMOVE** event roll loop only (lines 276-319 at propose time): the `if (eventRollTickCounter >= EVENT_TICK_INTERVAL && pendingEventId === null) { ... }` block including the `let eventRollTickCounter = ...` initializer at line 253
- [ ] 4.3 **PRESERVE** malpractice auto-resolve block (lines 247-275) verbatim. It reads `pendingEventId` from counters, mutates `newReputation` + writes `eventLog` row + updates `lastEventResolvedAt`. Adjust only the local variable declarations so they don't reference the removed `eventRollTickCounter`
- [ ] 4.4 **REMOVE** ER consult roll countdown (lines 341-353 at propose time): the `erConsultTicksUntilRoll` decrement + `shouldRollERConsultFlag` signal + `jitterTicksUntilNextERConsult()` reset. Also remove the `let erConsultTicksUntilRoll = counters.erConsultTicksUntilRoll ?? 0` initializer at line 326
- [ ] 4.5 **PRESERVE** ER auto-skip on expiry (lines 321-340 at propose time) verbatim. It reads `erConsultActive` from counters + checks `isERConsultExpired(active, now)` + writes `appendERConsultLog({resolution: 'auto-skipped', ...})` + clears `erConsultActive`. Keep the `let erConsultActive = counters.erConsultActive ?? null` initializer
- [ ] 4.6 Remove now-unused imports from tick.ts: `EVENT_TICK_INTERVAL`, `rollEvent`, `jitterTicksUntilNextERConsult`. Keep `isERConsultExpired`, `appendERConsultLog`, `MALPRACTICE_AUTO_RESOLVE_MS`, `MALPRACTICE_PENALTY_REP`, all malpractice-resolve-related imports
- [ ] 4.7 Remove `shouldRollERConsult` field from `TickResult` type + remove `maybeRollAndPersistERConsult` post-tick callback in `useStudySessionTick` (since tick no longer signals roll-needed)
- [ ] 4.8 Update `onModalEvent` / `onToastEvent` / `onERConsultTriggered` callback wiring — preserve callbacks for *resolution* events (malpractice auto-resolve still fires onToastEvent / similar) but new *roll* events fire from `maybeRollNonReadingEvent` directly into UI via Dexie liveQuery on `pendingEventId` / `erConsultActive` (no callback needed since modals already liveQuery)
- [ ] 4.9 Verify `runTick` after edit: should handle revenue / reputation / studyMinutes accumulation + cap detection + tier upgrade + malpractice auto-resolve + ER auto-skip on expiry. NO event/ER rolling.
- [ ] 4.10 Run `pnpm -r typecheck` — expect clean

## 5. Hook A — wire quiz answer commits

- [ ] 5.1 In `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`, after the answer commit + reward write completes (but before modal close), import + call `maybeRollNonReadingEvent('quiz').catch(err => console.error('[non-reading-trigger]', err))`
- [ ] 5.2 In `apps/medexam2-hospital-tw/src/services/er-consultation.ts` `answerERConsult` — same pattern: after writing reward + clearing `erConsultActive`, call `maybeRollNonReadingEvent('quiz')` (note: cooldown gate will likely skip the immediate re-roll due to `lastInteractionEventAt = now`)
- [ ] 5.3 Grep for other quiz-answer entry points: `grep -rn "recordCorrectAnswer\|recordWrongAnswer" apps/medexam2-hospital-tw/src/` — for each call site where a quiz answer is being committed (mentor / training / etc), wire the same hook
- [ ] 5.4 Document the canonical hook pattern in `services/non-reading-event-trigger.ts` JSDoc header so future quiz sources know to add the hook

## 6. Hook B — wire route navigation

- [ ] 6.1 In `apps/medexam2-hospital-tw/src/App.tsx`, import `useLocation` from react-router-dom
- [ ] 6.2 Inside the routed component (the one rendered inside `<HashRouter>`), add `const location = useLocation()` and a `useRef<string | null>(null)` for `prevPathRef`
- [ ] 6.3 Add `useEffect` with dep `[location.pathname]`: skip on initial mount (`prevPathRef.current === null`), skip if same path, otherwise call `maybeRollNonReadingEvent('nav')` if `isPlayerContentRoute(location.pathname)`
- [ ] 6.4 Inline comment on the whitelist call: "When adding new player-content routes, also add to `isPlayerContentRoute` in `services/non-reading-event-trigger.ts`"

## 7. Resolve handlers — write `lastInteractionEventAt`

- [ ] 7.1 In `apps/medexam2-hospital-tw/src/services/event.ts`, in each resolve function (`resolveMalpractice`, `resolveVIP`, `resolveEmergency`, `resolveAudit`), update the `db.gameCounters.put` payload to include `lastInteractionEventAt: Date.now()` alongside existing `lastEventResolvedAt`
- [ ] 7.2 Same for toast event auto-resolve paths (negative-news, peer-criticism, research-award) — find their resolution sites (probably inside `rollEvent` toast branch or a service helper)
- [ ] 7.3 Same for medical-malpractice 24-hr auto-resolve path (currently in tick.ts; after step 4, this path may have moved — verify location)
- [ ] 7.4 In `services/er-consultation.ts`, update `answerERConsult` / `skipERConsult` to write `lastInteractionEventAt: Date.now()` in the `db.gameCounters.put` payload alongside the `erConsultActive: null` write
- [ ] 7.5 Same for the ER consult expiry path (if any code path other than dialog-close clears expired consult)

## 8. Vitest unit tests

- [ ] 8.1 New test file `apps/medexam2-hospital-tw/src/__tests__/non-reading-event-trigger.test.ts`
- [ ] 8.2 Test: `isInReadingSession` returns true when `currentSessionStartedAt` non-null, false otherwise
- [ ] 8.3 Test: `isInCooldown` returns true within 3 min of `lastInteractionEventAt`, false after
- [ ] 8.4 Test: `isPlayerContentRoute` whitelist — assert `/`, `/hospital`, `/leaderboard`, `/roster`, `/achievements`, `/bookmarks`, `/fate-cards` → true; `/study`, `/training`, `/onboarding`, `/settings`, `/help`, `/unknown` → false. Also test `/leaderboard?tab=foo` → true (query string stripped).
- [ ] 8.5 Test: `maybeRollNonReadingEvent` skips at reading session gate (uses fake `db.gameCounters`)
- [ ] 8.6 Test: `maybeRollNonReadingEvent` skips at cooldown gate
- [ ] 8.7 Test: `maybeRollNonReadingEvent` skips at mutex gate (`pendingEventId` non-null)
- [ ] 8.8 Test: `maybeRollNonReadingEvent` calls `rollEvent` when all gates pass and `Math.random() < EVENT_ROLL_PROBABILITY` (mock `Math.random`)
- [ ] 8.9 Test: ER roll second — when `rollEvent` lands an event and writes `pendingEventId`, the subsequent `maybeRollAndPersistERConsult` skips its internal mutex
- [ ] 8.10 Test: resolve handlers write `lastInteractionEventAt` (assert on each of 4 modal resolvers + ER answer + ER skip + ER expiry path)
- [ ] 8.11 Test: **TOCTOU race** — invoke two `maybeRollNonReadingEvent` calls back-to-back without awaiting (race the async DB reads). Assert at most one event/ER lands (mutex `pendingEventId !== null` prevents second write). Use fake timers + manual Promise scheduling
- [ ] 8.12 Test: **Tick preservation — malpractice auto-resolve** — set `pendingEventId = 'medical-malpractice'` with `pendingEventTriggeredAt` 25hr ago, run tick, assert `eventLog` row added with `outcome: 'auto-resolved-penalty'` + `pendingEventId` cleared + `newReputation` decremented (or floored to 0). Verifies §4.3 preservation
- [ ] 8.13 Test: **Tick preservation — ER auto-skip** — set `erConsultActive` with `triggeredAt` past expiry threshold, run tick, assert `erConsultLog` row added with `resolution: 'auto-skipped'` + `erConsultActive` cleared. Verifies §4.5 preservation
- [ ] 8.14 Test: **Cooldown unification** — set `lastEventResolvedAt = 0` (very old) but `lastInteractionEventAt = Date.now() - 60_000` (1 min ago). Assert `maybeRollNonReadingEvent` skips at cooldown gate (uses new wall-clock field only, not old session-time field). Conversely set `lastInteractionEventAt = 0` + `lastEventResolvedAt = Date.now() - 30_000` → assert NOT skipped (old field ignored by new gate)
- [ ] 8.15 Test: **`/study` exclusion regardless of session state** — render App.tsx in test harness with `MemoryRouter initialEntries={['/leaderboard']}`, navigate to `/study` programmatically with `currentSessionStartedAt === null`, assert `maybeRollNonReadingEvent` NOT called (spy on the function). Then with `currentSessionStartedAt !== null`, same assertion. Same outcome both states.
- [ ] 8.16 Run: `pnpm --filter @study-rpg/medexam2-hospital-tw test non-reading-event-trigger` — expect green

## 9. Chrome MCP smoke tests (post-build)

- [ ] 9.1 `pnpm --filter @study-rpg/medexam2-hospital-tw build && pnpm --filter @study-rpg/medexam2-hospital-tw preview` on local
- [ ] 9.2 Smoke A — reading session immunity: open `/study`, start reading session, wait 30s while clicking around — assert 0 modal/dialog popup
- [ ] 9.3 Smoke B — page nav fires (eventually): force `EVENT_ROLL_PROBABILITY = 1.0` temporarily, navigate `/leaderboard` → `/roster` → `/achievements` → assert event modal appears
- [ ] 9.4 Smoke C — cooldown blocks: resolve an event (or set `lastInteractionEventAt = Date.now()`), navigate immediately to another player-content page — assert no new popup; wait 3+ min, navigate again — assert popup possible
- [ ] 9.5 Smoke D — mutex blocks: with `pendingEventId` set, navigate to player-content page — assert no double-popup
- [ ] 9.6 Smoke E — DEV stats: in DEV mode, `globalThis.__events.getStats()` returns counters incrementing on each hook call
- [ ] 9.7 Smoke F — whitelist: navigate to `/settings` while non-reading — assert no popup
- [ ] 9.8 Restore `EVENT_ROLL_PROBABILITY` to 0.05 before final commit

## 10. Regression check vs `dac4eae` retirement tombstone

- [ ] 10.1 Verify no overlap: `git diff main...HEAD -- apps/medexam2-hospital-tw/src/lib/sync/` is empty (sync code not touched by this change)
- [ ] 10.2 Verify retirement reconcile still runs at engine startup: open Chrome MCP, sign in, retire a doctor, refresh — doctor stays retired, no resurrection
- [ ] 10.3 Verify R2 push monotonic guard still works: localStorage poison m2 bundle SV to 999, observe push refused with exact error message (per `dac4eae` Chrome MCP smoke notes)
- [ ] 10.4 Verify Dexie upgrade v19 → v20 doesn't conflict with v18 → v19 retirement table creation — open prod build with pre-existing v19 save (retirement tombstone applied), confirm v20 upgrade runs only the new fields delta

## 11. Documentation & cleanup

- [ ] 11.1 Update `apps/medexam2-hospital-tw/src/lib/tick.ts` JSDoc header to remove mention of event/ER rolling
- [ ] 11.2 Update CLAUDE.md (project root) Architecture pointers table — if it references tick.ts event handling, point to new service instead
- [ ] 11.3 Update `openspec/project.md` Roadmap entry for this change (move from in-progress to shipped post-archive)
- [ ] 11.4 Add inline doc to `services/non-reading-event-trigger.ts` explaining the 3-gate sequence + future calibration knobs

## 12. Verify & archive

- [ ] 12.1 Run `pnpm -r typecheck` — expect clean
- [ ] 12.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw test` — full suite green (no regression in retirement-tombstone, mastery, bookmarks-filter, question-history-merge, achievement, etc.)
- [ ] 12.3 Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` — clean prod build
- [ ] 12.4 Run `openspec validate rewire-hospital-events-to-non-reading-trigger --strict` — green
- [ ] 12.5 Run `/opsx:verify` (3-dim: completeness / correctness / coherence) — green
- [ ] 12.6 Multi-agent git safety: `git status` + `git diff --cached --name-status` clean before any commit; explicit `git add <file>` per file
- [ ] 12.7 Owner confirm + `/opsx:archive` (merges delta into main `specs/hospital-events/spec.md` + `specs/er-consultation/spec.md`)
- [ ] 12.8 Post-archive: 14 day dogfood window; collect `__events.getStats()` snapshots to inform probability tuning. If event rate feels wrong, adjust constants in content-pack (no spec change needed).
