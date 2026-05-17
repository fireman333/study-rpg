## Context

`fix-session-b-dogfood-findings` (archived 2026-05-18) established the contract「reputation deltas on event resolution SHALL report ACTUAL change after floor clamping, not intent」 — implemented in `services/event.ts:resolveMalpractice` accept-penalty branch (lines 85–105) and `resolveAudit` fail branch (lines 194–213). Both compute `actualDelta = newReputation - counters.reputation` after `Math.max(0, ...)`.

The toast event apply path in `apps/medexam2-hospital-tw/src/lib/tick.ts` (the `if (result.toastOutcome)` branch around lines 222–246) was explicitly out-of-scope at the time. It writes the same defensive floor (`Math.max(0, newReputation - delta.amount)`) but logs intent (`-delta.amount`) and passes intent (`outcome: delta`) onward to `EventToast`. The toast UI renders `outcome.amount` as the displayed value, so the player sees「−5,000 聲望」 even when reputation only dropped 200 to floor 0.

Three toast events are affected:
- `負面新聞` (`reputation-loss` with random magnitude 1,000–10,000)
- `學會質疑` (`reputation-loss` with random magnitude 1,000–10,000)
- `學會獎項` (`reputation-gain` — no floor concern; included for completeness)

## Goals / Non-Goals

**Goals:**
- Toast `reputation-loss` outcomes that cross floor 0 SHALL display the realized magnitude in the toast and write the realized delta to `eventLog.reputationDelta`.
- `reputation-gain` outcomes SHALL continue to display the intent magnitude (no floor → realized = intent; the same code path handles both transparently).
- Parity with the existing `fix-session-b-dogfood-findings` actual-delta contract for modal events.

**Non-Goals:**
- Retroactively fix existing `eventLog` rows written before this change (legacy data is acceptable noise).
- Modify the `TickEventToastOutcome` shape exported from `packages/content-medexam2-tw/src/events.ts` (`{ kind, amount }` stays the same — only the value of `amount` becomes realized rather than intent at the call site).
- Modify the `EventToast` component (it already renders `outcome.amount`; the displayed text becomes accurate when we feed it realized amount).
- Touch modal-event paths or F1 SPA fallback (separate changes).

## Decisions

### D1: Reuse the Session B pattern (compute realized delta after clamp)

**Choice:** Mirror the structure used in `services/event.ts:85–105`:

```ts
const prevRep = newReputation
const intentDelta = delta.kind === 'reputation-loss' ? -delta.amount : delta.amount
newReputation = Math.max(0, newReputation + intentDelta)
const actualRepDelta = newReputation - prevRep
```

**Rationale:** Same idiom keeps the codebase consistent and reviewable. The earlier change is already archived and shipped, so this is the established「actual-delta」pattern.

### D2: Reconstruct toast `outcome.amount` from `Math.abs(actualRepDelta)`

**Choice:** Pass a new object to `toastEvent`:
```ts
toastEvent = {
  event: result.event,
  outcome: { kind: delta.kind, amount: Math.abs(actualRepDelta) },
}
```

**Alternative considered:** Mutate `delta.amount` in place. Rejected — `delta` is a content-pack output, treat it as read-only.

**Alternative considered:** Change `EventToast` component to take a separate `actualAmount` prop and prefer it when present. Rejected — adds optional surface area to component contract; cleaner to fix at the call site so the type `{ kind, amount }` continues to mean「the amount the player saw / was actually applied」.

**Rationale:** Single-spot fix at the boundary where intent transitions to applied state. `EventToast` renders `outcome.amount` unchanged.

### D3: For `reputation-gain`, realized = intent (no floor concern)

**Choice:** The same computation produces `actualRepDelta = +delta.amount` for gain events because no floor clamp ever fires (reputation grows). No special branch needed.

**Rationale:** Uniform code path; one mental model.

### D4: Use eventLog.reputationDelta = actualRepDelta (signed)

**Choice:** Continue writing a signed delta (negative for loss, positive for gain) to `eventLog.reputationDelta`. Use `actualRepDelta` directly — already signed.

**Rationale:** Consistent with malpractice / audit fix and avoids re-deriving the sign from `kind`.

### D5: Don't backfill historical `eventLog` rows

**Choice:** Existing rows written before this change keep their intent-valued `reputationDelta`. No data migration.

**Rationale:** Telemetry consumers don't exist yet (it's a single-player local-first DB). Per-row precision matters going forward, not retroactively. A data migration to recompute realized deltas would need the historical reputation state at trigger time, which `eventLog` doesn't capture — infeasible.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Visual regression: gain events suddenly render different text (e.g., 學會獎項 +3,000 with rep at 50,000) | None expected — `actualRepDelta === +delta.amount` for gain events, identical to current; verified by code review (no `Math.max(...)` on positive deltas) |
| Toast event resolves so fast (`onToastEvent` is fire-and-forget) that race conditions can leak | The compute happens atomically inside the same `db.transaction('rw', ...)` block as `gameCounters.put`; downstream `toastEvent` is captured by closure before tx commits |
| Player surprised when intent says「-5,000」 but toast shows「-800」 | This is the desired correction. Players currently see misleading -5,000 when rep was only -800; new behavior matches reality |
| Test coverage gap | Same as the Pomodoro change: `packages/content-medexam2-tw/` and `apps/medexam2-hospital-tw/` have no vitest infra. Manual Chrome MCP smoke verification covers behavior (T1 negative-news with rep < intent fires floor; T2 学會獎項 with rep > 0 fires no-floor) |
| Tests are not added in tasks.md despite design referencing them | Acknowledged — test infra requires its own change. Smoke verification covers the contract for now |
| Spec scenarios use specific magnitudes (e.g., 「rep 200, intent -3,520, actual -200」) — magnitudes can drift if event constants change | The scenarios use illustrative numbers that obey the constraint `0 < startingRep < intentLossMagnitude` — they remain semantically correct as long as that inequality holds |

## Migration Plan

No data migration required — pure runtime behavior fix on the forward path.

1. Land code change in `tick.ts` (single file).
2. Sync delta into `openspec/specs/hospital-events/spec.md`.
3. Standard build → push → GitHub Pages deploy (when merged to `main`).
4. Existing rows in `eventLog` retain old intent values; new rows from the deploy onward use realized values.
5. Rollback: revert the tick.ts commit; revert the spec delta; redeploy. No state migration needed.

## Open Questions

None. Bug pattern + fix established by Session B; this change applies the same idiom to the parallel toast path.
