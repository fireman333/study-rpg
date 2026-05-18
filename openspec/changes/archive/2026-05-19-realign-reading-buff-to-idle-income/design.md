## Context

**Current state** (post `add-quiz-economy-redesign` 2026-05-19):
- `services/quiz-rewards.ts` computes `revenueDelta = round(80 × specialtyMultiplier × readingBuff)`, where `readingBuff = 1.5` if session active else `1.0`
- `lib/tick.ts` computes `effectiveIdleThroughput = totalThroughput × 0.3` **regardless** of session state
- HelpMenu / V6Migration / StudySessionPage copy all describe the buff as "回首頁寫題答對的營收/聲望會有 1.5× 加成"
- Constants live in `packages/content-medexam2-tw/src/recruitment.ts`: `READING_SESSION_BUFF_MULTIPLIER = 1.5`, `READING_IDLE_RATE_REDUCTION = 0.3`

**Stakeholder**: Owner (康瑋麟) is the sole dogfood user. Feedback came directly from 2026-05-19 prod smoke test session — see `openspec/decisions/2026-05-19.md` §23:55 for the dialog and reasoning.

**Constraint**: Phase 2 of `add-quiz-economy-redesign` defined an income mix calibration anchor (1-month full-clear of 6066 questions). This change shifts where income flows but **must not require re-calibration of base constants** unless dogfood telemetry over 1-2 weeks proves otherwise — defer per task 10.2 of the original change.

## Goals / Non-Goals

**Goals:**
- Match the intended mental model: reading session = "idle boost while doctors see patients"
- Make "離開電腦看書" a strategically valid play style (currently dominated by always-grinding-quiz)
- Decouple quiz reward from session state — quiz becomes a pure independent income source
- Keep all visible copy honest: tutorial / help / migration banners describe the actual mechanic
- Zero schema changes (no Dexie bump, no sync table changes)
- Zero base-constant changes (READING_SESSION_BUFF_MULTIPLIER 1.5 reused, just relocated)

**Non-Goals:**
- Re-calibrating Phase 2 income anchor (defer to post-dogfood telemetry, per `add-quiz-economy-redesign` task 10.2 tuning protocol)
- Adding tier-based or doctor-rarity-based modifiers to the reading buff (single flat 1.5×)
- Touching `READING_IDLE_RATE_REDUCTION` 0.3 value (the "unsupervised idle penalty" semantic remains valid)
- Removing or weakening `specialtyMultiplier` on quiz path (still gives same-subject doctor 1.0–1.2× quiz bonus, as a separate axis)
- Adding gamified "reading streak" buffs or per-subject reading bonuses (scope creep)
- Backporting any of this to 一階 (`medexam-tw`) — out of scope per "二階優先" track priority decision

## Decisions

### D1: Apply reading buff in `lib/tick.ts` (not via a wrapper service)

**Decision**: Inline the `readingBuff` multiplier directly in the tick loop alongside the existing `READING_IDLE_RATE_REDUCTION` branch.

**Why**: The tick loop already reads `gameCounters.currentSessionStartedAt` to decide whether to advance `accumulatedReadingMs`. Adding the buff branch in the same place keeps all session-state-aware logic in one file. Wrapping in a separate `idle-rewards.ts` service would mirror the `quiz-rewards.ts` pattern but adds indirection for a 2-line multiplication.

**Alternatives considered**:
- (a) New `services/idle-rewards.ts` parallel to `services/quiz-rewards.ts` — over-engineered; tick loop is the only caller
- (b) Compute buff inside `computeSalaryDrain` — wrong layer; salary should stay at full rate per `add-quiz-economy-redesign` design D2

### D2: Remove `readingBuff` term from `quiz-rewards.ts`, keep `specialtyMultiplier`

**Decision**: Delete the `readingBuff` line and the `currentSessionStartedAt` read from `applyQuizReward`. Quiz formula becomes `revenueDelta = round(80 × specialtyMultiplier)`.

**Why**: Single-responsibility — quiz rewards now depend only on per-quiz attributes (subject, doctor partner). Session state becomes an `lib/tick.ts` concern only. Removing the Dexie read inside quiz transaction also slightly reduces lock contention (~1 read fewer per correct answer).

**Alternatives considered**:
- (a) Keep `readingBuff` but set it to always-1.0 — confusing dead code; explicit removal cleaner
- (b) Replace `readingBuff` with `tierMultiplier` (from `add-tier-quiz-multiplier`) — that's a separate concept and already implemented elsewhere; conflating would obscure both

### D3: Tutorial copy refactor — extract shared constant string

