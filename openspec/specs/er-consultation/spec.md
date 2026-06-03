# er-consultation Specification

## Purpose

隨機急診照會 — 在唸書 session 期間每 6-10 分鐘 in-game time 隨機跳出「冷門科別」考古題給玩家作答。Anti-偏食 nudge：權重式 selector（recency 0.6 + mastery 0.3 + jitter 0.1，7 天 ≥ 3 次 cooldown 0.3×）+ 30 天答題排除 picker。答對 1.8× revenue + reputation reward；skip / auto-skip / wrong 全進 telemetry。Settings toggle 預設 ON（meta table，per-device）。NPC sprite 男女 50/50 random pick（DEI parity）。

## Requirements

### Requirement: ER consultation SHALL trigger probabilistically during active sessions with idle/cadence gates

The system SHALL roll for an ER consultation event on each **non-reading interaction event** (quiz answer commit, or route change into a player-content page) rather than on a session-time tick. Rolls SHALL happen inside `maybeRollNonReadingEvent` (see `hospital-events` spec for shared gate / hook architecture), as the **second roll** after the event roll within the same function call. Trigger rate SHALL NOT scale by reputation (this remains a teaching mechanism, not a penalty surface).

The roll probability SHALL be `ER_ROLL_PROBABILITY = 0.035` (3.5%) by default, defined in `packages/content-medexam2-tw/src/events.ts` for content-pack-level tuning. ER probability is intentionally lower than `EVENT_ROLL_PROBABILITY` (5%) to preserve the legacy "ER feels rarer than other events" cadence.

**Hard-mutex pre-conditions** — ALL of the following SHALL be checked before triggering, and ANY one being true SHALL skip the current roll without queueing:

1. **Reading session active** — `gameCounters.currentSessionStartedAt !== null` (this is the new primary gate replacing the old tick-only mechanism; reading is sacred)
2. **Cooldown** — `Date.now() - (gameCounters.lastInteractionEventAt ?? 0) < 180_000` (3 minutes wall-clock; shared with `hospital-events`)
3. `hospital-events.currentEvent` is pending resolution (`pendingEventId !== null`)
4. `erConsultActive` singleton is non-null (a prior consult is still pending)
5. `MentorDialog` is open (any state) — checked via `services/er-consultation.ts` `canTriggerERConsult` helper
6. A quiz session is active (`QuizModal` open) — same helper
7. Player has turned off the feature via `player_state.settings.erConsultEnabled = false`

Gates 1, 2, 3 are evaluated **once at the top** of `maybeRollNonReadingEvent` (shared with event roll); gates 4-7 are evaluated **inside** `maybeRollAndPersistERConsult` (preserving its existing internal logic). When skipped due to mutex, no retry is scheduled — the next hook event (next quiz answer or page nav) is the next opportunity to roll.

#### Scenario: Reading session blocks ER consult roll

- **GIVEN** `gameCounters.currentSessionStartedAt = 1716000000000` (reading session active)
- **WHEN** the player answers a quiz question or navigates to a player-content page
- **THEN** `maybeRollNonReadingEvent` SHALL skip at the reading session gate
- **AND** no ER consult SHALL be triggered
- **AND** the player can complete an entire reading session without ER consult interruption

#### Scenario: Roll skipped when hospital event pending

- **GIVEN** an active 醫療糾紛 event awaiting resolution (`pendingEventId !== null`)
- **WHEN** the player navigates to `/leaderboard` (Hook B fires)
- **THEN** `maybeRollNonReadingEvent` SHALL skip at the mutex gate (gate 3)
- **AND** no ER consult SHALL be triggered

#### Scenario: Roll skipped when quiz session active

- **GIVEN** the player has `QuizModal` open answering a question
- **WHEN** the player commits an answer (Hook A fires from inside QuizModal)
- **THEN** `maybeRollAndPersistERConsult`'s internal gate detects `quizSessionActive = true`
- **AND** SHALL skip the ER roll
- **AND** the event roll within the same `maybeRollNonReadingEvent` call may still fire (since `quizSessionActive` is an ER-specific gate, not event-specific)

