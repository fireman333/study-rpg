## Context

M2's last unshipped scope item is **daily streak** — a habit-formation hook that converts "I tried this once" into "I open it every day". The reward primitives (`REWARD` table, `applyXp`, `addStat`, `newPlayer`) are locked by `engine-rewards`, and the reading-tick + quiz-settle code paths through which streak credit flows are stable. Persistence already serializes the whole `Player` snapshot to IndexedDB and to portable JSON export, so adding three numeric/string fields to `Player` is a thin extension rather than a refactor.

The owner is in Taiwan (UTC+8), is dogfooding for himself in 2026 H2 before the first-stage exam, and has no cross-timezone users yet — M4's planned Supabase sync is when cross-timezone correctness becomes a real concern. For M2, "the calendar day" means "the UTC+8 calendar day, computed in the browser".

The integrity guard for reading-time is already in place (`visibilitychange` pause + 90s idle pause), so a minute spent with the tab hidden does not feed the streak threshold. The same guard implicitly protects the streak.

## Goals / Non-Goals

**Goals:**

- Ship a behavioral hook that gives the player a visible, daily reason to open the app.
- Reuse existing reward + persistence + UI primitives — no new architectural concept.
- Keep the engine API surface stable for forks: streak fields are additive on `Player`; forks that ignore them keep working.
- Have a clean migration path for the one save-file `schemaVersion` bump (v1 → v2) so existing dogfood saves don't break.

**Non-Goals:**

