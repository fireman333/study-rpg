## RENAMED Requirements

- FROM: `### Requirement: A single-subject rescue plan SHALL be device-local, one-at-a-time, and lifecycle-managed`
- TO: `### Requirement: A single-subject rescue plan SHALL sync via R2 as a latest-action-wins LWW envelope, one-at-a-time account-wide, and lifecycle-managed`

- FROM: `### Requirement: Stop-loss SHALL switch intervention, and player override SHALL be device-local`
- TO: `### Requirement: Stop-loss SHALL switch intervention, and player override SHALL sync run-scoped via R2`

## ADDED Requirements

### Requirement: Rescue synced state SHALL ride the meta sync path as a windowed rescue key family

The rescue plan, confidence, and override records SHALL persist in the Dexie `meta` table under the `rescue:v1:` namespace and SHALL sync cross-device through the existing R2 `neurons` bundle meta path as a **registered key family** (per the `neurons-cloud-sync` prefix-matched-family requirement). A single-sourced matcher `isSyncedRescueKey` SHALL be exported by the rescue service (which mints the keys) and imported by the sync layer, so the key mint and the sync filter can never drift. Membership SHALL be:

- `rescue:v1:plan` — always synced;
- `rescue:v1:conf:{planCreatedAt}:{questionId}` and `rescue:v1:ovr:{planCreatedAt}:{conceptId}` — synced iff the embedded `planCreatedAt` lies within a trailing **run-sync window** (initial value 14 days, dogfood-tunable) with a +1-day forward tolerance for clock skew;
- any other `rescue:v1:*` key SHALL NOT match. Rescue telemetry SHALL remain device-local (localStorage) and SHALL never enter the `meta` table or any bundle.

The family's merges SHALL be defined by a registered backfill post-pass (`backfillRescueLWW`, contract (b) of the `neurons-cloud-sync` family requirement): plan-envelope LWW, per-key confidence LWW, and per-key override LWW, each with a deterministic total-order tiebreak over the serialized value so the merge converges bidirectionally in any pull order. A malformed incoming value SHALL never win; a malformed stored plan envelope SHALL be dropped so the reader regenerates cleanly.

Adding the family SHALL bump the R2 bundle `SCHEMA_VERSION` from 26 to 27 with reader tolerance: a v26 client reading a v27 bundle drops the unrecognised rescue keys, and its later pushes (which omit them) SHALL NOT wipe v27 state (first-write-wins never deletes local keys absent from an incoming bundle); a v27 client reading a v26 bundle finds no rescue keys and preserves its local rescue state. NO Dexie `.version()` bump SHALL be required (the `meta` store pre-exists and the rescue keys are non-indexed), and no Worker change SHALL be required (the bundle blob remains Worker-opaque).

The `rescue:v1:` prefix SHALL be account-OWNED: the account-switch wipe and in-place reset SHALL delete every `meta` key under it (per `neurons-cloud-sync`). Local garbage collection MAY delete only OUT-of-window `conf:`/`ovr:` keys; an in-window local delete is forbidden because the next pull would re-install it.

#### Scenario: Matcher admits exactly the intended keys

- **WHEN** `isSyncedRescueKey` is evaluated against `rescue:v1:plan`, an in-window `rescue:v1:conf:{planCreatedAt}:{qid}`, an out-of-window `rescue:v1:conf:{staleCreatedAt}:{qid}`, and an unrelated `rescue:v1:telemetry` key
- **THEN** the first two SHALL match and the last two SHALL NOT
- **AND** the metaAdapter snapshot and apply SHALL both use this same test, so no rescue key syncs in one direction only

#### Scenario: Reader tolerance in both directions across the 26→27 bump

- **GIVEN** a v26 client and a v27 client sharing one account
- **WHEN** the v26 client pulls a v27 bundle carrying rescue keys and later pushes its own bundle without them
- **THEN** the v26 client SHALL ignore the unrecognised keys without error
- **AND** the v27 client's locally-held rescue state SHALL survive applying the v26 bundle (absence is not deletion)

#### Scenario: Account switch wipes the rescue namespace

- **WHEN** the account-switch wipe (or in-place reset) runs on a device holding `rescue:v1:*` meta keys
- **THEN** every key under the `rescue:v1:` prefix SHALL be deleted, so the next account inherits no rescue plan, confidence, or override state

