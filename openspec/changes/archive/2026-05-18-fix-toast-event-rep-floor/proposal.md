## Why

The archived `fix-session-b-dogfood-findings` change fixed reputation-floor mismatch for modal events (`services/event.ts:resolveMalpractice` + `resolveAudit`) but explicitly deferred the identical bug in the passive-event toast apply path: its Impact section reads「Out of scope: tick.ts toast-event apply path (separate audit; same bug pattern but distinct entry point)」. This change closes that loop. The same player-confusion pattern applies: a player with reputation 800 hit by a 「負面新聞 −3,520 聲望」 toast sees the toast claim −3,520 but reputation only drops to floor 0 (actual −800), and the eventLog row records the intent −3,520 — breaking telemetry sums and player trust.

## What Changes

- Modify `apps/medexam2-hospital-tw/src/lib/tick.ts` toast-outcome apply branch (lines 224–237) to compute `actualRepDelta = newReputation − prevReputation` after the `Math.max(0, ...)` floor clamp.
- Use `actualRepDelta` to write `eventLog.reputationDelta` (was: intent ±`delta.amount`).
- Reconstruct the `toastEvent.outcome.amount` field from `Math.abs(actualRepDelta)` so the rendered toast copy 「負面新聞：−N 聲望」 displays the realized impact, not the intent.
- Spec delta in `hospital-events` capability — extend「Event UI SHALL distinguish actionable (modal) from passive (toast) events」 requirement to add normative actual-delta reporting for toast `reputation-loss` outcomes, parity with modal events. Add 2 scenarios covering the floor-clamp and no-floor-needed cases.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `hospital-events`: extend the passive-toast-event requirement to mandate actual-delta reporting on floor-clamped reputation losses (eventLog + toast UI copy).

## Impact

- **Affected code** (1 file): `apps/medexam2-hospital-tw/src/lib/tick.ts` (~15 LOC).
- **Affected specs** (1 file): `openspec/specs/hospital-events/spec.md` delta with MODIFIED requirement + 2 new scenarios.
- **No schema change** — pure runtime fix on existing flow.
- **No DB migration** — eventLog rows written prior to this fix retain incorrect intent values; not retro-fixed (legacy data is acceptable noise, no telemetry consumer depends on per-row precision yet).
- **No UI structural change** — only the value passed to `EventToast` changes; component renders the same `outcome.amount` string but receives realized amount instead of intent.
- **No cloud sync impact** — `gameCounters.reputation` already syncs the correct floor-clamped value; only `eventLog` rows benefit from the new accuracy.
- **Out of scope** (separate changes, already tracked):
  - F1 SPA subpath fallback fix (capability `deploy-pipeline`)
  - Modal event paths (already fixed by `fix-session-b-dogfood-findings`)
  - 一階 `reading-loop` idle policy review
