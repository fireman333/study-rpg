## Context

Current `reviewCardBinary` (in `packages/core/src/lib/srs.ts`) has been live since 2026-05-14 (一階 `wire-srs-queue` change). Two weeks of single-user dogfood ahead. The cap is a preventive maintenance — no production bug report has cited a runaway interval yet, but the math (1 → 6 → 15 → 38 → 95 → 238 → 595 → 1487 …) makes it inevitable on any card answered correctly ~7+ times in a row.

The cap value is a product judgement, not a math derivation. The change is intentionally small (one constant, one clamp) so it can ship before dogfood pile-up reveals a higher-priority SRS issue.

## Goals / Non-Goals

**Goals:**

- Prevent `interval` from exceeding 365 days under any sequence of correct answers.
- Land the cap as a named export so future dogfood-driven tuning is local to one file.
- Add the cap to the spec record on both `hospital-srs` and `srs-queue` so the two tracks stay aligned.

**Non-Goals:**

- Tuning the other SRS constants (`SRS_DAILY_CAP`, wrong-answer multipliers, initial intervals). Those wait for real dogfood data.
- Migrating existing rows with `interval > 365`. There almost certainly are none yet (SRS only shipped 2026-05-14), and natural clamp-on-next-update handles any edge case.
- Adding leech detection, fuzz, A/B parameter flags, or any other SRS feature. All out of scope.
- Backfilling unit tests for `reviewCardBinary` if none exist. Add tests only for the new cap scenario; broader test coverage is a separate concern.

## Decisions

**Decision 1: Cap at 365 days, not 36500 (Anki default) or 180.**

Medical board exam dates are annual. A question that's "mastered" should re-surface at least once before the next exam cycle. 365 days gives one guaranteed re-review per cycle. Anki's 36500 is designed for vocabulary / general knowledge with no fixed deadline — wrong scope for exam prep. 180 days would cause too-frequent re-surfacing of well-known cards once mastery is deep.

Alternative considered: `interval * easeFactor` cap (proportional). Rejected — easier to reason about with a flat day cap.

**Decision 2: Cap applies only to correct path, not wrong path.**

Wrong path is `prev * 0.5` (partial reset) — it can only shrink interval. Adding a cap check there is dead code. Keep the change minimal and only clamp where expansion happens.

**Decision 3: Export `MAX_INTERVAL_DAYS` as named const, not literal.**

Same pattern as the other tunable constants (`SRS_DAILY_CAP`, `WRONG_INTERVAL_MULTIPLIER` etc.). Allows future dogfood adjustment without code drift. Discoverable via `import { MAX_INTERVAL_DAYS } from '@study-rpg/core'`.

**Decision 4: One cap for both 一階 and 二階, defined in `@study-rpg/core`.**

The two tracks both consume `reviewCardBinary` from core. Splitting the cap into per-track constants would let them drift accidentally. Keeping it shared means future tuning happens in one place — but the spec deltas on both `hospital-srs` and `srs-queue` record the behavior so the contract is visible from each capability's spec.

**Decision 5: No migration for legacy over-cap rows.**

If any production row has `interval > 365` (highly unlikely — SRS shipped 5 days ago), the natural fix is: when the user next answers that card, the new clamp applies and the row's `interval` is rewritten to ≤365 in the normal write path. No dedicated migration needed.

## Risks / Trade-offs

- **[Risk]** 365 days might still be too long for some material (e.g., facts that decay faster). → **Mitigation:** treat as initial value. Dogfood telemetry can drive tuning; the named export makes adjustment trivial.
- **[Risk]** Future change might want different caps per track (e.g., 一階 needs shorter cycle than 二階). → **Mitigation:** if that happens, split into `MAX_INTERVAL_DAYS_ONE_STAGE` / `MAX_INTERVAL_DAYS_TWO_STAGE` in a follow-up change. Single value covers current need.
- **[Risk]** Cap could mask a different SRS bug (e.g., easeFactor never settling). → **Mitigation:** dogfood for a month, then revisit if cards repeatedly hit the cap with the cap not being the binding constraint we expect.
- **[Trade-off]** Adds one constant to the public `@study-rpg/core` API surface. → **Acceptable:** API is small and additive; patch-level bump on next publish.
