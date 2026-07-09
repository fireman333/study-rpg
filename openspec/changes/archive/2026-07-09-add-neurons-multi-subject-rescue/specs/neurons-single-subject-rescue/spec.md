## ADDED Requirements

### Requirement: Rescue plans SHALL sync per-family as coexisting latest-action-wins LWW envelopes, lifecycle-managed

The app SHALL support **multiple rescue plans coexisting**, at most one per `family`. Entering rescue for a family SHALL create a rescue plan `{ familyId, examDate, dailyMinutes, createdAt, lastStudiedAt, blitzDoneAt? }` persisted in the Dexie `meta` table under the **per-family key `rescue:v1:plan:{familyId}`** as a timestamped envelope `{ plan: RescuePlan | null, updatedAt }`, and each envelope SHALL sync cross-device via the R2 `neurons` bundle meta path (per the rescue key-family requirement). Every plan mutation — start, study-touch (`lastStudiedAt`), blitz completion (`blitzDoneAt`), abandon, and auto-archive — SHALL rewrite that family's whole envelope with a fresh `updatedAt`. The cross-device merge SHALL be **per-family envelope-level LWW on `updatedAt` (latest action wins)**, enforced by the registered backfill post-pass over every incoming `rescue:v1:plan:*` key; timestamp ties SHALL be broken by a deterministic total order over the serialized envelope so each family's envelope converges in any pull order. Abandon and auto-archive SHALL write an **explicit `plan: null`** envelope (for that family's key) with a fresh `updatedAt` (LWW-null, no tombstone), so a clear propagates to every device and a cleared plan never resurrects from a stale bundle whose envelope is older. `createdAt` SHALL be de-duplicated on same-device mint (a colliding `Date.now()` is advanced by 1 ms) so two plans started in the same millisecond never share a run scope.

Plans for **different families SHALL coexist independently** — starting a rescue for family B while family A is active SHALL NOT require replacing A; both plans remain active, subject only to the coexistence cap (per the cap requirement). Starting a rescue for a family that **already has an active plan** SHALL resume that plan (no new `createdAt`, no envelope rewrite), not mint a silent restart. Each plan SHALL auto-archive on or after its own `examDate + 1 day`, and archiving one family's plan SHALL revert only that family's targeted-drill absorption (per `neurons-weakness-radar`) on every device once its null envelope is applied. The player SHALL be able to abandon any single active plan at any time from any device without affecting other families' plans. `blitzDoneAt` SHALL ride each family's envelope so the diagnostic blitz for one plan runs at most once **across all devices**; a device pulling a plan with `blitzDoneAt` set SHALL rebuild that family's queue deterministically from the synced `questionHistory` and confidence records instead of re-running the blitz. This requirement SHALL NOT bump the Dexie `.version()` chain (the plans ride the pre-existing `meta` store, non-indexed).

#### Scenario: Starting a plan syncs it to other devices

- **WHEN** the player starts a rescue for a family with an exam date and daily-minutes budget on device A
- **THEN** the envelope at `rescue:v1:plan:{familyId}` SHALL be written with the new plan and a fresh `updatedAt`
- **AND** after a sync cycle, device B SHALL render the same active plan (D-countdown, family, budget)

#### Scenario: Two different subjects coexist across devices

- **GIVEN** a rescue plan for family A active in the synced state (created on device A)
- **WHEN** the player starts a rescue for family B on device B
- **THEN** the app SHALL NOT prompt to replace A, and both `rescue:v1:plan:A` and `rescue:v1:plan:B` envelopes SHALL be active
- **AND** after a sync cycle both devices SHALL render both active plans

#### Scenario: Starting the same subject again resumes, not restarts

- **GIVEN** an active plan for family A
- **WHEN** the player opens rescue for family A again (without an explicit reset)
- **THEN** the existing plan SHALL be resumed with no new `createdAt` and no envelope rewrite

#### Scenario: Abandon one subject leaves the others active

- **GIVEN** active plans for families A and B synced to devices
- **WHEN** the player abandons A on device A
- **THEN** device A SHALL write `{ plan: null, updatedAt: now }` to `rescue:v1:plan:A` only
- **AND** device B's next pull SHALL clear A's plan and revert A's targeted-drill absorption while B's plan remains active
- **AND** a later pull of any stale bundle whose A-envelope is older SHALL NOT resurrect A

#### Scenario: Divergent offline starts of different subjects both survive

- **GIVEN** device A starts a rescue for anatomy and device B starts a rescue for pharmacology, both offline
- **WHEN** both devices subsequently sync, in either pull order
- **THEN** both devices SHALL converge on holding both the anatomy and the pharmacology plan (distinct keys, no mutual overwrite)

#### Scenario: Each plan auto-archives at its own exam date

- **GIVEN** active plans for A (examDate passed) and B (examDate in the future)
- **WHEN** the app next evaluates plans on any device
- **THEN** A SHALL be archived by writing A's explicit-null envelope and reverting A's absorption, while B remains active and unarchived

#### Scenario: A second device does not re-run a plan's diagnostic blitz

- **GIVEN** a synced plan whose `blitzDoneAt` is set (the blitz ran on device A)
- **WHEN** the player opens that family's rescue on device B
- **THEN** device B SHALL NOT run a full diagnostic blitz
- **AND** it SHALL rebuild that family's day-queue deterministically from the synced `questionHistory` and confidence records

### Requirement: Rescue plan coexistence SHALL be bounded by a soft nudge and a hard cap

The number of concurrently-active rescue plans SHALL be bounded. At **3 or more** active plans the setup flow SHALL surface a non-blocking time-budget nudge (the combined daily-minutes budget is growing). At the **hard cap of 5** active plans the "add a new plan" affordance SHALL be disabled; the player may still open, edit, or abandon existing plans. The cap is a real ceiling against batch-misfire and duplicate mounts, and it is dogfood-tunable.

#### Scenario: Soft nudge at three plans

- **GIVEN** two active rescue plans
- **WHEN** the player adds a third
- **THEN** setup SHALL show a non-blocking time-budget nudge but SHALL still allow the plan to start

#### Scenario: Hard cap at five plans

- **GIVEN** five active rescue plans
- **WHEN** the player opens the rescue overview
- **THEN** the "add a new plan" affordance SHALL be disabled, while opening / editing / abandoning existing plans remains available

### Requirement: Multi-plan lifecycle writes SHALL be startup-gated, archived per-subject, and migration-ordered

Every per-family lifecycle write that rewrites a plan envelope — start, abandon, replace/reset, exam-date edit, `touchLastStudied`, and **blitz completion (`markBlitzDone` / `blitzDoneAt`)** — SHALL be gated on the startup force-pull having landed (`startupSyncPending`), not only the initial setup button, so a stale device cannot write a fresh-`updatedAt` per-family envelope that LWW-clobbers another device's newer run for that family. `archiveIfDue` SHALL iterate **all** active plans and archive each at its own `examDate + 1 day` (missing one lets an expired plan linger; over-eager clearing must not wipe a sibling).

The one-time migration of the legacy single `rescue:v1:plan` envelope into `rescue:v1:plan:{familyId}` SHALL complete **before the first push** (R2 is a whole-snapshot overwrite; a first push carrying neither the legacy key nor the per-family key would be a data-vacuum window). Because the per-family matcher no longer admits the legacy single `rescue:v1:plan` key, the account-level (cloud) legacy migration SHALL read the legacy key directly from the **raw pulled bundle meta** in the rescue backfill post-pass (not via the synced-meta matcher, which would skip it) and write the per-family envelope; the device-local (localStorage / existing `db.meta`) legacy migration runs in hydrate before the first push. A legacy `plan: null` envelope (which carries no familyId) SHALL be discarded and SHALL NOT be used to clear any per-family plan.

#### Scenario: Abandon is gated on startup sync

- **GIVEN** a device that has just cold-booted and whose startup force-pull has not yet landed
- **WHEN** an abandon (or replace / exam-date edit / touch) would fire for a family
- **THEN** the write SHALL be held until the startup pull lands, so it cannot clobber a newer cloud run for that family

#### Scenario: Archive sweeps every due plan, not just one

- **GIVEN** two plans both past their `examDate + 1 day`
- **WHEN** `archiveIfDue` runs on any device
- **THEN** BOTH plans SHALL be archived (each its own null envelope), not only the first-found active plan

#### Scenario: Legacy plan migrates before the first push

- **GIVEN** a device upgrading from the single-plan build with a legacy active `rescue:v1:plan`
- **WHEN** it first hydrates
- **THEN** the legacy plan SHALL be migrated to `rescue:v1:plan:{plan.familyId}` before any push fires, and a legacy `plan: null` SHALL be discarded rather than used to clear per-family plans

#### Scenario: Blitz completion is gated on startup sync

- **GIVEN** a stale device whose startup force-pull has not yet landed
- **WHEN** a diagnostic blitz finishes and would write `blitzDoneAt` via `markBlitzDone`
- **THEN** the envelope write SHALL be held until the startup pull lands, so it cannot clobber another device's newer run for that family

#### Scenario: A cloud legacy plan migrates via the raw bundle, not the matcher

- **GIVEN** a fresh v28 device signing into an account whose cloud bundle still carries a legacy single `rescue:v1:plan` (written by the pre-multi build) and no per-family key
- **WHEN** the first pull's rescue backfill runs
- **THEN** the legacy plan SHALL be read from the raw bundle meta and written as `rescue:v1:plan:{familyId}` before the first push, so the account's rescue plan is not lost to the matcher skip

## MODIFIED Requirements

### Requirement: Rescue synced state SHALL ride the meta sync path as a windowed rescue key family

The rescue plans, confidence, and override records SHALL persist in the Dexie `meta` table under the `rescue:v1:` namespace and SHALL sync cross-device through the existing R2 `neurons` bundle meta path as a **registered key family** (per the `neurons-cloud-sync` prefix-matched-family requirement). A single-sourced matcher `isSyncedRescueKey` SHALL be exported by the rescue service (which mints the keys) and imported by the sync layer, so the key mint and the sync filter can never drift. Membership SHALL be:

- `rescue:v1:plan:{familyId}` — always synced (one per active family);
- `rescue:v1:conf:{planCreatedAt}:{familyId}:{questionId}` and `rescue:v1:ovr:{planCreatedAt}:{familyId}:{conceptId}` — synced iff the embedded leading `planCreatedAt` lies within a trailing **run-sync window** (initial value 14 days, dogfood-tunable) with a +1-day forward tolerance for clock skew;
- the legacy single `rescue:v1:plan` key (no `{familyId}` segment) SHALL NOT match either — v28 clients never snapshot it, so a cloud legacy key written by the pre-multi build reaches a fresh device only through the backfill's raw-bundle migration read (per the migration requirement), never the synced-meta matcher;
- any other `rescue:v1:*` key SHALL NOT match. Rescue telemetry SHALL remain device-local (localStorage) and SHALL never enter the `meta` table or any bundle.

The override key SHALL carry a `{familyId}` segment because **conceptIds are shared across subjects** (68 conceptIds appear in ≥2 families — e.g. membrane-transport, insulin, cortisol) and `planCreatedAt` (a `Date.now()` mint) is NOT guaranteed unique across devices; without the family segment two coexisting plans that stop-loss the same shared concept at the same millisecond would collide on one override key. The confidence key carries the same `{familyId}` segment for symmetry (its `questionId` namespace is already globally unique, so this is defense-in-depth against a future corpus that shares question ids across subjects).

The family's merges SHALL be defined by a registered backfill post-pass (`backfillRescueLWW`, contract (b) of the `neurons-cloud-sync` family requirement): **per-family** plan-envelope LWW (iterating every incoming `rescue:v1:plan:*` key), per-key confidence LWW, and per-key override LWW, each with a deterministic total-order tiebreak over the serialized value so the merge converges bidirectionally in any pull order. A malformed incoming value SHALL never win; a malformed stored plan envelope SHALL be dropped so the reader regenerates cleanly.

Introducing the per-family key shapes SHALL bump the R2 bundle `SCHEMA_VERSION` from 27 to 28. The bump is load-bearing (not merely reader-tolerance): because an R2 PUT is a whole-snapshot overwrite, the presign Worker's downgrade guard (409 on a lower-version push) is what prevents a stale v27 client from pushing a snapshot that omits the per-family keys and thereby erasing them from the cloud blob. A v27 client reading a v28 bundle drops the unrecognised per-family keys (forward tolerance) and cannot push over v28 state; a v28 client reading a v27 bundle finds only the legacy single key and migrates it. NO Dexie `.version()` bump SHALL be required (the `meta` store pre-exists and the rescue keys are non-indexed).

The `rescue:v1:` prefix SHALL be account-OWNED: the account-switch wipe and in-place reset SHALL delete every `meta` key under it (per `neurons-cloud-sync`), which naturally covers the per-family plan/conf/ovr keys. Local garbage collection MAY delete only OUT-of-window `conf:`/`ovr:` keys; an in-window local delete is forbidden because the next pull would re-install it.

#### Scenario: Matcher admits exactly the intended per-family keys

- **WHEN** `isSyncedRescueKey` is evaluated against `rescue:v1:plan:anatomy`, an in-window `rescue:v1:conf:{planCreatedAt}:anatomy:{qid}`, an out-of-window `rescue:v1:ovr:{staleCreatedAt}:anatomy:{cid}`, and an unrelated `rescue:v1:telemetry` key
- **THEN** the first two SHALL match and the last two SHALL NOT
- **AND** the metaAdapter snapshot and apply SHALL both use this same test, so no rescue key syncs in one direction only

#### Scenario: Same-createdAt overrides on different subjects do not collide

- **GIVEN** two coexisting plans for families A and B minted at the same `planCreatedAt`, each stop-lossing the shared concept `membrane-transport`
- **WHEN** both override keys are written
- **THEN** they SHALL occupy distinct keys `rescue:v1:ovr:{createdAt}:A:membrane-transport` and `...:B:membrane-transport` and SHALL NOT overwrite each other

#### Scenario: SV 27→28 fences a stale whole-snapshot push

- **GIVEN** a v28 bundle carrying per-family rescue keys is in the cloud
- **WHEN** a v27 client attempts a whole-snapshot push (which omits the per-family keys)
- **THEN** the presign Worker SHALL refuse it with 409 (downgrade), so the per-family keys are not erased from the cloud blob
- **AND** a v27 client pulling the v28 bundle SHALL ignore the unrecognised per-family keys without error

#### Scenario: Account switch wipes the rescue namespace

- **WHEN** the account-switch wipe (or in-place reset) runs on a device holding `rescue:v1:*` meta keys
- **THEN** every key under the `rescue:v1:` prefix SHALL be deleted (all per-family plans, confidence, overrides), so the next account inherits no rescue state

#### Scenario: Stale-run keys cannot resurrect through a stale bundle

- **GIVEN** a bundle in the cloud still carrying `conf:`/`ovr:` keys whose leading `planCreatedAt` has aged out of the run-sync window
- **WHEN** a device pulls that bundle
- **THEN** those keys SHALL be rejected by the membership test at apply time and SHALL NOT be re-installed locally

### Requirement: Confidence SHALL be captured pre-reveal via a two-button submit and weight high-confidence-wrong

Inside a rescue session, submitting an answer SHALL be a **two-button, pre-reveal** action: after selecting an option, the player taps either "確定・有把握" or "確定・猜的" to submit, so the confidence tap IS the submit (no extra click) and is recorded **before** correctness is revealed. `Confidence(q)` SHALL be the sole home of the high-confidence-wrong multiplier: high-confidence-wrong SHALL be weighted ×1.5 (hypercorrection), low-confidence-correct ×1.1, otherwise ×1.0.

Confidence records SHALL persist as **run-scoped synced meta keys** `rescue:v1:conf:{planCreatedAt}:{familyId}:{questionId}` with value `{ signal: 'sure' | 'guess', at }` riding the R2 meta path (per the rescue key-family requirement), so a tap made on one device weights the queue on every device. The per-key merge SHALL be **LWW on `at`** (the latest pre-reveal tap wins), enforced by the registered backfill post-pass. Because multiple plans coexist, the confidence write path SHALL NOT resolve its target plan via a module-singleton "active plan" lookup; the rescue scene SHALL inject into `QuizModal` a **scene-bound submit callback carrying that scene's `{planCreatedAt, familyId}`**, so a tap in family A's scene can never be recorded under family B's run scope. Run identity SHALL be the scene's plan `createdAt` + `familyId`: starting or replacing a plan re-scopes all reads to the new `{planCreatedAt}:{familyId}` prefix with **no delete writes** — records of a previous run are ignored by readers and age out of the run-sync window. Existing `easyMarked`/`guessedMarked` flags MAY serve only as a cold-start prior. Post-reveal confidence collection SHALL NOT be used.

#### Scenario: Two-button submit records confidence before the answer is revealed

- **WHEN** the player selects an option in a rescue session and taps "確定・有把握"
- **THEN** the answer SHALL submit and the high-confidence signal SHALL be recorded before correctness is shown

#### Scenario: Confidence is recorded under the scene's own plan, not a singleton active plan

- **GIVEN** coexisting rescue plans for families A and B
- **WHEN** the player answers a question inside family A's scene
- **THEN** the confidence key SHALL be written under `rescue:v1:conf:{A.createdAt}:A:{qid}` via the scene-bound callback, never under family B's run scope

#### Scenario: High-confidence-wrong gets the hypercorrection weight

- **GIVEN** a question the player submitted as "有把握" but answered wrong
- **WHEN** it is scored for the next queue
- **THEN** its `Confidence(q)` multiplier SHALL be ×1.5 and it SHALL additionally be scheduled for extra review

#### Scenario: A re-tap wins by recency on merge

- **GIVEN** the same question carries `{signal:'sure', at:t1}` on device A and `{signal:'guess', at:t2 > t1}` on device B
- **WHEN** the two devices sync in either order
- **THEN** both SHALL converge on the t2 record ('guess')

### Requirement: Stop-loss SHALL switch intervention, and player override SHALL sync run-scoped via R2

When a concept reaches `attemptsToday >= 6` with `recentAccuracy < 0.40`, the rescue engine SHALL switch intervention by yield: a **high-frequency** stuck concept SHALL inject a concept-scoped re-read card — resolved from that concept's `CramPushItem` kernel content via its `sourceQuestionIds`, falling back to the subject-level `buildSpeedReviewCards` kernel (explicitly labeled a fallback) when no concept-level card exists — for a forced ~30-second re-read then re-test after ~60–90 minutes (retrieval practice is ineffective on never-encoded material); a **low-frequency** stuck concept SHALL be demoted (priority ×0.15).

A player override ("我就是要繼續練這塊") SHALL be recorded as a **run-scoped synced meta key** `rescue:v1:ovr:{planCreatedAt}:{familyId}:{conceptId}` with value `{ setAt, attemptsAtOverride }` riding the R2 meta path (per the rescue key-family requirement), merged per-key **LWW on `setAt`**, so an override granted on one device suppresses the same stop-loss on every device within that family's run. The `{familyId}` segment is required so that overriding a concept shared across two coexisting plans affects only the intended family (per the rescue key-family requirement). Override expiry (24 hours OR 6 more attempts) SHALL be **derived at read time** on every device (never persisted as a delete), so an expired record re-installed by a pull is inert; the attempts-based rule evaluates against the reading device's local attempt count (a device-relative baseline), with the 24-hour rule as the cross-device upper bound. The override SHALL NOT write `questionFlags.pinnedAt` or any daily-expedition state — rescue override keys are read ONLY inside the rescue scene, preserving the original no-leak guarantee. The override SHALL show its visible cost ("置頂會擠掉約 N 分鐘的高頻目標"), SHALL be served from a separate "加練" quota that does not displace the core queue, and SHALL NOT count toward any algorithm-success telemetry metric.

#### Scenario: High-frequency stuck concept switches to re-read then re-test

- **GIVEN** a high-frequency concept with ≥6 attempts today and recent accuracy <0.40
- **WHEN** stop-loss triggers
- **THEN** the engine SHALL inject its speed-review kernel card for a forced re-read and schedule a re-test after ~60–90 minutes, rather than continuing to drill it

#### Scenario: Override on a shared concept affects only the intended family

- **WHEN** the player overrides stop-loss on a concept shared by families A and B, inside family A's scene
- **THEN** a `rescue:v1:ovr:{A.createdAt}:A:{conceptId}` key SHALL be written, suppressing the stop-loss for A only
- **AND** family B's stop-loss on the same concept SHALL be unaffected

#### Scenario: Override syncs without leaking into daily expedition

- **WHEN** the player overrides stop-loss on a concept on device A
- **THEN** no `questionFlags.pinnedAt` or daily-expedition state SHALL be written, so daily expedition ordering on every device is unaffected
- **AND** after a sync cycle, device B's rescue scene SHALL honor the same stop-loss release within the run

#### Scenario: An expired override re-installed by a pull stays inert

- **GIVEN** an override record older than 24 hours that a device has locally cleaned up
- **WHEN** a pull re-installs the record from a peer's bundle
- **THEN** read-time expiry evaluation SHALL treat it as expired and stop-loss SHALL NOT be suppressed by it

### Requirement: Anonymous rescue does not clobber an account's cloud plan on first sign-in

Rescue plan/confidence/override state is account-owned but is writable while signed out (device-local anonymous play). On the FIRST cloud pull after an anonymous device signs into an account (the account-switch gate's `proceed-and-write` / marker-was-null path), the adoption reconcile SHALL first determine whether the account **already holds any rescue state** — i.e. whether the incoming cloud bundle carries any rescue plan key (`rescue:v1:plan:{familyId}` for any family, or the legacy `rescue:v1:plan`), active or explicit-null:

- **Account with existing rescue state** (the cloud bundle carries ≥1 rescue plan key): the reconcile SHALL be a per-family cloud-wins SET decision. For each family the cloud holds an active (non-null) plan, the cloud envelope SHALL be authoritative and replace the local envelope regardless of `updatedAt`. For each family the cloud has an explicit-null (abandoned) plan, that null SHALL win over an anonymous active plan (no resurrection), even if the anonymous `updatedAt` is later. For each family the cloud has **no** key at all but the local device has an anonymous active plan, that anonymous-only plan SHALL be **dropped** (not merged into the account), so anonymous play cannot leak subjects into an account that already has its own rescue state.
- **Brand-new account** (the cloud bundle carries **no** rescue plan key of any kind): the anonymous local plans SHALL all carry over via normal last-write-wins, so signing into a fresh account keeps the anonymous rescue progress.

This cloud-wins / SET reconcile SHALL apply ONLY to the first pull after adoption; every subsequent pull SHALL reconcile each family's envelope by normal latest-action-wins last-write-wins.

#### Scenario: Anonymous plan does not overwrite the account's cloud plan

- **WHEN** a device holding an anonymous local plan for family A (later `updatedAt`) signs into an account whose cloud bundle already carries an active plan for A (earlier `updatedAt`)
- **THEN** after the first pull the local A envelope equals the account's cloud A plan
- **AND** the anonymous A plan is not uploaded on the subsequent push

#### Scenario: An anonymous-only subject is dropped when the account already has rescue state

- **GIVEN** an anonymous device with an active plan for family C, signing into an account whose cloud bundle already carries a rescue plan for some other family (existing rescue state) but none for C
- **WHEN** the first post-adoption pull reconciles
- **THEN** the anonymous C plan SHALL be dropped (not merged into the account)

#### Scenario: Adoption does not resurrect an abandoned account plan

- **GIVEN** an account whose cloud holds an explicit-null (abandoned) envelope for family D, and an anonymous device with an active plan for D whose `updatedAt` is later
- **WHEN** the first post-adoption pull reconciles
- **THEN** the account's abandoned state for D SHALL win (the anonymous active D SHALL NOT resurrect the abandoned plan)

#### Scenario: Brand-new account (no cloud rescue at all) keeps anonymous rescue progress

- **WHEN** a device holding anonymous local plans signs into an account whose cloud bundle carries no rescue plan key of any kind
- **THEN** all anonymous local plans are retained after the first pull

## REMOVED Requirements

### Requirement: A single-subject rescue plan SHALL sync via R2 as a latest-action-wins LWW envelope, one-at-a-time account-wide, and lifecycle-managed

**Reason**: Superseded by multi-subject coexistence. The single `rescue:v1:plan` key and the one-at-a-time account-wide constraint are replaced by per-family keys (`rescue:v1:plan:{familyId}`) and bounded coexistence.

**Migration**: See the ADDED requirement "Rescue plans SHALL sync per-family as coexisting latest-action-wins LWW envelopes, lifecycle-managed" (plan key, coexistence, per-family lifecycle) plus "Rescue plan coexistence SHALL be bounded by a soft nudge and a hard cap" and "Multi-plan lifecycle writes SHALL be startup-gated, archived per-subject, and migration-ordered". The legacy single `rescue:v1:plan` envelope is migrated to `rescue:v1:plan:{familyId}` on first hydrate before the first push.