**Decision**: Update copy in 3 places (StudySessionPage / HelpMenu / V6Migration) by direct string edits. Do **not** extract to a shared i18n constant.

**Why**: The 3 sites use slightly different phrasings (banner vs accordion vs migration explainer) and the project has no i18n infrastructure yet. Premature extraction violates principle 6 (Simplicity First). If a future change adds a 4th surface, then reconsider.

**Alternatives considered**:
- (a) Extract to `packages/theme-pixel-hospital/src/copy.ts` constant — adds package dependency for 3 strings; defer until i18n infra exists
- (b) Just update StudySessionPage and skip the other two — incomplete; user will notice mismatch

### D4: Migration semantics for existing saves

**Decision**: No migration needed. Both old and new code read the same Dexie shape — only the runtime computation differs. Existing `gameCounters.revenue` / `reputation` values stay intact; the next tick after deploy applies the new formula.

**Why**: Reading buff is a per-event multiplier, not a stored snapshot. No "historical buff applied" data exists in DB to migrate. A player mid-session at deploy time will simply experience the formula shift on the next tick.

**Risk noted**: If a player had a very-long active session and was relying on the quiz buff for cumulative revenue, post-deploy they'll see slower revenue accrual via quiz but faster via idle. Net impact depends on play style. Documented in tutorial copy refresh so they understand.

### D5: Verification — Chrome MCP live smoke covers idle math

**Decision**: Add a Chrome MCP smoke step that:
1. Starts a reading session on prod-equivalent
2. Reads HomePage 淨收/分鐘 chip — expect `round(totalThroughput × 1.5)` (e.g., if base 35 → 52)
3. Stops session
4. Re-reads chip — expect `round(totalThroughput × 0.3)` (e.g., 35 × 0.3 = 11, matching current prod observation)

**Why**: This is the most observable behavioral change. The chip number flipping between modes is the canonical user-facing signal. If the smoke step shows 35 on active and 11 on inactive (instead of expected 52 / 11), the tick branch is broken.

## Risks / Trade-offs

- **Risk**: Phase 2 income anchor (1-month full-clear) becomes off-target → economy feels too slow or too fast
  - **Mitigation**: Defer re-calibration to post-dogfood (per task 10.2). Owner runs 1-2 weeks of dogfood → if accrued rep/day off by >20% from target 4,300, adjust `QUIZ_REVENUE_PER_CORRECT_BASE` or session length up/down

- **Risk**: Players already familiar with current quiz × 1.5 buff complain about reward "nerf"
  - **Mitigation**: V6Migration banner already shows on first launch post-update; this change refreshes its copy so users understand the new mechanic. Net income may actually go up for typical play (idle is bigger throughput than quiz × 1.5)

- **Risk**: Edge case — player has 0 doctors assigned (totalThroughput = 0) and uses session purely for quiz
  - **Mitigation**: Quiz still rewards (specialty × tier still apply). Reading buff being on idle is moot when idle = 0. Player loses the old "always-on 1.5× quiz boost during session" but gains nothing of value in this edge — pure simplification

- **Risk**: Future feature wants both quiz × N and idle × M buffs from same session
  - **Mitigation**: This change doesn't preclude that — `READING_SESSION_BUFF_MULTIPLIER` stays as a named constant. A future change can introduce `READING_QUIZ_BUFF_MULTIPLIER` separately. YAGNI for now

- **Trade-off**: Quiz becomes "boring" during sessions (no special boost) — accepted, because the buff now correctly mirrors the metaphor and quiz still has 2 other multipliers (specialty + tier) as its own depth axis

## Migration Plan

No data migration needed (per D4). Deploy flow:
1. Apply code changes per `tasks.md`
2. Bump no version constants
3. Build, deploy via existing GH Actions pipeline (push to `main`)
4. Existing players: first launch shows V6Migration banner (which already triggers for save schema v6+); refreshed copy explains new mechanic
5. New players: HelpMenu / StudySessionPage banner shows refreshed copy from start

Rollback: revert the merge commit; no DB shape changes mean clean rollback.

## Open Questions

- Should the V6Migration banner version bump (from v6 → v7 trigger) to force re-show for users who already dismissed v6? **Tentative answer**: No — v6 banner already covered Phase 2 quiz economy intro; this change is a refinement of the same mechanic, not a new system. Users who want to re-read can use HelpMenu. Revisit if dogfood feedback says people are confused.
- Should we add a console.info one-line note about the buff being relocated, for early dogfood transparency? **Tentative**: Skip — keeps prod console clean; the visible chip math will speak for itself.
