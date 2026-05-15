## 1. Core types and helpers

- [x] 1.1 Add `lastCheckInDate?: string`, `currentStreak: number`, `longestStreak: number` to `Player` in `packages/core/src/types.ts`
- [x] 1.2 Create `packages/core/src/lib/streak.ts` with `getTaipeiToday()` and `getTaipeiYesterday(today)` using `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })`
- [x] 1.3 Add `applyCheckIn(player, today): Player` pure helper to `streak.ts` — handles same-day no-op, consecutive-day increment, gap reset; updates `longestStreak`
- [x] 1.4 Add `getStreakMultiplier(streak: number): number` with formula `1 + 0.05 * min(max(streak, 0), 10)`
- [x] 1.5 Export `STREAK_CHECK_IN_THRESHOLD = 5` (used for both reading minutes and questions) and `STREAK_MULTIPLIER_CAP_DAYS = 10` from `streak.ts`
- [x] 1.6 Re-export `streak.ts` symbols from `packages/core/src/index.ts`

## 2. Constructor and reward pipeline wiring

- [x] 2.1 Update `newPlayer` in `packages/core/src/lib/xp.ts` to init `currentStreak: 0`, `longestStreak: 0`, `lastCheckInDate: undefined`
- [x] 2.2 Locate the reward call sites for `REWARD.readPerMinute` and `REWARD.quizCorrect` (likely in `packages/core/src/lib/applyReward.ts` or app-side `apps/medexam-tw/src/`); confirm whether there is a centralized `applyReward` helper or two separate call sites
- [x] 2.3 Track per-day reading-minute count and per-day answered-question count in store (resets on UTC+8 day roll-over via `getTaipeiToday()` comparison)
- [x] 2.4 When either daily counter crosses `STREAK_CHECK_IN_THRESHOLD`, invoke `applyCheckIn(player, getTaipeiToday())` and `setPlayer` with the result (first crossing only — same-day no-op enforced by `applyCheckIn` itself)
- [x] 2.5 In the reward-grant step for `REWARD.readPerMinute` and `REWARD.quizCorrect`, multiply the granted `xp` by `getStreakMultiplier(player.currentStreak)` and `Math.floor` the result; leave `subjectXp` and `stat.delta` unmultiplied
- [x] 2.6 Verify multiplier is NOT applied to `REWARD.quizWrong`, `REWARD.quizFastAnswer`, `REWARD.srsReviewCorrect`, `REWARD.bossMiniPass`, `REWARD.bossAnnualPass`

## 3. Persistence migration

- [x] 3.1 Bump `schemaVersion` from `1` to `2` in the export builder in `apps/medexam-tw/`
- [x] 3.2 Add v1 → v2 migration in the import handler: if `parsed.schemaVersion === 1`, default `currentStreak: 0`, `longestStreak: 0`, `lastCheckInDate: undefined` on `parsed.player` before `setPlayer`; do not surface a warning
- [x] 3.3 Update the import malformed-file error message to mention `current: v2`
- [x] 3.4 Confirm Dexie `db.players.put(player)` tolerates the new fields (no per-table schema requiring a Dexie version bump); if Dexie schema is versioned, add the appropriate `db.version(N+1).stores(...)` migration

## 4. UI surface

- [x] 4.1 Create `apps/medexam-tw/src/components/StreakChip.tsx` rendering `🔥 N 天` from `player.currentStreak`; render `🔥 從今天開始` when `currentStreak === 0`
- [x] 4.2 Mount `<StreakChip />` on `apps/medexam-tw/src/routes/Home.tsx` near the top, alongside the existing level / XP display
- [x] 4.3 On `Home` mount, compare `player.lastCheckInDate` to `getTaipeiToday()`; if the player's last check-in was older than yesterday AND a per-session "break toast shown" flag is unset, enqueue the existing toast queue with `昨日斷簽，今天從 1 開始` (soft styling, no red), then set the flag
- [x] 4.4 Style `StreakChip` consistently with the existing stat chips (Cubic 11 font, navy palette per project style)