(Implementation note: "quiz session active" means the QuizModal is mid-render, before answer commit + reward write. The Hook A fires AFTER answer commit, so by the time `maybeRollAndPersistERConsult` checks `quizSessionActive`, the modal is typically already closing. Treat this gate as defense-in-depth for race conditions.)

#### Scenario: Roll skipped when feature disabled

- **GIVEN** `player_state.settings.erConsultEnabled === false`
- **WHEN** `maybeRollNonReadingEvent` fires `ER_ROLL_PROBABILITY` succeeds
- **THEN** `maybeRollAndPersistERConsult` SHALL detect the setting flag and skip
- **AND** no ER consult SHALL be triggered
- **AND** no tick handler overhead beyond the flag check SHALL execute

#### Scenario: Cooldown blocks ER consult re-trigger

- **GIVEN** an ER consult resolved 60 seconds ago (`lastInteractionEventAt = Date.now() - 60_000`)
- **WHEN** the player navigates to `/achievements`
- **THEN** `maybeRollNonReadingEvent` SHALL skip at the cooldown gate (gate 2)
- **AND** no ER consult SHALL trigger
- **AND** the cooldown SHALL be shared with hospital-events (no separate ER-only timestamp)

#### Scenario: Successful trigger creates erConsultActive row

- **GIVEN** no gate condition fails AND `erConsultEnabled === true`
- **WHEN** the player navigates to a player-content page and the 3.5% probability roll succeeds
- **THEN** the under-utilized subject selector SHALL run (see selector requirement, unchanged)
- **AND** a question SHALL be picked from that subject (see picker requirement, unchanged)
- **AND** `erConsultActive` SHALL be set to `{questionId, subjectId, triggeredAt: now, doctorSpriteKey: 'er-doctor'}`
- **AND** `ERConsultDialog` SHALL render

#### Scenario: ER consult resolve updates shared cooldown timestamp

- **GIVEN** an active ER consult (`erConsultActive !== null`)
- **WHEN** the player answers (correct or wrong) OR skips OR the consult auto-expires
- **THEN** the resolve handler (`answerERConsult` / `skipERConsult` / expiry path in tick.ts) SHALL set `gameCounters.lastInteractionEventAt = Date.now()`
- **AND** `gameCounters.erConsultActive` SHALL be cleared
- **AND** the next 3 minutes SHALL block all event/ER rolls via the shared cooldown gate

(Migration note: previously the resolve handlers did not write any cooldown timestamp because ER-cadence was tick-based via `erConsultTicksUntilRoll`. The new code path adds the write. The pre-existing 30-day picker exclusion and recency selector logic remain unchanged.)

### Requirement: Under-utilized specialty selector SHALL use weighted score combining recency + mastery + jitter

The selector SHALL compute a score for each of the 14 二階國考 subjects:

```
score(subject) =
    0.6 × normalize(1 / max(recentAttempts7d, 1))    // recency weight
  + 0.3 × (1 - masteryPct)                            // mastery weight
  + 0.1 × Math.random()                               // jitter tie-break
```

Where:
- `recentAttempts7d` = count of `questionHistory` rows for that `subjectId` with `lastAnsweredAt >= now - 7*24*60*60*1000`
- `normalize(x)` = min-max scale across all 14 subjects to `[0, 1]` after the reciprocal
- `masteryPct` = `mastery[subjectId].correct / mastery[subjectId].total` if `total > 0`, else `0` (cold-start treats as fully un-mastered)

The selector SHALL pick the subject with the **highest** score. If multiple subjects tie within `0.01`, the jitter component naturally breaks ties; no explicit tie-break beyond random.

**Per-subject cooldown**: A subject that has been used as ER consult target ≥ 3 times in the last 7 days SHALL have its score multiplied by `0.3` (penalty), preventing the same cold subject being hammered.

