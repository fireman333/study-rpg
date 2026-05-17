## Context

Session B dogfood evidence (2026-05-17~18) collected via Chrome MCP + JS state injection on https://fireman333.github.io/study-rpg/hospital/. Yesterday's 11 commits all hold up; 2 minor issues remain. Full findings in `openspec/decisions/2026-05-18-session-b-dogfood.md`.

## Decisions

### D1 — Floor clamping stays; reporting follows reality

The `Math.max(0, reputation + delta)` floor in event resolvers is intentional player-friendly behavior (no negative rep). The fix is to keep the floor but **derive `actualDelta` from `oldRep / newRep`**, not from the constant intent delta. Apply to `eventLog` row AND resolver return value so both telemetry and UI agree with state.

```ts
// Before
const repDelta = -MALPRACTICE_PENALTY_REP
await db.gameCounters.put({ ..., reputation: Math.max(0, counters.reputation + repDelta) })
await db.eventLog.add({ ..., reputationDelta: repDelta })  // ← intent, may differ from actual
return { ..., reputationDelta: repDelta }                   // ← same issue

// After
const oldRep = counters.reputation
const intentDelta = -MALPRACTICE_PENALTY_REP
const newRep = Math.max(0, oldRep + intentDelta)
const actualDelta = newRep - oldRep
await db.gameCounters.put({ ..., reputation: newRep })
await db.eventLog.add({ ..., reputationDelta: actualDelta })  // ← matches state
return { ..., reputationDelta: actualDelta }                    // ← matches state
```

Same pattern applies to `resolveAudit` fail branch.

### D2 — Facility button label parity, not tooltip replacement

`AssignDoctorModal.tsx:170` keeps the `title=` attribute (good for hover + a11y screen reader). Just adds dynamic visible label:

```tsx
<button disabled={busy || !canAffordUpgrade} title={canAffordUpgrade ? '' : `營收不足（需要 ${fmt(upgradeCost)} 💰）`}>
  {canAffordUpgrade ? '升級設施' : `需要 ${fmt(upgradeCost)} 💰`}
</button>
```

Behavior parity with `TrainingPage` doctor card 進修 button which renders「需要 25,000 營收」inline when revenue insufficient.

### D3 — Toast event apply path deferred to separate change

`tick.ts` applies 負面新聞 / 學會質疑 inline (no resolver call). Same intent-vs-actual mismatch exists there but spans a different code path with its own state semantics. Separate change keeps scope bounded; surface in follow-up after `fix-session-b-dogfood-findings` archives.

### D4 — Spec delta on hospital-events not hospital-finances

The MEDIUM bug is event-resolver reporting. Lives in `hospital-events` Requirement 2 (medical-malpractice resolution). LOW bug is facility UI parity which is already loosely specced via `hospital-finances` Scenario「Upgrade blocked when revenue insufficient」(「UI SHALL display an insufficient-funds error」). Visible label is a stronger form of the same affordance — no new spec requirement, just better implementation. No spec delta needed for the LOW fix.
