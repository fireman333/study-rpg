## Context

`/cram` (`CramPage.tsx`) renders an honest, fully-open high-frequency 考古清單 (recurrence-ranked concept list). Each 考古 item carries `sourceQuestionIds`. The app already tracks per-question answer history in `questionHistory` (Dexie table; one row per answered question with `lastResult: 'correct' | 'wrong'` + monotonic-OR `everWrong`), exposed reactively via `useQuestionHistory()`.

`wire-neurons-cram-prescription-bridge` (D+C, shipped) made cram practice credit the 今日處方箋 (`recordPrescriptionAnswer` fires from any entry point, incl. cram practice), showing a 「🩹 連結已固化 / 🔍 新連結已開發」 verdict note in `QuizModal`. But `CramPage` opens `<QuizModal pool practice />` **without `preserveOrder`**, so `QuizModal` shuffles the pool (`QuizModal.tsx:235`) — today's prescription-snapshot questions scatter, so the payoff fires unreliably.

This change layers the player's own footprint onto the honest list (positive coverage imprint) and makes the existing payoff reliable, both purely derived from existing state.

## Goals / Non-Goals

**Goals:**
- Turn the deficit-framed 考古清單 into a positive self-evidence surface: 「✓ 已固化過」 chip on covered items, silence on the rest.
- Make the D+C 「連結已固化」 payoff reliably appear when practicing from `/cram`.
- Zero Dexie schema bump, zero R2 SCHEMA_VERSION change, zero sync-allowlist change, zero new meta key, zero new write path.

**Non-Goals:**
- No strict-monotonic "everCorrect" tracking (would require a schema field — deferred).
- No coverage %, no denominator, no 「還差 N 個」 gap placeholder (honesty guardrail — banned).
- No change to prescription snapshot/target selection, no question injection.
- Not the flagship 考前收斂 calm view (Idea 3) — that is a separate change gated on `/grill`.

## Decisions

### D1 — Coverage signal = `lastResult === 'correct'` (pure derived, near-monotonic)

A 考古 item is "covered" iff ≥1 of its `sourceQuestionIds` has a `questionHistory` row with `lastResult === 'correct'`. `CramPage` builds `consolidatedIds = new Set(history.filter(h => h.lastResult === 'correct').map(h => h.questionId))` from the existing `useQuestionHistory()` subscription, then per item: `item.sourceQuestionIds.some(id => consolidatedIds.has(id))`.

**Why `lastResult`, not `correctCount`/`everCorrect`:** `recordQuestionResult` only ever writes `{lastResult, everWrong, timestamps}` — it never populates `correctCount` (an optional SRS field written elsewhere, unreliable for this). So the only reliable pure-derived "已固化/曾答對" signal is `lastResult === 'correct'`.

**Trade-off (documented, accepted):** `lastResult` is LWW, so a later wrong answer flips it back — the chip is *near*-monotonic, not strictly monotonic. In practice a concept maps to multiple source questions, so the chip stays as long as ANY one is currently-correct — very sticky. A strictly-monotonic "everCorrect" would need a new schema field, violating the zero-schema constraint; the calming benefit does not justify a schema bump. Alternatives considered: (a) write-once `cram:*:consolidated:<qid>` meta keys (monotonic, but adds a write path + sync surface — rejected, the handoff explicitly wants pure-derived from `questionHistory`); (b) `correctCount > 0` (rejected — not populated by the answer path).

### D2 — Chip is positive-only, no denominator (honesty guardrail)

Covered → one low-emphasis chip 「✓ 已固化過」. Uncovered → render nothing (no chip, no gray placeholder). Never a count, %, ratio, or 「還差 N」. This mirrors the imprint-bud 三鐵律 (只渲染正向 / 無分母 / 無缺口占位) and the existing 考前猜題 honesty ban. The chip is derived from the user's own answer history, not a prediction about the exam.

### D3 — Practice-pool priority via read-only plan snapshot + `preserveOrder`

`CramPage` fetches today's plan snapshot **read-only** (a new `getTodayPlanSnapshotIds()` in `prescription.ts` that reads the existing `plan` meta key and returns `Set(wrongEligibleQuestionIds ∪ breadthEligibleQuestionIds)`, or `null` if today has no plan yet — it MUST NOT create a plan). When building a practice pool, `CramPage`: (1) `shuffle` the resolved questions (keep variety), (2) stable-partition snapshot ids to the front (ES2019 `Array.prototype.sort` is stable), (3) pass `preserveOrder` to `QuizModal` so the ordering survives.

**Why read-only (no `getOrCreateTodayPlan`):** materializing today's plan as a side effect of merely opening `/cram` would change when the plan freezes. If no plan exists (user hasn't opened home today), snapshot is `null` → pool falls back to plain shuffle → **zero behavior change**. This keeps the fix a pure best-effort reliability boost.

**Why not guarantee the payoff:** a concept's source questions may not overlap today's snapshot at all; then nothing is prioritized. The fix raises hit-rate honestly, it does not fake a payoff.

### D4 — Spec alignment folded in (non-behavioral)

Two `neurons-cram-tab` spec corrections ride along: the on-ramp requirement gains a prescription-crediting exception clause (practice still grants no XP/gacha/game-streak, but DOES credit 今日處方箋 — matching shipped D+C behavior), and the CTA text 「練 N 題」 syncs to the implemented 「練幾題」.

## Risks / Trade-offs

- **Chip regresses on a later wrong answer** → Mitigated by multi-source coverage (per D1); documented as accepted near-monotonic behavior. Not a correctness bug — the chip is a true statement at render time.
- **Reading the plan snapshot on every practice open** → Cheap single `db.meta.get` of today's plan key; no measurable cost. Read-only, no write side effect.
- **`preserveOrder` removes shuffle** → We shuffle in `CramPage` before partitioning, so within each partition order is still randomized; only the snapshot-first grouping is deterministic.
- **Honesty drift** → The chip text is a fixed literal (「✓ 已固化過」) with no numeric interpolation, so the guardrail (no %/denominator) holds by construction; verified in smoke.

## Migration Plan

Pure additive client-side change. No data migration, no schema/version bump, no backend touch. Deploy = normal CF Pages push of neurons. Rollback = revert the change (no persisted state introduced).

## Open Questions

None — signal choice, guardrails, and read-only semantics resolved above.