#### Scenario: Cold subject with no recent attempts wins

- **GIVEN** subject `眼科` has `recentAttempts7d = 0` AND `mastery.total = 0`
- **AND** subject `內科` has `recentAttempts7d = 50` AND `masteryPct = 0.7`
- **WHEN** the selector runs
- **THEN** the selected `subjectId` SHALL be `眼科` with very high probability (≥ 80% across multiple runs due to jitter)

#### Scenario: All subjects fresh — random fallback via jitter

- **GIVEN** a new player save with all 14 subjects `recentAttempts7d = 0` AND `mastery.total = 0`
- **WHEN** the selector runs
- **THEN** the scores SHALL be dominated by the 0.1 random jitter
- **AND** the selected subject SHALL be effectively random across runs

#### Scenario: Over-used cold subject gets cooldown penalty

- **GIVEN** subject `病理科` has already been used as ER consult target 3 times in the last 7 days
- **AND** `病理科` would otherwise have the highest score
- **WHEN** the selector runs
- **THEN** `病理科`'s computed score SHALL be multiplied by `0.3`
- **AND** the next-highest-scoring subject SHALL likely win

#### Scenario: Cooldown does not permanently exclude a subject

- **GIVEN** subject `家醫科` has cooldown penalty applied (used ≥ 3 times in 7 days)
- **AND** the 7-day window passes such that the count drops to 2
- **WHEN** the selector runs after the window expires
- **THEN** the cooldown multiplier SHALL no longer apply

### Requirement: Question picker SHALL select from selected subject excluding recent attempts

After the selector picks a `subjectId`, the question picker SHALL:

1. Filter `content.questions` to questions with matching `subjectId`
2. Exclude any `questionId` present in `questionHistory` with `lastAnsweredAt >= now - 30*24*60*60*1000` (30-day recency exclusion, mirrors mentor-daily)
3. Randomly select one from the filtered pool
4. If the filtered pool is empty (all questions in this subject answered within 30 days), the picker SHALL fall through to the **full subject pool** (no exclusion) and pick randomly

The picker SHALL NOT touch the SRS queue — ER consult is its own selection path; SRS due cards remain mentor-daily / quiz domain.

**The picker SHALL NOT consult the active year-filter preference (`meta['quiz.yearFilter']` per `hospital-quiz` capability). ER consultation is event-driven (background tick spawns it under cadence + idle gates), not a player-initiated quiz action; applying the year filter here would let a narrow player preference (e.g. 「只練 115」) silently starve the ER spawn pool and make the feature appear broken. The implementation file SHALL include an inline comment at the picker entry point explicitly documenting this exclusion.**

#### Scenario: Picker selects unanswered question

- **GIVEN** selected subject `骨科` has 200 questions in `content.questions`
- **AND** 5 of those questions have `lastAnsweredAt` within last 30 days in `questionHistory`
- **WHEN** the picker runs
- **THEN** the selected `questionId` SHALL be from the 195 unfiltered questions
- **AND** the selection SHALL be uniformly random within that pool

#### Scenario: All questions recently answered — full pool fallback

- **GIVEN** selected subject `皮膚科` has 30 questions in `content.questions`
- **AND** all 30 have `lastAnsweredAt` within last 30 days
- **WHEN** the picker runs
- **THEN** the picker SHALL select from the full 30-question pool with no exclusion

#### Scenario: Year filter does not constrain ER consult pool

- **GIVEN** the player's active year filter `meta['quiz.yearFilter']` is `[115]` (only year 115 selected)
- **AND** the ER consult selector chooses subject 骨科 whose 115-year pool is only ~32 questions
- **WHEN** the ER consult picker runs
- **THEN** the picker SHALL operate on the full 200-question 骨科 pool (minus 30-day recency exclusion)
- **AND** the returned question's `meta.year` MAY be any value in `[106..115]`
- **AND** the returned question SHALL NOT be filtered to only `115`