- Weekly streak / monthly badges / streak insurance / streak freeze tokens. (Later M5 if dogfood shows it's needed.)
- Cross-device / cross-timezone streak. (M4 once Supabase lands.)
- Server-side anti-clock-tampering. (Dogfood is owner-only; not a real attack surface yet.)
- Retroactive streak credit from saved attempts before this change ships. (Old check-in history is lost; first day after deploy is day 0.)

## Decisions

### Decision 1: UTC+8 calendar day, computed in the browser

**Choice**: Format the `today` string via `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })` (gives ISO `YYYY-MM-DD`).

**Alternatives considered**:

- `Date.toISOString().slice(0, 10)` — gives UTC, off by 8 hours, would let a 23:30-UTC reading session count toward "tomorrow" in Taiwan time. Rejected.
- Server timestamp — there is no server. Rejected.
- Local browser timezone — works for owner in Taiwan, breaks once a non-Taiwan fork user joins. Hard-coding `Asia/Taipei` makes the assumption explicit and centralizes the eventual M4 fix to one helper.

**Rationale**: Owner is the only dogfooder for the foreseeable future. Hard-coding `Asia/Taipei` is more honest than pretending we support arbitrary timezones today.

### Decision 2: Check-in threshold = `5 reading-minutes OR 5 questions`

**Choice**: Either path crossing 5 marks the day. Identical thresholds on both paths.

**Alternatives considered**:

- 1 minute / 1 question — too easy to grind a "fake streak" with a 90-second open-tab habit. Rejected.
- 15 minutes / 10 questions — high friction for a player who only has time for a quick quiz round on a busy day. Rejected.
- Different thresholds per path (e.g. 10 min reading vs 5 questions) — extra cognitive load on the player to understand why "I read for 6 minutes" didn't count today. Rejected.

**Rationale**: 5 minutes of focused reading or 5 answered questions is the minimum that feels like "I actually did something today". Round number, easy to mention in UI later if we surface progress ("3/5 questions today to hold your streak").

### Decision 3: Multiplier formula `1 + 0.05·min(streak, 10)` capped at +50%

**Choice**: Linear ramp from ×1.00 (day 0) to ×1.50 (day 10), flat thereafter.

**Alternatives considered**:

- Geometric (e.g. `1.05^streak`) — explodes at long streaks (day 30 ≈ ×4.3). Rewards hardcore players exponentially. Rejected.
- Higher cap (e.g. +100%) — doubles EXP curve at long streaks; misbalances levelling. Rejected.
- Step function (e.g. +10% per week) — fewer visible touchpoints, less satisfying day-to-day. Rejected.

**Rationale**: Players see a daily bump (visible motivation), the cap prevents runaway power, and the formula slot is conservative enough that mid-dogfood telemetry can re-tune the coefficient without breaking other parts of the engine.

### Decision 4: Multiplier applies to reading-per-minute and quiz-correct XP only

**Choice**: Reading XP × multiplier, quiz-correct XP × multiplier. Boss XP, quiz-wrong XP, fast-answer / SRS stat-only entries, and `subjectXp` all unchanged.

**Alternatives considered**:

- Multiply everything including boss — compounds gacha-tier variance: a +50% multiplier on a 200-XP annual-boss pass is +100 XP, which is more than two full levels at low player level. Rejected.
- Multiply nothing, just show the chip as cosmetic — no behavioral hook beyond a number going up. Rejected (defeats the point).
- Multiply only quiz-correct, not reading — reading is the longer-engagement path; punishing the slower habit reward feels wrong. Rejected.

**Rationale**: The two "you grinded normally today" paths get the bump. Boss is a gated event with its own designed jump and shouldn't compound. `subjectXp` stays untouched to keep the content-pack contract simple — fork authors don't have to think about a multiplier on per-subject curves.

### Decision 5: `applyCheckIn` is a pure helper, not a store-side action

**Choice**: New module `packages/core/src/lib/streak.ts` exporting pure functions (`applyCheckIn`, `getStreakMultiplier`, `getTaipeiToday`, `getTaipeiYesterday`). The reward-pipeline call site (the same place that currently invokes `applyXp` / `addStat`) calls `applyCheckIn` and gets back a new player.

**Alternatives considered**:

- Make it a method on a store action that mutates state — inconsistent with the existing pure-helper convention (`applyXp`, `addStat`, `newPlayer`), and harder to unit-test. Rejected.
- Combine streak update + XP grant into one mega-helper — couples two concerns. Rejected.

**Rationale**: Matches the established `applyXp` / `addStat` pattern; trivial to unit test; the store-binding code stays in `apps/medexam-tw/` instead of leaking into `packages/core/`.

### Decision 6: Streak multiplier evaluated AFTER `applyCheckIn` increments streak

**Choice**: Within a single reward call where the player crosses today's threshold, `applyCheckIn` runs first (so `currentStreak` becomes 1 or N+1), then `getStreakMultiplier(player.currentStreak)` is read.

**Alternatives considered**:

- Multiplier from the streak value BEFORE the check-in — means the very tick that earns the player today's streak grants 0 bonus. Feels off ("I just hit my streak and got nothing extra").
- Multiplier from the streak value AFTER — the threshold-crossing tick already feels the bonus. More satisfying.

**Rationale**: The threshold-crossing tick should "feel different". Order documented as part of the requirement so future maintainers don't accidentally swap it.

### Decision 7: `schemaVersion` bumps to `2` at export/import boundary only

**Choice**: IndexedDB stores the live `Player` object directly via Dexie (no per-record version field today). The `schemaVersion` lives only in the export/import JSON envelope. Bumping that to `2` is sufficient to mark the breaking shape change.

**Alternatives considered**:

- Add per-Dexie-record `__version` field — overkill; Dexie itself versions the database, but the `Player` interface is in-app schema. Rejected.
- Hold export at v1 with optional streak fields — clouds the contract; forks reading our schema would see "what does v1 mean?". Rejected.

**Rationale**: One boundary, one bump. Migration is a tiny defaulting step (`currentStreak = 0`, `longestStreak = 0`, `lastCheckInDate = undefined`) so silent forward migration is appropriate — no user-visible loss.

### Decision 8: Soft break-day toast, not modal

**Choice**: When the first interaction of a new UTC+8 day finds `currentStreak` about to reset (yesterday was not checked in, but `currentStreak` was > 0 before this check), show a toast `昨日斷簽，今天從 1 開始`. Use the existing toast queue. No red, no shame.

**Alternatives considered**:

- Modal — blocks the player, feels punishing. Rejected.
- Silent (don't tell the player) — confusing when they look at the chip and see "1" after a long run. Rejected.
- Red / negative copy — the goal is habit reinforcement, not punishment. Rejected.

**Rationale**: Acknowledge the break, frame it as a fresh start. Consistent with the no-blame design of the rest of the app.

## Risks / Trade-offs

- **Risk: System clock manipulation lets a player fake a streak** → Mitigation: dogfood is owner-only; M4 server-side sync will be the real defense. Document this as a known limitation, not a bug.

- **Risk: Day-roll-over off-by-one (player checks in at 23:59 Taipei time, then opens at 00:01 and the streak fails to increment)** → Mitigation: timezone arithmetic centralized in `getTaipeiToday()` / `getTaipeiYesterday()` with unit tests around the midnight boundary. Test cases: `2026-05-15 23:59 → today = 2026-05-15`; `2026-05-16 00:00 → today = 2026-05-16, yesterday = 2026-05-15`.

- **Risk: Reading-minute tick credit drifts away from the integrity guard** → Mitigation: the same tick that grants `REWARD.readPerMinute` is the one that feeds the streak threshold counter. Both go through the existing pause-aware reading-loop pipeline; no second code path that streak could use to bypass the guard.

- **Risk: Multiplier math off-by-one (e.g. `min(streak, 10)` accidentally written as `min(streak - 1, 10)`)** → Mitigation: explicit scenarios in spec for day 1, day 10, day 11, day 99.

- **Risk: V1 save-file users see "0 longest streak" after migrating, can't tell whether they had a streak before** → Trade-off: accepted. The old data didn't track streak; nothing to migrate. UI can phrase the chip on a freshly-migrated v1 save the same way it phrases a brand-new player.

- **Risk: Player travels across timezones during a streak** → Trade-off: M2 doesn't solve this. Hard-coded Asia/Taipei means a Taiwan player on a US trip might "lose" a day. Document for M4.

- **Risk: Quiz-correct XP bonus pushes faster levelling than balance budget anticipated** → Mitigation: cap at +50%; dogfood week of telemetry; if the level curve looks off, tune the coefficient (not the cap) in a follow-up change.

## Migration Plan

Step ordering — keep PR commits small and reversible:

1. **Type & helper** (`packages/core/src/types.ts`, `packages/core/src/lib/streak.ts` new). Add the three fields to `Player`. Implement `applyCheckIn`, `getStreakMultiplier`, `getTaipeiToday`, `getTaipeiYesterday` with unit tests covering all spec scenarios.
2. **Constructor** (`packages/core/src/lib/xp.ts`). Update `newPlayer` to init streak fields.
3. **Reward pipeline** (call sites in `packages/core/src/lib/applyReward.ts` or wherever `REWARD.readPerMinute` / `REWARD.quizCorrect` are consumed). Wire `applyCheckIn` before multiplier; apply `getStreakMultiplier(player.currentStreak)` to the two qualifying paths.
4. **Persistence** (`apps/medexam-tw/`). Bump `schemaVersion` in export. Add v1 migration in import. Existing IndexedDB records are tolerant to the new fields (the live Dexie store has no strict schema for the Player blob).
5. **UI** (`apps/medexam-tw/src/components/StreakChip.tsx` new; mount in `Home.tsx`). Pull `currentStreak` from store, render `🔥 N 天`. When N is 0 or the player has never checked in, render `🔥 從今天開始`.
6. **Break-day toast**. On mount, compare `lastCheckInDate` to `getTaipeiToday()`; if more than 1 day apart and `currentStreak` had been > 0 (snapshot stored once per session in a small "pending toast" state), enqueue the soft toast.
7. **Smoke**:
   - Unit tests for the helpers (Jest / Vitest, whichever the repo uses)
   - Manual: mock the clock via Dexie inspection + a debug menu (or just `localStorage.clear()` and replay)
   - Chrome MCP: dev smoke on `/` (chip renders, multiplier visible in next XP gain). Then **prod** smoke per the SPA-route hard rule: direct URL `/skills` etc. must still 200 after deploy.

**Rollback**: if the multiplier balance is wrong post-dogfood, revert the multiplier call site only; leave streak tracking intact (it's harmless on its own). Worst-case full rollback: revert the change; saves that exported under v2 can be re-imported by a v2-aware build later, or imported as v1 by stripping the three fields.

## Open Questions

- Reward pipeline actually has a single centralized `applyReward` helper today, or are reading-tick and quiz-settle calling `applyXp` + `addStat` directly from app-side code? If the latter, step 3 needs a small extraction commit first (or the multiplier wiring lives at the two app-side call sites). Will confirm during implementation; doesn't affect spec.
- Visual treatment of the chip at `currentStreak === 0` — `🔥 從今天開始` vs hiding entirely. Default to showing it (per design.md step 5) but open to UX feedback once chip is on screen.
- Whether to surface `longestStreak` anywhere in M2 UI, or hold for M5 ("achievements" page). Default: hold. Field is persisted now so M5 can read it without a follow-up data change.
