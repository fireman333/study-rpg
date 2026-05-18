## Why

`reviewCardBinary` in `@study-rpg/core` lets the SM-2 interval expand without an upper bound: `1 → 6 → 15 → 38 → 95 → 238 → 595 → 1487 ...` days. After ~7 consecutive correct answers on a single card the next review lands beyond a year out, and after ~10 it lands beyond a decade — effectively retiring the question forever. For a medical-exam prep tool with a roughly annual study cycle (board exam dates are yearly), a runaway interval defeats the purpose of spaced repetition.

The fix is a one-line clamp; the proposal exists because the cap is a normative behavior that belongs in spec, and the change crosses both `hospital-srs` (二階) and `srs-queue` (一階) capabilities since both consume the same core function.

## What Changes

- Add `MAX_INTERVAL_DAYS = 365` named export to `packages/core/src/lib/srs.ts`.
- Clamp the correct-path `newInterval` to `Math.min(newInterval, MAX_INTERVAL_DAYS)` inside `reviewCardBinary`.
- Wrong path (partial reset) is **not** affected — it already cannot grow `interval` above its previous value.
- Both `hospital-srs` (二階) and `srs-queue` (一階) inherit the cap automatically because both use the same core function; spec deltas record this as a Req-1 scenario on each.
- Existing tunable constants (`SRS_DAILY_CAP`, `WRONG_INTERVAL_MULTIPLIER`, `WRONG_EASE_MULTIPLIER`, `STANDARD_INITIAL_INTERVALS`) stay unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hospital-srs`: Add scenario to Req 1 (Binary-input SM-2 review on answer) describing the 365-day cap on the correct-path expansion.
- `srs-queue`: Add scenario to the equivalent Req (一階 binary-input SM-2 review) describing the same cap. Since both capabilities use the same core function, this is the spec record that they share the behavior.

## Impact

- Code: `packages/core/src/lib/srs.ts` (one constant + one `Math.min` line). Both apps' Dexie write paths (`apps/medexam-tw/src/lib/mastery.ts` and `apps/medexam2-hospital-tw/src/lib/mastery.ts`) inherit the cap with zero local change — they call `reviewCardBinary` directly.
- Tests: `packages/core/src/lib/srs.test.ts` if it exists; otherwise add scenario tests at the spec-driven verify step.
- Data: No Dexie schema migration. Existing rows with `interval > 365` (unlikely yet, since SRS only shipped 2026-05-14) are left alone — the cap only applies to fresh updates. If any over-cap row exists, the next correct answer naturally clamps it.
- API surface: `MAX_INTERVAL_DAYS` becomes a new named export from `@study-rpg/core`, alongside the other SRS constants. Patch-level bump on next npm publish.
- No deploy / GH Actions / Supabase migration changes needed.
