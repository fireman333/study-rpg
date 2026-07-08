# Design — anonymous → authed rescue adoption (cloud-wins-B)

## Decision

On the **first cloud pull after an anonymous device signs into an account** (the account-switch gate's `proceed-and-write` / marker-was-null path), if the account's cloud rescue plan envelope carries a **non-null (active) plan**, the cloud plan is **authoritative** — it replaces the local plan envelope regardless of `updatedAt`. If the cloud plan is **absent or explicit-null**, normal last-write-wins runs, so a genuinely-new account still carries the anonymous plan over.

Chosen over the two alternatives (owner decision 2026-07-08):
- **A — claim prompt** (「保留雲端 / 用本機」 modal): safest/most explicit, but the trigger (anonymous active rescue use → then sign into an *existing* account with a cloud plan) is so narrow it would essentially never surface a modal; extra pull-then-pause + UI cost not justified.
- **C — general anonymous-adoption gate** (all account-owned families): over-scoped; would touch the documented `neurons-cloud-sync` "anonymous-progress upload-merge unchanged" invariant for prescription/counters/etc. that are not at risk here.

B closes the actual data-loss hole (anonymous plan LWW-clobbering the account's real cloud plan) with no UI and no change to the general anonymous-merge behavior for other families.

## Mechanism (why it's safe + minimal)

1. **One-shot adoption flag** (`useSync.ts`): when `evaluateAccountGate(...) === 'proceed-and-write'` (marker was null = first-ever sync on this device), set `rescueAdoptionPullPending = true`. The engine's `onPullComplete` reads and immediately clears it, so the cloud-wins override applies to **exactly one pull** (the startup force-pull); every later pull reverts to normal LWW.
2. **Thread the flag** `useSync → runOnPullComplete(db, result, { rescueCloudPlanWins }) → backfillRescueLWW(db, meta, { cloudPlanWins })`. Both params are optional → no other caller affected.
3. **Merge override** (`backfill/rescue.ts`): `cloudActivePlanWins = opts.cloudPlanWins === true && parsePlanEnvelope(incomingRaw)?.plan != null`. When true, take the incoming cloud envelope verbatim; else `pickPlanEnvelopeLWW` (unchanged).
4. **Ordering safety** — already guaranteed: `engine.beginStartupForcePull()` runs on mount and "the first push awaits it (bounded)" (`useSync.ts:118-121`). So the cloud-wins merge lands **before** any anonymous local plan can be pushed → the anonymous plan is never uploaded to clobber the account.

## Boundaries / non-goals

- **Non-null only.** A cloud *null* envelope (account abandoned its plan) does NOT force-win — nothing to protect; normal LWW lets a later anonymous plan carry over. A cloud *absent* plan key is skipped entirely (`hasPlan === false`) → anonymous plan survives. Both preserve new-account carry-over.
- **Plan envelope only.** Run-scoped confidence/override keys are namespaced by `planCreatedAt`; once the plan envelope becomes the cloud plan (cloud's `createdAt`), the anonymous run's conf/ovr keys are simply out-of-run orphans (different keys, no collision with cloud's conf/ovr) and GC out of the 14-day window. No separate handling needed.
- **Not a general gate.** Prescription / counters / representatives / etc. keep their existing anonymous-adoption behavior (`neurons-cloud-sync` unchanged).

## Flag lifetime (hardened over 3 Codex pre-ship review rounds)

The cloud-wins "protection" must apply during adoption but never leak past it. It is a small tested unit `adoption-cloud-wins.ts` (`createAdoptionCloudWins`). Protection holds from sign-in until the device reconciles with the account's cloud rescue state **exactly once**, via whichever comes first:

- **a definitive pull** — the startup force-pull settling non-null (`onStartupSettled(true)`: applied / notModified / blobMissing), or any pull whose backfill `consumeForPull()` returns true and applies cloud-wins; OR
- **a landed push** (`onPushLanded()`) — after `clearEtag(user.id)` on adoption the first push uses `If-None-Match:*`, so a landed push proves the cloud blob did not pre-exist (no account plan to protect); an existing plan would 412 → recovery pull consumes protection instead.

Two leaks Codex caught and this closes:
1. **blobMissing startup** (new account) never fires `onPullComplete` → without `onStartupSettled` the flag would leak to a later pull and misfire. Fix: `beginStartupForcePull()` now returns the pull result; `onStartupSettled(res !== null)` clears on a definitive read (keeps on error).
2. **errored startup + landed push to empty cloud** — protection kept on error, but a first push that lands proves empty cloud → `onPushLanded()` clears it so a later applied pull can't misfire.

`clearEtag(user.id)` on `'proceed-and-write'` also makes the ordering airtight: no stale `If-Match` → the first push can't overwrite an existing cloud plan before cloud-wins runs.

## Verification

- Unit: `adoption-cloud-wins.test.ts` (6 — the full flag lifecycle incl. the errored-startup→landed-push residual), `sync-engine-startup-pull.test.ts` (4 — the `beginStartupForcePull` non-null/null resolution contract), `rescue-sync.test.ts` (4 — cloud-active-wins / normal-LWW-unchanged / no-cloud-key carry-over / cloud-null-no-force-win). Full neurons suite **1091 green** + typecheck clean. Codex 3-round adversarial review → **ship** (Findings 1/2 + review-#2 residual all closed, no new findings).
- Real-device only (localhost dev R2 push unavailable): anonymous rescue on a fresh browser profile → sign into an account that already has a cloud plan → confirm the account's plan wins (anonymous plan discarded, not uploaded); and a NEW account → confirm the anonymous plan carries over.