#### Scenario: Stale-run keys cannot resurrect through a stale bundle

- **GIVEN** a bundle in the cloud still carrying `conf:`/`ovr:` keys whose `planCreatedAt` has aged out of the run-sync window
- **WHEN** a device pulls that bundle
- **THEN** those keys SHALL be rejected by the membership test at apply time and SHALL NOT be re-installed locally

## MODIFIED Requirements

### Requirement: A single-subject rescue plan SHALL sync via R2 as a latest-action-wins LWW envelope, one-at-a-time account-wide, and lifecycle-managed

The app SHALL support a **single-subject rescue mode** ("考前救急") that targets exactly one `family` at a time. Entering rescue SHALL create a rescue plan `{ familyId, examDate, dailyMinutes, createdAt, lastStudiedAt, blitzDoneAt? }` persisted in the Dexie `meta` table under the single key `rescue:v1:plan` as a timestamped envelope `{ plan: RescuePlan | null, updatedAt }`, and the envelope SHALL sync cross-device via the R2 `neurons` bundle meta path (per the rescue key-family requirement). Every plan mutation — start, replace, study-touch (`lastStudiedAt`), blitz completion (`blitzDoneAt`), abandon, and auto-archive — SHALL rewrite the whole envelope with a fresh `updatedAt`. The cross-device merge SHALL be **envelope-level LWW on `updatedAt` (latest action wins)**, enforced by the registered backfill post-pass; timestamp ties SHALL be broken by a deterministic total order over the serialized envelope so the merge converges in any pull order. Abandon and auto-archive SHALL write an **explicit `plan: null`** envelope with a fresh `updatedAt` (LWW-null, no tombstone — mirroring the pin-queue `pinnedAt: null` dequeue discipline), so a clear propagates to every device and a cleared plan never resurrects from a stale bundle whose envelope is older.

