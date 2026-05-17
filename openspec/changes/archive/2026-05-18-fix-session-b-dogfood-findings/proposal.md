## Why

Session B dogfood (2026-05-17~18) surfaced two issues — see `openspec/decisions/2026-05-18-session-b-dogfood.md`.

**(a) MEDIUM** — When player reputation < event penalty amount, `services/event.ts` clamps state to floor 0 via `Math.max(0, ...)` but logs and returns the intent delta. Both `eventLog` row and modal copy then report intent (-5,000) instead of actual deduction (e.g. 864 → 0 yields -864). This breaks telemetry sums and confuses players reading「聲望 −5,000」when they only lost 864.

**(b) LOW** — `AssignDoctorModal` facility 升級設施 button stays labeled「升級設施」+ greyed when revenue < cost. Only a hover tooltip via `title=` attribute communicates「需要 N 營收」. `/training` UI has the parity pattern: button label morphs to「需要 N 營收」directly. Inconsistent affordance feedback across two upgrade flows.

## What Changes

- **MODIFIED capability `hospital-events`** — Add normative requirement that reputation deltas in `eventLog` and resolver return values SHALL report ACTUAL change after floor clamping, not intent. Affects medical-malpractice accept-penalty + audit-event fail. Toast events (負面新聞 / 學會質疑) apply via `tick.ts` and are deferred to a separate change.
- **Code**: `services/event.ts:resolveMalpractice` accept-penalty branch + `services/event.ts:resolveAudit` fail branch — compute `actualDelta = newRep - oldRep` after `Math.max(0, ...)` floor; use for `eventLog.reputationDelta` AND resolver return value.
- **Code**: `AssignDoctorModal.tsx` facility upgrade button visible label morphs to「需要 N 營收」when `!canAffordUpgrade`, parity with `TrainingPage`.

## Impact

- **Out of scope**: `tick.ts` toast-event apply path (separate audit; same bug pattern but distinct entry point).
- No schema migration / no breaking change.
- Spec delta lives in `hospital-events`; `hospital-finances` spec already covers facility upgrade insufficient-funds normative behavior — current `title=` tooltip loosely satisfies the「UI SHALL display an insufficient-funds error」requirement, this change upgrades to visible label parity with TrainingPage.
