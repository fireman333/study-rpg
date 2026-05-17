## 1. Core fix (`apps/medexam2-hospital-tw/src/lib/tick.ts`)

- [x] 1.1 Locate the `if (result.toastOutcome)` branch in the tick scheduler (around lines 222–246). Confirm the existing shape: `delta.kind` switch on `reputation-loss` vs `reputation-gain`, `Math.max(0, ...)` floor on loss, `db.eventLog.add({ reputationDelta: ... ?: ... })` with intent magnitude.
- [x] 1.2 Refactor the apply logic to mirror Session B's actual-delta pattern (`services/event.ts:85–105`):
    ```ts
    const delta = result.toastOutcome
    const intentDelta = delta.kind === 'reputation-loss' ? -delta.amount : delta.amount
    const prevRep = newReputation
    newReputation = Math.max(0, newReputation + intentDelta)
    const actualRepDelta = newReputation - prevRep
    ```
    `actualRepDelta` is signed (negative for floor-clamped or normal loss, positive for gain).
- [x] 1.3 Replace the `eventLog.add({ ..., reputationDelta: delta.kind === 'reputation-loss' ? -delta.amount : delta.amount, ... })` write with `reputationDelta: actualRepDelta`.
- [x] 1.4 Replace `toastEvent = { event: result.event, outcome: delta }` with `toastEvent = { event: result.event, outcome: { kind: delta.kind, amount: Math.abs(actualRepDelta) } }` so the toast UI receives realized magnitude.
- [x] 1.5 Add a single-line comment above the new computation referencing the Session B pattern: `// Compute actualRepDelta after floor clamp so eventLog + toast UI reflect realized impact, parity with services/event.ts:85–105 (malpractice / audit).`

## 2. Validation + smoke verify

- [x] 2.1 Run `pnpm -r typecheck` — verify no regression in 一階 / 二階 / shared packages.
- [x] 2.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` — verify production build succeeds.
- [x] 2.3 Run `pnpm --filter @study-rpg/medexam2-hospital-tw dev` locally. Chrome MCP smoke (stub visibility=visible throughout):
    - **T1 (floor-clamp loss)** — inject `reputation = 200` + `pendingEventId = null` + force `eventRollTickCounter` past threshold; force the RNG so a 負面新聞 toast rolls with intent loss ≥ 3,000. Verify after toast resolves: `reputation === 0`, `eventLog` latest row `reputationDelta === −200`, EventToast DOM text contains `−200 聲望` (NOT `−3,520`).
    - **T2 (no-floor gain)** — inject `reputation = 42_000`; force RNG so 學會獎項 toast rolls with intent gain. Verify after resolve: `reputation` increased by exactly the intent magnitude, `eventLog.reputationDelta === +amount`, EventToast DOM text contains `+amount 聲望`.
    - **T3 (no-floor loss, full magnitude)** — inject `reputation = 50_000`; force a 學會質疑 loss of 3,000. Verify: `reputation === 47_000`, `eventLog.reputationDelta === −3,000`, EventToast DOM text contains `−3,000 聲望`. (Regression check that no-floor case continues to display intent.)
- [x] 2.4 Run `openspec validate fix-toast-event-rep-floor` — confirm spec delta still valid.
- [x] 2.5 Manual visual check — open `/study` while a forced toast event is pending, confirm displayed magnitude matches `actualRepDelta`.

## 3. Spec sync + archive prep

- [x] 3.1 Run `/opsx:verify` to confirm coherence (proposal ↔ design ↔ specs ↔ tasks all consistent).
- [ ] 3.2 Run `/opsx:archive fix-toast-event-rep-floor` (will prompt for sync gate — confirm sync of delta into main `openspec/specs/hospital-events/spec.md`).
- [ ] 3.3 Verify post-archive: `openspec/specs/hospital-events/spec.md` MODIFIED passive-toast requirement reflects the actual-delta contract + both new scenarios present.
- [ ] 3.4 Commit (per Curator rules — wait for user explicit confirmation before `git commit`). Two commits: code apply + spec archive sync, mirroring the `fix-session-b-dogfood-findings` and `redesign-study-session-pomodoro` shipping pattern.