At most one rescue plan SHALL be active **per account** (not per device): starting rescue for a second family while the synced envelope holds an active plan — regardless of which device created it — SHALL require an explicit confirm that replaces the active plan (the replacement envelope's fresh `updatedAt` wins everywhere). The plan SHALL be auto-archived on or after `examDate + 1 day`, and archiving SHALL revert any targeted-drill absorption (per `neurons-weakness-radar`) on every device once the null envelope is applied. The player SHALL be able to abandon an active plan at any time from any device. `blitzDoneAt` SHALL ride the envelope so the diagnostic blitz for one plan runs at most once **across all devices**; a device pulling a plan with `blitzDoneAt` set SHALL rebuild its queue deterministically from the synced `questionHistory` and confidence records instead of re-running the blitz. This requirement SHALL NOT bump the Dexie `.version()` chain (the plan rides the pre-existing `meta` store, non-indexed).

#### Scenario: Starting a plan syncs it to other devices

- **WHEN** the player starts a rescue for a family with an exam date and daily-minutes budget on device A
- **THEN** the envelope at `rescue:v1:plan` SHALL be written with the new plan and a fresh `updatedAt`
- **AND** after a sync cycle, device B SHALL render the same active plan (D-countdown, family, budget)

#### Scenario: One rescue plan at a time, account-wide

- **GIVEN** a rescue plan for family A is active in the synced envelope (created on device A)
- **WHEN** the player starts a rescue for family B on device B
- **THEN** the app SHALL require an explicit confirm before replacing A's plan with B's
- **AND** upon confirm, the replacement envelope SHALL win on all devices by its newer `updatedAt`

#### Scenario: Abandon propagates as an explicit null envelope

- **GIVEN** an active plan synced to devices A and B
- **WHEN** the player abandons the plan on device A
- **THEN** device A SHALL write `{ plan: null, updatedAt: now }` to `rescue:v1:plan`
- **AND** device B's next pull SHALL clear its active plan and revert the family's targeted-drill absorption
- **AND** a later pull of any stale bundle whose envelope is older SHALL NOT resurrect the plan

#### Scenario: Divergent offline starts converge to the latest action

- **GIVEN** device A starts a rescue for anatomy at t1 and device B starts a rescue for pharmacology at t2 > t1, both offline
- **WHEN** both devices subsequently sync, in either pull order
- **THEN** both devices SHALL converge on the t2 (pharmacology) plan

#### Scenario: Plan auto-archives after the exam and reverts absorption

- **GIVEN** an active rescue plan for which `examDate + 1 day` has been reached
- **WHEN** the app next evaluates the plan on any device
- **THEN** the plan SHALL be archived by writing the explicit-null envelope
- **AND** the family's targeted-drill absorption (per `neurons-weakness-radar`) SHALL revert on every device once the null envelope is applied

#### Scenario: A second device does not re-run the diagnostic blitz

- **GIVEN** a synced plan whose `blitzDoneAt` is set (the blitz ran on device A)
- **WHEN** the player opens the rescue mode on device B
- **THEN** device B SHALL NOT run a full diagnostic blitz
- **AND** it SHALL rebuild the day's queue deterministically from the synced `questionHistory` and confidence records

### Requirement: Confidence SHALL be captured pre-reveal via a two-button submit and weight high-confidence-wrong

Inside a rescue session, submitting an answer SHALL be a **two-button, pre-reveal** action: after selecting an option, the player taps either "確定・有把握" or "確定・猜的" to submit, so the confidence tap IS the submit (no extra click) and is recorded **before** correctness is revealed. `Confidence(q)` SHALL be the sole home of the high-confidence-wrong multiplier: high-confidence-wrong SHALL be weighted ×1.5 (hypercorrection), low-confidence-correct ×1.1, otherwise ×1.0.

Confidence records SHALL persist as **run-scoped synced meta keys** `rescue:v1:conf:{planCreatedAt}:{questionId}` with value `{ signal: 'sure' | 'guess', at }` riding the R2 meta path (per the rescue key-family requirement), so a tap made on one device weights the queue on every device. The per-key merge SHALL be **LWW on `at`** (the latest pre-reveal tap wins — a re-answered question's newer tap overwrites the older signal), enforced by the registered backfill post-pass. Run identity SHALL be the active plan's `createdAt`: starting or replacing a plan re-scopes all reads to the new `{planCreatedAt}` prefix with **no delete writes** — records of a previous run are ignored by readers and age out of the run-sync window. Existing `easyMarked`/`guessedMarked` flags MAY serve only as a cold-start prior. Post-reveal confidence collection SHALL NOT be used.

#### Scenario: Two-button submit records confidence before the answer is revealed

- **WHEN** the player selects an option in a rescue session and taps "確定・有把握"
- **THEN** the answer SHALL submit and the high-confidence signal SHALL be recorded before correctness is shown

#### Scenario: High-confidence-wrong gets the hypercorrection weight

- **GIVEN** a question the player submitted as "有把握" but answered wrong
- **WHEN** it is scored for the next queue
- **THEN** its `Confidence(q)` multiplier SHALL be ×1.5 and it SHALL additionally be scheduled for extra review

#### Scenario: Confidence taps propagate cross-device

- **GIVEN** an active synced plan and a question tapped "確定・有把握" (and answered wrong) on device A
- **WHEN** device B pulls and rebuilds its rescue queue for the same run
- **THEN** device B's priority computation SHALL see the same high-confidence signal and apply the ×1.5 weight

#### Scenario: A re-tap wins by recency on merge

- **GIVEN** the same question carries `{signal:'sure', at:t1}` on device A and `{signal:'guess', at:t2 > t1}` on device B
- **WHEN** the two devices sync in either order
- **THEN** both SHALL converge on the t2 record ('guess')

#### Scenario: Starting a new run re-scopes confidence without deletes

- **GIVEN** confidence keys recorded under a plan with `createdAt = t1`
- **WHEN** the player replaces the plan (new `createdAt = t2`)
- **THEN** readers SHALL consult only `rescue:v1:conf:{t2}:` keys
- **AND** the t1 keys SHALL NOT be deleted; they are simply excluded from reads and age out of the run-sync window

### Requirement: Stop-loss SHALL switch intervention, and player override SHALL sync run-scoped via R2

When a concept reaches `attemptsToday >= 6` with `recentAccuracy < 0.40`, the rescue engine SHALL switch intervention by yield: a **high-frequency** stuck concept SHALL inject a concept-scoped re-read card — resolved from that concept's `CramPushItem` kernel content via its `sourceQuestionIds`, falling back to the subject-level `buildSpeedReviewCards` kernel (explicitly labeled a fallback) when no concept-level card exists — for a forced ~30-second re-read then re-test after ~60–90 minutes (retrieval practice is ineffective on never-encoded material); a **low-frequency** stuck concept SHALL be demoted (priority ×0.15).

A player override ("我就是要繼續練這塊") SHALL be recorded as a **run-scoped synced meta key** `rescue:v1:ovr:{planCreatedAt}:{conceptId}` with value `{ setAt, attemptsAtOverride }` riding the R2 meta path (per the rescue key-family requirement), merged per-key **LWW on `setAt`**, so an override granted on one device suppresses the same stop-loss on every device within the run. Override expiry (24 hours OR 6 more attempts) SHALL be **derived at read time** on every device (never persisted as a delete), so an expired record re-installed by a pull is inert; the attempts-based rule evaluates against the reading device's local attempt count (a device-relative baseline), with the 24-hour rule as the cross-device upper bound. The override SHALL NOT write `questionFlags.pinnedAt` or any daily-expedition state — rescue override keys are read ONLY inside the rescue scene, preserving the original no-leak guarantee. The override SHALL show its visible cost ("置頂會擠掉約 N 分鐘的高頻目標"), SHALL be served from a separate "加練" quota that does not displace the core queue, and SHALL NOT count toward any algorithm-success telemetry metric.

#### Scenario: High-frequency stuck concept switches to re-read then re-test

- **GIVEN** a high-frequency concept with ≥6 attempts today and recent accuracy <0.40
- **WHEN** stop-loss triggers
- **THEN** the engine SHALL inject its speed-review kernel card for a forced re-read and schedule a re-test after ~60–90 minutes, rather than continuing to drill it

#### Scenario: Override syncs without leaking into daily expedition

- **WHEN** the player overrides stop-loss on a concept on device A
- **THEN** a `rescue:v1:ovr:{planCreatedAt}:{conceptId}` key SHALL be written with a fresh `setAt`
- **AND** no `questionFlags.pinnedAt` or daily-expedition state SHALL be written, so daily expedition ordering on every device is unaffected
- **AND** after a sync cycle, device B's rescue scene SHALL honor the same stop-loss release within the run

#### Scenario: Override is bounded and quota-isolated

- **WHEN** an override is active
- **THEN** it SHALL auto-re-evaluate after 24 hours or 6 more attempts (attempts counted on the evaluating device; 24 hours bounds the cross-device case)
- **AND** its questions SHALL come from a separate 加練 quota that does not displace core-quota high-yield questions

#### Scenario: An expired override re-installed by a pull stays inert

- **GIVEN** an override record older than 24 hours that a device has locally cleaned up
- **WHEN** a pull re-installs the record from a peer's bundle
- **THEN** read-time expiry evaluation SHALL treat it as expired and stop-loss SHALL NOT be suppressed by it

### Requirement: Rescue SHALL reuse the existing answering path and preserve source attribution

Rescue sessions SHALL answer through the existing `QuizModal` / `recordQuestionResult` path (the two-button submit is a rescue-only submit affordance, not a new scoring path), so every answer records to `questionHistory` and SRS exactly as any other quiz answer. Rescue answers SHALL update `questionHistory` and SRS only; they SHALL NOT trigger the daily-prescription or cram-rescue economy (`recordCramRescueAnswer` / `creditCramRescue`), so no prescription meta is written by rescue answering — the only rescue-owned synced surface is the `rescue:v1:` key family (per the rescue key-family requirement), and rescue telemetry remains device-local. Each question card SHALL continue to display the 陽明國考考古題小組 attribution and source URL inline.

#### Scenario: Rescue answers flow through the normal recording path

- **WHEN** the player answers a question in a rescue session
- **THEN** the answer SHALL record to `questionHistory` and update SRS exactly as any other quiz answer

#### Scenario: Attribution remains on every rescue question card

- **WHEN** a question is shown in a rescue session
- **THEN** its card SHALL display the 陽明國考考古題小組 attribution and source URL inline
