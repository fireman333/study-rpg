# Tasks — anonymous → authed rescue adoption (cloud-wins-B)

## 1. Implementation (cloud-wins-B, no UI)

- [x] 1.1 `backfill/rescue.ts`: `backfillRescueLWW` gains `opts?: { cloudPlanWins?: boolean }`; plan-envelope block takes the cloud envelope verbatim when `cloudPlanWins && parsePlanEnvelope(incoming)?.plan != null`, else normal `pickPlanEnvelopeLWW`. Import `parsePlanEnvelope`.
- [x] 1.2 `backfill/index.ts`: `runOnPullComplete` gains `opts?: { rescueCloudPlanWins?: boolean }`, passes `{ cloudPlanWins: opts?.rescueCloudPlanWins }` to `backfillRescueLWW`.
- [x] 1.3 `adoption-cloud-wins.ts` (NEW): `createAdoptionCloudWins(active)` — the flag lifecycle unit (`consumeForPull` / `onStartupSettled` / `onPushLanded` / `isPending`). Protection holds until the device reconciles ONCE (definitive pull OR landed push).
- [x] 1.4 `useSync.ts`: wire the helper — `consumeForPull()` in onPullComplete; `onPushLanded()` in onPushComplete; `onStartupSettled(res !== null)` after `beginStartupForcePull()`; `clearEtag(user.id)` on 'proceed-and-write'.
- [x] 1.5 `engine.ts`: `pullNow` returns `PullBundleResult | null` (null on error); `beginStartupForcePull` returns that result promise (retains the void view for the bounded first-push await).

## 2. Codex pre-ship review (3 rounds — gated ship)

- [x] 2.1 Round 1 → do-not-ship: Finding 1 (blobMissing startup leaks the flag) + Finding 2 (retained ETag lets first push beat cloud-wins). Fixed via 1.4/1.5 + clearEtag.
- [x] 2.2 Round 2 → do-not-ship: Findings 1/2 closed; residual (errored startup + landed empty-cloud push leaks). Fixed via `onPushLanded()` in onPushComplete (Codex's prescribed fix).
- [x] 2.3 Round 3 → **ship**: residual closed, no new findings, 4 verify points confirmed, lifecycle tests locked.

## 3. Tests + verify

- [x] 3.1 `adoption-cloud-wins.test.ts` (NEW, 6): full flag lifecycle incl. the errored-startup→landed-push residual. `sync-engine-startup-pull.test.ts` (NEW, 4): `beginStartupForcePull` non-null/null resolution contract. `rescue-sync.test.ts` (4): cloud-active-wins / normal-LWW-unchanged / no-cloud-key carry-over / cloud-null-no-force-win.
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; full neurons suite **1091 green**.
- [ ] 3.3 `openspec validate add-neurons-rescue-anon-authed-claim --strict` passes.

## 3. Spec + archive (gated on owner confirm)

- [x] 3.1 Spec delta: `neurons-single-subject-rescue` ADDED "Anonymous rescue does not clobber an account's cloud plan on first sign-in" (3 scenarios). **Wording pending owner confirm (curator rule).**
- [ ] 3.2 `/opsx:archive` (sync gate) — after owner confirms spec wording.
- [ ] 3.3 Commit + merge track-neurons → main + deploy (owner-gated: merge = deploy = 對外發布).

## 4. Real-device verification (post-deploy, localhost dev R2 push unavailable)

- [ ] 4.1 Fresh browser profile (anonymous) → start a rescue plan (科目 A) → sign into an account that already has a cloud rescue plan (科目 B) → confirm 科目 B (cloud) wins, 科目 A (anonymous) is discarded and NOT uploaded.
- [ ] 4.2 Fresh browser profile (anonymous) → start a rescue plan → sign into a NEW account (no cloud rescue) → confirm the anonymous plan carries over.