### Requirement: ERConsultDialog UI SHALL show ER doctor sprite + consult-tone dialogue + embedded question

The ER consultation SHALL be presented via an `ERConsultDialog` modal component, distinct from `QuizModal` and `MentorDialog`. The dialog SHALL display:

- ER doctor sprite portrait (≥ 120×120 px) using sprite key `'er-doctor'` from the active theme pack
- Title `「急診照會」`
- A dialogue bubble with the ER doctor's opening line (randomly selected from 5 hard-coded greeting variants, all in consult-request tone — e.g., 「{subject} 這題我不太確定，幫我看一下！」)
- An embedded question card (stem, options, subject tag) sourced from `content.questions[erConsultActive.questionId]`
- A 「跳過」 button that triggers the skip path
- A countdown indicator showing "本次照會 N 分鐘內回應" (default 10 minutes; on timeout auto-skip)

After the user answers:
- **Correct answer** → ER doctor dialogue changes to a randomly-selected gratitude variant (e.g., 「太強了！下次再求救」); show "+X XP / +Y 聲望" toast; reveal correct option + explanation; show 「關閉」 button (user-dismissed, same as wrong-answer path)
- **Wrong answer** → ER doctor dialogue changes to a randomly-selected disappointed-but-supportive variant (e.g., 「沒事，學起來下次就會了」); reveal correct option + explanation (sourced from `question.explanation`, with mock-exam placeholder fallback for missing explanations); show 「關閉」 button

**Dialog lifecycle independence**: The dialog's visible-on-screen state SHALL NOT be tied directly to `gameCounters.erConsultActive`. Once the user has begun interacting with a consult (modal has rendered at least once), the dialog SHALL remain rendered until one of these explicit close triggers fires:

- User clicks the 「關閉」 button (both correct-answer and wrong-answer paths)
- User confirms 跳過 (skip path)

Service-layer functions (`answerERConsult`, `skipERConsult`, `disableERConsult`, tick auto-skip) MAY clear `erConsultActive` in DB at any point during the dialog's visible lifecycle without unmounting the dialog. The dialog component SHALL hold its own local copy of the active state to remain rendered after DB state is cleared.

#### Scenario: Dialog opens with sprite + greeting + question

- **WHEN** `erConsultActive` is set and `ERConsultDialog` mounts
- **THEN** the sprite SHALL be the active theme's `er-doctor` sprite
- **AND** the dialogue text SHALL be one of 5 hard-coded greeting variants
- **AND** the dialogue SHALL reference the selected subject by name (e.g., `「眼科 這題我...」`)
- **AND** the question card SHALL render the stem and options for `erConsultActive.questionId`

#### Scenario: Correct answer rewards 1.8× XP with streak multiplier

- **WHEN** the user selects the correct option on an ER consult question
- **THEN** the player SHALL gain `Math.floor(REWARD.quizCorrect.xp * 1.8 * streakMultiplier)` XP via `applyXp`
- **AND** the player SHALL gain `REWARD.quizCorrect.stat` (knowledge +1) via `addStat`
- **AND** `mastery[subjectId]` SHALL be updated to `{correct + 1, total + 1}` (same hospital-quiz answer path)
- **AND** the global `quizEvents.emit('correct-answer')` SHALL be invoked
- **AND** the ER doctor dialogue SHALL show a gratitude variant
- **AND** the dialog SHALL reveal the correct option + explanation + 「關閉」 button (user-dismissed)

#### Scenario: Wrong answer grants minimal XP and routes to SRS

- **WHEN** the user selects an incorrect option on an ER consult question
- **THEN** the player SHALL gain `REWARD.quizWrong.xp` XP (2 XP, no multiplier)
- **AND** `mastery[subjectId]` SHALL be updated to `{correct + 0, total + 1}`
- **AND** the question SHALL be enqueued to `db.srs` via the existing answer-creates-SrsCard pathway
- **AND** the dialog SHALL reveal correct option + explanation before allowing close