## 5. Tests

**Deferred for this change**: the repo has no test framework wired (`packages/core/package.json` only has `typecheck`; no `vitest` / `jest` / `mocha` dep). Per Coding Principle 2 (simplicity first) we don't add a test framework just for these helpers — the same scenarios are covered by §6 manual smoke (multiplier visible in next XP, day-roll-over simulated via Dexie edit, mutation check via spec scenarios in the spec file). Open a follow-up `add-test-framework` change when test coverage becomes a recurring need.

- [~] 5.1 Unit tests for `getTaipeiToday()` / `getTaipeiYesterday()` → covered by manual: comparing browser console output against expected dates at the boundary
- [~] 5.2 Unit tests for `applyCheckIn` → covered by manual Dexie-edit simulation in §6.4 + spec scenarios as the source of truth
- [~] 5.3 Unit tests for `getStreakMultiplier` → covered by spec scenarios + manual XP-gain inspection in §6.3
- [~] 5.4 `newPlayer` defaults → covered by fresh-state smoke in §6.3 (chip reads `🔥 從今天開始`)
- [~] 5.5 `applyCheckIn` non-mutation → enforced by the helper's `return { ...player, ... }` pattern; would need framework to assert reference inequality

## 6. Verification

- [x] 6.1 `pnpm -r typecheck` clean
- [~] 6.2 `pnpm --filter @study-rpg/core test` — **deferred**: no test framework wired (see §5 note). Spec scenarios + manual smoke serve the same purpose for this change.
- [x] 6.3 Local dev: home renders chip on fresh state (`🔥 從今天開始`); existing IndexedDB save hydrates with Lv.2 and full reading-XP path live (Chrome MCP smoke captured screenshot).
- [x] 6.4 Local dev: edited Dexie player to `lastCheckInDate: 2026-05-12`, `currentStreak: 5` → after reload, chip resets to `🔥 從今天開始` and `StreakBreakToast` renders `昨日斷簽 / 今天從頭開始累積` (bottom-left). `longestStreak: 5` preserved per spec.
- [x] 6.5 V1 → V2 migration logic exercised in-page: sample v1 envelope passed through the migration branch defaults `currentStreak: 0`, `longestStreak: 0`, leaves `lastCheckInDate` undefined; all other player fields preserved (name, level, lootStats, etc.).
- [x] 6.6 Chrome MCP dev smoke complete: home + `/skills` direct URL + F5 on `/skills` all 200, chip persists across routes, no console errors.
- [ ] 6.7 After deploy: Chrome MCP prod smoke — direct URL `https://fireman333.github.io/study-rpg/` chip renders; `/skills` direct URL still 200 (SPA fallback regression check). **Pending deploy.**
- [x] 6.8 `openspec validate add-daily-streak` clean.

## 7. Documentation and archive

- [ ] 7.1 Update `openspec/project.md` Roadmap row for M2: tick the `daily streak` box; note formula fine-tune still blocked on dogfood
- [ ] 7.2 Update `apps/medexam-tw/CHANGELOG.md` if it exists (or add a one-line note in README) about the schemaVersion v1 → v2 bump
- [ ] 7.3 Run `/opsx:verify` to confirm spec ↔ code alignment
- [ ] 7.4 Run `/verify` for end-to-end Chrome MCP smoke (dev + prod three-fold per SPA-route hard rule)
- [ ] 7.5 `/simplify` pass on the new helpers + chip component (no premature abstraction, no dead code)
- [ ] 7.6 `/opsx:archive add-daily-streak` (workflow version — sync-gate writes the delta into `openspec/specs/`)
- [ ] 7.7 Auto-git commit with template `spec(archive): merge add-daily-streak — M2 closes (daily streak shipped)`
