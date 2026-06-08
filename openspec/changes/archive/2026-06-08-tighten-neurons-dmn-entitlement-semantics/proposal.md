## Why

Three P1 gaps surfaced by a 2026-06-08 mechanics audit make the DMN fate-card entitlement model under-specified and internally contradictory after the `add-neurons-expedition-rewards` + `realign-dmn-event-rewards-to-maze` pivots:

1. **Reading-timer ↔ DMN draw source contradict each other across specs.** `neurons-mode` Req「Reading-timer SHALL accrue study minutes and publish ticks to the DMN time-axis subscriber」still wires the reading timer into the DMN time-axis. But `neurons-dmn-fate-cards` already moved the time-axis to **expedition completion** (`onExpeditionComplete` → `creditExpeditionDraws`). A reader of the two specs gets opposite answers to「閱讀 30 分鐘會不會給我抽 DMN？」.
2. **DMN daily counters have no documented cross-device merge semantics.** `dmnDrawsAvailable` (the unspent entitlement pool), `dmnTimeAxisDrawsConsumedToday` / `dmnBehaviorAxisDrawsConsumedToday` (per-axis daily caps), and the lazy local-TZ midnight reset are persisted as synced meta keys, but no requirement says whether they merge LWW / monotonic-MAX / op-log-union. Two devices crossing local midnight or earning + spending draws in parallel can silently swallow entitlement or duplicate-grant — the same family of failure as the `everWrong` / `dmnEventLog` carve-outs already documented in `CLAUDE.md`, but not codified here.
3. **Both-pools-exhausted draw is undefined.** Once the consumable dex hits 22/22 AND every catalog equipment is owned, the spec only says fall-through is「null」. It does not say whether the draw action decrements `dmnDrawsAvailable`, whether the UI button is disabled, or whether an unspent draw is refunded — so an endgame player can burn a hard-earned entitlement on nothing.

This change pins all three down at the spec layer. It is **propose-only on the mechanics layer**: spec deltas tighten the contract; no Dexie bump, no R2 `SCHEMA_VERSION` bump, no Worker change. Apply-phase code follow-ups (if any are needed to match the tightened spec) are tracked in tasks.md but are intentionally small / surgical.

## What Changes

- **MODIFY `neurons-mode`**: the reading-timer requirement drops「publishes ticks to the DMN time-axis subscriber」. The reading timer keeps its `totalStudyMinutes` accrual and its maze-energy faucet role, but is **no longer** a DMN entitlement source. DMN time-axis entitlement is owned entirely by `neurons-dmn-fate-cards` (expedition-completion path).
- **MODIFY `neurons-dmn-fate-cards`**:
  - The mixed-trigger requirement is tightened to say explicitly that the time-axis source is **expedition completion only**, not reading minutes; cross-reference a「reading minutes SHALL NOT grant DMN draws」scenario.
  - A new requirement defines **daily-counter sync semantics**: `dmnDrawsAvailable` uses op-log-union of grant + consume events (or an equivalent monotonic formulation), and the per-axis `*ConsumedToday` counters + last-reset date use monotonic-MAX on the local-TZ date key so a cross-midnight race never reopens yesterday's cap. Lazy local-TZ midnight reset is preserved.
  - The「draw rolls equipment first, else consumable」requirement gains a **both-pools-exhausted** scenario: the draw action SHALL be disabled at the UI layer when `consumablesCollected === 22 && equipmentOwned === catalog.length`; if a stale client somehow invokes it, the engine SHALL NOT decrement `dmnDrawsAvailable` and SHALL return a `pools_exhausted` no-op.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-mode`: reading-timer requirement decoupled from DMN time-axis (drops one scenario / clause, no behavior loss — `totalStudyMinutes` + maze-energy roles unchanged).
- `neurons-dmn-fate-cards`: mixed-trigger requirement tightened (time-axis = expedition only); new daily-counter sync-semantics requirement; both-pools-exhausted scenario added to the equipment-then-consumable draw requirement.

## Impact

- **Specs**: 2 modified (`neurons-mode`, `neurons-dmn-fate-cards`). No new capability spec.
- **Code**: best-case zero — if implementation already matches (reading-timer no longer feeds DMN dispatcher; daily counters already merge correctly; UI already disables the button at full dex). Apply phase audits 4 narrow surfaces (`apps/neurons-tw/src/lib/services/reading-timer.ts` time-axis publish call, `apps/neurons-tw/src/lib/sync/tables.ts` meta-key merge for the 3 daily keys, `apps/neurons-tw/src/lib/services/dmn-fate-card.ts` `drawDmnCard` exhausted branch, `apps/neurons-tw/src/components/DmnDrawButton.tsx` disable predicate) and only edits when behavior diverges from the tightened spec.
- **Persistence**: no Dexie `.version()` bump, no v(N-1)→v(N) upgrade fixture needed. Daily-counter keys are existing synced meta — the sync-semantics requirement documents existing intent + locks future drift, it does not change the stored shape.
- **R2 bundle**: `SCHEMA_VERSION` unchanged. No Worker / D1 / Supabase change.
- **Validator / lint**: `pnpm lint:dexie-fixtures` not triggered (no schema bump). `openspec validate` runs against the 2 modified specs.
- **Test**: any new behavior asserted by tightened spec gets a Vitest unit test (e.g., `dmn-daily-counters-merge.test.ts` if the sync adapter does need a touch-up; `dmn-draw-exhausted.test.ts` for the no-op branch).