#### Scenario: Wrong answer dialog stays open until user clicks 關閉

- **GIVEN** the user has selected an incorrect option AND `answerERConsult` has finished recording mastery + reward + log AND `gameCounters.erConsultActive` is now `null` in DB
- **WHEN** the dialog continues to render
- **THEN** the dialog SHALL remain visible (NOT auto-unmount on the next `useLiveQuery` tick)
- **AND** the explanation block (rendered by `<ExplanationMarkdown>`) SHALL be visible
- **AND** a 「關閉」 button SHALL be visible alongside the explanation
- **WHEN** the user clicks 「關閉」
- **THEN** the dialog SHALL unmount

#### Scenario: Correct answer dialog stays open until user clicks 關閉

- **GIVEN** the user has selected the correct option AND `answerERConsult` has finished recording rewards AND the gratitude toast is shown
- **WHEN** the dialog continues to render
- **THEN** the dialog SHALL remain visible (NOT auto-unmount via a timer)
- **AND** the explanation block SHALL be visible (same as wrong-answer path, for learning continuity)
- **AND** a 「關閉」 button SHALL be visible
- **WHEN** the user clicks 「關閉」
- **THEN** the dialog SHALL unmount

#### Scenario: Skip path closes dialog immediately

- **WHEN** the user clicks 跳過 AND (for first skip) confirms via the second confirmation dialog
- **THEN** `skipERConsult` SHALL clear `erConsultActive` in DB
- **AND** the dialog SHALL unmount immediately (no auto-timer, no further user action)

#### Scenario: Browser refresh mid-explanation does not reopen dialog

- **GIVEN** the user has answered wrong AND is reading the explanation AND `answerERConsult` already cleared `erConsultActive` in DB AND the user closes / refreshes the browser before clicking 「關閉」
- **WHEN** the app reloads
- **THEN** the dialog SHALL NOT auto-reopen
- **AND** the reward / log entries from the answer SHALL remain persisted

#### Scenario: Missing explanation uses placeholder

- **WHEN** the answer is wrong AND the question's `explanation` field is empty/missing
- **THEN** the dialog SHALL display the placeholder text `「📌 此題詳解暫無 — 可至[陽明國考考古題小組](https://sites.google.com/view/ymmedexam/ans)查詢」` (same wording as mock-exam and mentor-daily)

#### Scenario: Timeout auto-skips after 10 minutes

- **GIVEN** an `erConsultActive` row triggered 10 minutes ago AND the dialog has not been interacted with
- **WHEN** the next tick fires
- **THEN** the consult SHALL auto-resolve as `resolution: 'auto-skipped'`
- **AND** `erConsultActive` SHALL be cleared (set null)
- **AND** no XP / mastery change SHALL occur
- **AND** the dialog SHALL close if open

### Requirement: Dialog SHALL hold sticky question until user closes

While the `ERConsultDialog` component is rendered with a non-null sticky question (`sticky !== null`), the dialog SHALL NOT replace `sticky` with a newly-arriving `gameCounters.erConsultActive` (i.e., a follow-up consult rolled by tick after the player answered or before the player closed). The dialog SHALL adopt a new `erConsultActive` only after `sticky` becomes `null` (user clicked 關閉 or 確認跳過).

This protects the player's reading session: if the player answers Q1 and is reading the explanation when tick rolls Q2, Q1 stays on screen until the player explicitly closes. Q2 sits in `gameCounters.erConsultActive` (DB layer) until the player closes Q1; then the dialog adopts Q2 (or if Q2 has expired in the interim, the auto-skip path applies).

#### Scenario: Q1 still on screen when Q2 rolls

