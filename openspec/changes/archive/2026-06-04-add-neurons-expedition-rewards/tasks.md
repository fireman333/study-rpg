## 1. Constants — milestone table in content-neurons-tw (no sync coupling)

- [x] 1.1 In `packages/content-neurons-tw/src/dmn-types.ts`: remove `DMN_TIME_AXIS_MINUTES_PER_DRAW` + `DMN_TIME_AXIS_DAILY_CAP`; add `DmnExpeditionMilestone { pct; min; max }` + `DMN_EXPEDITION_MILESTONES = [{pct:0.25,min:3,max:15},{pct:0.50,min:6,max:30}]` + `DMN_EXPEDITION_DAILY_CAP = DMN_EXPEDITION_MILESTONES.length`. Doc-comment them as dogfood-tunable game-loop numbers (per-session %-with-clamp).
- [x] 1.2 In `packages/content-neurons-tw/src/index.ts`: update the export barrel (drop old consts, export milestone table + type + cap).
- [x] 1.3 Update `DmnMetaSnapshot` doc comment to note the `dmnTimeAxisMinutesAccrued` field now carries cumulative expedition clears today (legacy field name kept stable; no rename).
- [x] 1.4 Rebuild the package (`pnpm --filter @study-rpg/content-neurons-tw build`) so `apps/neurons-tw` sees the new exports.

## 2. dmn-trigger.ts — per-session expedition-draw credit

- [x] 2.1 Replace `accrueReadingMinutes(deltaMinutes)` with `creditExpeditionDraws(pool: number, cleared: number)`: inside a `db.meta` rw tx, run `maybeRunDailyReset`, count milestones met (`cleared >= clamp(round(m.pct*pool), m.min, m.max)`), grant `min(metCount, DMN_EXPEDITION_DAILY_CAP - consumedToday)` → bump `dmnDrawsAvailable` + `dmnTimeAxisDrawsConsumedToday`; also add `cleared` to `dmnTimeAxisMinutesAccrued` (cumulative clears today, display only). Return granted count; `console.info` after commit.
- [x] 2.2 Add a small `clamp(round(...))` helper (or inline) — no new dep.
- [x] 2.3 Remove the now-orphaned `ReadingTimerSubscriber` interface + `dmnReadingTimerSubscriber` export + `accrueReadingMinutes`.
- [x] 2.4 Add a LOUD comment at the `META_KEYS.timeMinutes` / `timeDrawsToday` definitions: names are legacy-stable, now store expedition clears / expedition draws (per design D5).
- [x] 2.5 Keep `readDmnMeta` / `maybeRunDailyReset` / behavior-axis grant + boot listeners unchanged.

## 3. reading-timer.ts — decouple from DMN

- [x] 3.1 Remove the `import { dmnReadingTimerSubscriber } from './dmn-trigger'` and its call in `fireMinuteSideEffects`.
- [x] 3.2 Confirm `incrementTotalStudyMinutes` + `accrueReadingEnergyAllBranches(READING_ENERGY)` remain (reading still fuels 累積閱讀 + maze energy).

## 4. expedition.ts + OverviewPage — wire the grant

- [x] 4.1 In `expedition.ts`: replace the `onExpeditionComplete` no-op body with a best-effort call to `creditExpeditionDraws(session.total, session.correct)` (try/catch, channel `[expedition-reward]`, never throws out of close). Update the function's doc comment (no longer a no-op seam).
- [x] 4.2 In `OverviewPage.tsx`: confirm the existing `onComplete={onExpeditionComplete}` wiring still type-checks (async-ify the handler if needed); no UI restructure.

## 5. UI copy — reading-minutes → expedition clears

- [x] 5.1 Update `DmnDrawButton` + `DmnDrawProgressRing` empty-draw tooltip / progress copy: "閱讀 30 分 → 抽" becomes "出征清除錯題達門檻 → 抽"（每場清掉約 25%/50% 目前錯題即 +1 抽，每日 2 抽）. Ring may show 今日累積清除數 from `dmnTimeAxisMinutesAccrued`.
- [x] 5.2 Update `HelpMenu` + `HomepageOnboarding` DMN-draw explanation copy to the expedition-clears framing.
- [x] 5.3 Scan `OverviewPage` + `LeaderboardPage` for any time-axis / reading-minute draw copy and update.

## 6. Tests (Vitest — no fixture lint, no Dexie bump)

- [x] 6.1 `__tests__/expedition.test.ts`: `onExpeditionComplete` now accrues `correct` as clears (best-effort); assert it does not throw on a forced accrual error and is a no-op on zero correct.
- [x] 6.2 `__tests__/dmn-trigger-counters.test.ts`: repurpose time-axis-minute tests into `creditExpeditionDraws(pool, cleared)` — 25% milestone (pool 40 / cleared 12 → 1 draw), 50% milestone (cleared 20 → 2 draws), small-backlog floor (pool 8 / cleared 2 → 0), large-backlog ceiling (pool 300 / cleared 15 → 1), daily cap across sessions, carryover of unused draws, daily-reset zeroes clears + consumed counters.
- [x] 6.3 `__tests__/reading-timer.test.ts`: assert reading no longer calls the DMN subscriber (still increments `totalStudyMinutes` + maze energy).
- [x] 6.4 Run `pnpm --filter @study-rpg/neurons-tw test` — all green.

## 7. Verify + sync hygiene

- [x] 7.1 `pnpm -r typecheck` clean; confirm no dangling references to removed `DMN_TIME_AXIS_*` / `ReadingTimerSubscriber` / `dmnReadingTimerSubscriber`.
- [x] 7.2 Confirm `SYNCED_META_KEYS` (tables.ts) + R2 `SCHEMA_VERSION` (bundles.ts, =12) are UNTOUCHED; confirm no `.version()` bump in any `db.ts` (dexie-fixture-lint not triggered).
- [x] 7.3 Chrome MCP smoke: trigger an expedition, clear ≥ N wrong-questions, confirm DMN draw count increments + draw button enables; confirm reading a few minutes does NOT increment DMN draws but does advance maze energy + 累積閱讀.
- [x] 7.4 Update `openspec/project.md` Roadmap with the M_3rd ext row for `add-neurons-expedition-rewards` (the single expected parallel-session conflict line).