- **GIVEN** the dialog is rendering Q1 with `sticky.questionId === 'Q1'` AND the user has answered Q1 AND `answerERConsult` cleared `erConsultActive` in DB AND the user has NOT clicked 「關閉」 yet
- **WHEN** tick fires a new consult and sets `erConsultActive = { questionId: 'Q2', ... }` in DB
- **THEN** the dialog SHALL continue to display Q1 (sticky unchanged)
- **AND** the explanation block for Q1 SHALL remain visible
- **WHEN** the user clicks 「關閉」 on Q1
- **THEN** `sticky` SHALL become `null` and the dialog SHALL unmount
- **AND** the next `useLiveQuery` tick SHALL adopt Q2 from `erConsultActive` and render the Q2 consult fresh

### Requirement: Skip removes the consult without re-entry and does not penalize

The 「跳過」 button SHALL clear `erConsultActive` (set null) without enqueueing the question elsewhere. Skipped consults SHALL NOT reappear immediately (next consult requires next tick interval).

Skip semantics SHALL parallel `mentor-daily` skip:
- No XP / no stat change / no mastery change
- Does NOT count toward streak `questionsAnswered` increment
- Logged in `erConsultLog` with `resolution: 'skipped'`

#### Scenario: First-time skip shows confirmation

- **WHEN** the user clicks 「跳過」 for the first time in the current session
- **THEN** a confirmation prompt SHALL appear: `「跳過這次照會？不會扣分但也沒獎勵」`
- **AND** only on confirm SHALL the skip be executed
- **AND** subsequent skips within the same session SHALL NOT re-prompt

#### Scenario: Skip clears active row and logs

- **WHEN** the user confirms skip (or skips after first-time confirmation)
- **THEN** `erConsultActive` SHALL be set null
- **AND** `erConsultLog` SHALL append a row `{triggeredAt, subjectId, questionId, resolution: 'skipped', resolvedAt: now, xpGained: 0}`
- **AND** the dialog SHALL close
- **AND** `player.todayProgress.questionsAnswered` SHALL NOT increment

### Requirement: Answered ER consult counts as a quiz-answered event for streak

When an ER consult question is answered (correctly or wrongly, but NOT when skipped or auto-skipped), the system SHALL invoke `incrementQuestionsAnswered(player, today, 1)` and `applyCheckIn` exactly as a normal quiz answer would. This integrates ER consult into the existing streak check-in path without modifying the `engine-rewards` streak spec.

#### Scenario: Answered ER consult increments today's answered count

- **WHEN** the user answers an ER consult question (either correctly or wrongly)
- **THEN** `player.todayProgress.questionsAnswered` SHALL be incremented by 1
- **AND** if `hasMetCheckInThreshold(player, today)` returns true after the increment, `applyCheckIn(player, today)` SHALL be invoked

#### Scenario: Skipped / auto-skipped consult does NOT count toward streak

- **WHEN** the user clicks 「跳過」 OR the consult auto-skips after timeout
- **THEN** `player.todayProgress.questionsAnswered` SHALL NOT be incremented

### Requirement: Telemetry log SHALL capture each consult outcome with rolling cap

The system SHALL maintain a Dexie `erConsultLog` table with the following row shape:

```typescript
interface ERConsultLogRow {
  id: string                              // uuid
  triggeredAt: number                     // epoch ms
  resolvedAt: number | null               // null while pending
  subjectId: string
  questionId: string
  resolution: 'correct' | 'wrong' | 'skipped' | 'auto-skipped'
  xpGained: number                        // 0 for skip / wrong xp / 1.8× correct xp
  reactionTimeMs: number | null           // null if skipped before answering
}
```

The table SHALL be indexed by `triggeredAt` (for chronological queries) and `subjectId` (for per-subject analytics). The table SHALL be capped at **500 rows** — when insert would exceed 500, the oldest row (by `triggeredAt`) SHALL be deleted in the same transaction.

The log SHALL NOT sync to cloud (purely local telemetry for dogfood tuning).

#### Scenario: Correct answer logs with xpGained

- **GIVEN** ER consult triggered with `subjectId = '眼科'` AND `questionId = 'Q123'`
- **WHEN** the user answers correctly, gaining 18 XP
- **THEN** an `erConsultLog` row SHALL be appended with `{resolution: 'correct', xpGained: 18, reactionTimeMs: <answer time>}`

#### Scenario: Rolling cap deletes oldest

- **GIVEN** `erConsultLog` already contains 500 rows
- **WHEN** a new consult resolves and the log insert runs
- **THEN** the new row SHALL be inserted
- **AND** the row with the oldest `triggeredAt` SHALL be deleted
- **AND** the total row count SHALL remain at 500

### Requirement: Settings toggle and onboarding tooltip SHALL respect player autonomy

The system SHALL surface an `「啟用急診照會」` toggle in the existing settings UI (SettingsPanel or HelpMenu, whichever houses cosmetic/gameplay toggles in `apps/medexam2-hospital-tw`). The toggle SHALL:

- Default to ON for both new players and existing players post-migration
- Persist to `player_state.settings.erConsultEnabled: boolean` (synced to cloud per existing settings sync path)
- Take effect immediately — turning OFF mid-session SHALL clear any pending `erConsultActive` (without logging as resolved)

On the **first** ER consult trigger for a player (detected via `player_state.settings.erConsultOnboarded !== true`), the dialog SHALL include a one-shot tooltip / banner: `「💡 急診照會 = 隨機跨科 consult，可從設定關閉」`. After the dialog closes (any resolution path including skip), `player_state.settings.erConsultOnboarded` SHALL be set to `true` and the tooltip SHALL never appear again.

#### Scenario: Default ON for new player

- **GIVEN** a new player save with no `settings.erConsultEnabled` field present
- **WHEN** the tick scheduler reads the flag
- **THEN** the flag SHALL be treated as `true` (default-on semantics)

#### Scenario: Toggle OFF clears pending consult

- **GIVEN** an `erConsultActive` row is pending AND the dialog is open
- **WHEN** the player navigates to settings and toggles `「啟用急診照會」` OFF
- **THEN** `erConsultActive` SHALL be set null
- **AND** the dialog SHALL close
- **AND** no `erConsultLog` row SHALL be written (the unresolved consult is discarded, not logged as skipped — because the player intent was "stop the feature" not "skip this one")

#### Scenario: First-trigger onboarding tooltip shown once

- **GIVEN** a player with `settings.erConsultOnboarded === undefined` (never seen one before)
- **WHEN** the first ER consult triggers and the dialog opens
- **THEN** the dialog SHALL include the onboarding tooltip text
- **AND** after the dialog closes (any path), `settings.erConsultOnboarded` SHALL be set to `true`
- **AND** the next time an ER consult triggers, the tooltip SHALL NOT appear

### Requirement: Dexie schema bump SHALL be additive and idempotent

The Dexie database version SHALL be bumped (current version + 1) to add the `erConsultLog` table and the `erConsultActive` singleton storage. The version upgrade hook SHALL:

- Create the `erConsultLog` table indexed by `triggeredAt` and `subjectId`
- Create / ensure the `erConsultActive` singleton row (initialized to null)
- NOT modify any existing tables (`affinity` / `doctors` / `mastery` / `questionHistory` / `rooms` / `gameCounters` / `bookmarks` etc.)
- Tolerate idempotent re-execution

#### Scenario: Existing save migrates without data loss

- **GIVEN** an existing v? save with all current tables populated
- **WHEN** the app boots and Dexie upgrades to v?+1
- **THEN** all existing table contents SHALL be unchanged
- **AND** the new `erConsultLog` table SHALL exist and be empty
- **AND** the new `erConsultActive` storage SHALL exist and be null

#### Scenario: Fresh save initializes new tables

- **GIVEN** a fresh save created at v?+1 schema
- **WHEN** `ensureSeed` completes
- **THEN** the `erConsultLog` table SHALL be empty
- **AND** `erConsultActive` SHALL be null
- **AND** no migration error SHALL be logged
