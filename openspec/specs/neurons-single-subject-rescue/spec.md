# neurons-single-subject-rescue

## Purpose

Defines the neurons-tw single-subject last-minute rescue mode (考前救急): lock exactly one family + an exam date + a daily-minutes budget, and each day build a highest-ROI question queue that drills with pre-reveal confidence capture. The rescue **plan, pre-reveal confidence, and stop-loss overrides sync cross-device** via the existing R2 `neurons` bundle meta path (a windowed `rescue:v1:` key family riding the pre-existing Dexie `meta` store — **no Dexie `.version()` bump**, R2 `SCHEMA_VERSION` 26→27 with reader tolerance); only telemetry stays device-local. Rescue answers still flow through the normal `recordQuestionResult` + SRS path so `questionHistory` syncs as usual, and they never write daily-prescription or cram meta. Covers the rescue lifecycle (one-at-a-time account-wide, auto-archive at `examDate + 1 day`, abandon via explicit-null envelope), the D-scaled diagnostic blitz (once per plan across devices), the `priority = Yield × Movability × Confidence × typeCoefficient ÷ EstTime` selection algorithm (with triage-drop + stop-loss intervention), pre-reveal two-button confidence, backward-planning window-compressed daily scheduling, RescueScore + a qualitative return estimate, an exam-morning quick-scan preset, and thin device-local telemetry. The `neurons-homepage` header entry + card 變身 and the `neurons-weakness-radar` targeted-drill absorption are specified in those capabilities.

## Requirements

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

### Requirement: Rescue SHALL open with a D-scaled diagnostic blitz that captures pre-reveal confidence

Entering a rescue plan SHALL run a **diagnostic blitz**: a frequency-weighted sampling of the family's concepts, prioritising concepts with no or stale history. The number of blitz questions SHALL scale with remaining days D: approximately 25 for D≥3, 15 for D=2, and 10 for D=1 (families with thick answer history MAY shrink further). For families with little history the blitz result SHALL be treated as a **startup weighting**, not a high-precision diagnosis. The blitz SHALL use the rescue answering flow (pre-reveal confidence submit, per the confidence requirement) and SHALL produce a concept red/yellow/grey 戰情圖 where red = high-frequency-weak plus high-confidence-wrong.

#### Scenario: Blitz size scales with remaining days

- **WHEN** the player enters rescue with D=1
- **THEN** the diagnostic blitz SHALL present approximately 10 questions (fewer if the family has thick history)
- **AND** when D≥3 it SHALL present approximately 25

#### Scenario: Blitz produces a 戰情圖 and treats sparse data as startup weighting

- **WHEN** the diagnostic blitz completes for a cold-start family
- **THEN** it SHALL render a concept red/yellow/grey map
- **AND** blitz-derived mastery for sparsely-answered concepts SHALL be used as a startup weight, not as a high-precision signal that dominates ordering

### Requirement: Rescue question selection SHALL rank by a marginal-score ROI priority with triage

The rescue queue builder SHALL rank candidate questions of the target family by `priority(q) = Yield(q) × Movability(q) × Confidence(q) × typeCoefficient(q) ÷ EstTime(q)`. `Yield(q)` SHALL derive from the cram high-frequency tier (`CramPushItem.tier`), falling back to the corpus's cross-year appearance-frequency percentile for concepts not covered by a push item (NOT a flat low-frequency default). The freeform `CramPushItem.tier` string SHALL map ordinally to Yield bands — `常青必掃` → high, `穩定考點` → mid, `經典但降溫` → low; any other/unmapped tier string and concepts with no push item SHALL be banded by corpus cross-year appearance-frequency percentile (top tercile → high, middle → mid, bottom → low). The `high-frequency` term used by stop-loss and the `mid-frequency` threshold used by triage SHALL refer to these bands. The builder SHALL **triage-drop** questions where `Movability(q) == 0` (already-mastered) or where `Movability(q) <= 0.05 AND Yield(q) < mid-frequency` (unrecoverable low-yield). The exact weights SHALL be implementation-defined and dogfood-tunable; the spec fixes the ordering property: a higher-frequency, more-movable, higher-confidence-risk question SHALL rank above a lower one at equal time cost.

#### Scenario: A high-yield movable question outranks a mastered one

- **GIVEN** question X is high-frequency and currently wrong-but-learnable, and question Y is already mastered
- **WHEN** the rescue queue is built
- **THEN** X SHALL rank above Y
- **AND** Y SHALL be triage-dropped (not shown) because its Movability is 0

#### Scenario: Unrecoverable low-yield questions are dropped

- **GIVEN** a low-frequency concept the player has failed repeatedly with near-zero recent accuracy
- **WHEN** the rescue queue is built
- **THEN** its questions SHALL be triage-dropped rather than consuming rescue time

#### Scenario: Yield falls back to corpus frequency, not a flat default

- **GIVEN** a concept not covered by any `CramPushItem`
- **WHEN** Yield is computed
- **THEN** it SHALL use the corpus cross-year appearance-frequency percentile, NOT a flat low-frequency constant

### Requirement: Movability SHALL be banded to cover unanswered, mastered, and unrecoverable questions

`Movability(q)` SHALL assign every candidate question exactly one of the five bands below, and SHALL NOT include the confidence multiplier (which lives solely in `Confidence(q)`; a high-confidence-wrong question is a **Wrong, un-corrected, learnable** question that additionally receives the `Confidence(q)` ×1.5 weight — it is not a separate Movability band):
- **Unanswered** questions SHALL derive a prior from concept mastery (weak concept → high movability ~0.8–1.0; strong concept → low ~0.2).
- **Wrong, un-corrected, learnable** → high (~1.0).
- **Answered-correct-but-unsure / only-correct-once** → mid (~0.5).
- **Unrecoverable** (history wrong ≥3 AND recent accuracy 0 AND already stop-lossed once, by behavior only — NOT by any question-type flag) → low (~0.2), and ~0.05 if also low-frequency.
- **Already-mastered** (recent consecutive-correct ≥2, OR SRS `interval >= 7` days and not due — NOT reliant on an opt-in flag) → **exactly 0**, so the `Movability == 0` triage rule drops it (already-mastered is the canonical Movability-zero case).

#### Scenario: Unanswered question inherits a concept-mastery prior

- **WHEN** an unanswered question in a weak concept is scored
- **THEN** its Movability SHALL be a high prior (~0.8–1.0), and an unanswered question in a strong concept SHALL be low (~0.2)

#### Scenario: Mastered questions are recognised without an opt-in flag

- **GIVEN** a question the player has answered correctly ≥2 times recently or whose SRS interval is ≥7 days and not due
- **WHEN** Movability is computed
- **THEN** it SHALL band as already-mastered (~0.0–0.1) even if the player never tapped "太簡單"

#### Scenario: Unrecoverable band uses behavior only, never a question-type flag

- **WHEN** the unrecoverable (drop-eligible) band is evaluated
- **THEN** it SHALL be determined by answer history and stop-loss state only, and SHALL NOT require a factual/reasoning question-type flag

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

### Requirement: Rescue SHALL schedule backward from the exam date with window-compressed spacing

The rescue queue SHALL be re-planned backward from `examDate` and re-ordered on each session. Remaining days D SHALL be the calendar-day difference `examDate − today` (**D=0 = the exam day itself; D=1 = the day before the exam**). Each day's queue SHALL mix approximately 20% prior-day wrong-question recovery, 65% high-priority new targets (blocked until in-block accuracy ≥0.75, then interleaved), and 15% closing mixed-check. Spacing SHALL be compressed into the remaining window (D≥4: next-day/+2-day; D=2–3: same-evening + next-morning; D=1: +60–90 min + same night, with the exam-eve consolidation-only block on the **D=1 night**). On the **D=0 exam morning** of an active plan, only a quick-scan SHALL run — no full re-diagnosis unless the player manually resets. The plan SHALL auto-archive at `examDate + 1 day`.

#### Scenario: Daily queue mixes recovery, new targets, and mixed-check

- **WHEN** a day's rescue queue is built
- **THEN** it SHALL include prior-day wrong-question recovery, high-priority new targets (blocked-to-interleaved at ≥0.75 in-block accuracy), and a closing mixed-check

#### Scenario: Exam-eve is consolidation-only

- **GIVEN** D=1 (the night before the exam)
- **WHEN** the final block is built
- **THEN** it SHALL be consolidation only and SHALL NOT introduce brand-new difficult concepts

#### Scenario: D=1 blitz and exam-morning quick-scan do not double-run

- **GIVEN** a plan first entered at D=1 already ran its 10-question blitz
- **WHEN** the player opens the app on the exam morning
- **THEN** it SHALL run only the quick-scan preset, not a second full diagnostic, unless the player manually resets

### Requirement: Rescue SHALL surface a RescueScore and a qualitative return estimate, not a fabricated point gain

The rescue view SHALL show a **RescueScore (0–100)** derived at runtime from a recency-decayed mastery over the family's `questionHistory` (`lastResult × lastAnsweredAt` exponential decay), weighted by concept Yield — NOT from the backward-looking `familyMastery` ratio. The expected return of continued study SHALL be shown as a **qualitative three-tier label (夯 / 普通 / 低迷)** and SHALL NOT display a fabricated precise "預估追回 X 分" number.

#### Scenario: RescueScore is derived from recency-decayed history, not familyMastery

- **WHEN** RescueScore is computed
- **THEN** it SHALL use a recency-decayed pass over `questionHistory` weighted by concept Yield
- **AND** it SHALL NOT read `familyMastery` as its source

#### Scenario: Return is qualitative, never a fake point figure

- **WHEN** the expected return of 30 more minutes is shown
- **THEN** it SHALL render as a qualitative tier (夯 / 普通 / 低迷) and SHALL NOT show a precise predicted point gain

### Requirement: An exam-morning quick-scan preset SHALL exist as the final delivery layer

The rescue mode SHALL provide an exam-morning quick-scan preset that filters to prior-day-corrected high-confidence-wrong questions plus high-frequency kernel cards, sized for ~15 minutes, reusing the existing speed-review and quiz delivery (no new answering path).

#### Scenario: Quick-scan filters to the highest-leverage residue

- **WHEN** the player opens the exam-morning quick-scan
- **THEN** it SHALL present only prior-day-corrected high-confidence-wrong questions plus high-frequency kernel cards, sized for ~15 minutes

### Requirement: The type-coefficient extrapolation seam SHALL exist and return 1.0 in this release

The priority formula SHALL call a `typeCoefficient(q)` function that returns `1.0` for all questions in this release (the factual/reasoning real value is deferred). A unit test SHALL assert that `typeCoefficient` is invoked within the priority computation, so the seam cannot be silently removed as dead code. No naming or UI SHALL imply that question-type intelligence already exists.

#### Scenario: Seam is present, returns 1.0, and is contract-tested

- **WHEN** the priority of any question is computed in this release
- **THEN** `typeCoefficient(q)` SHALL be called and SHALL return 1.0
- **AND** a unit test SHALL assert the call occurs inside the priority computation

### Requirement: Rescue SHALL record thin device-local telemetry for dogfood calibration

The rescue mode SHALL append device-local, flat, append-only JSON telemetry with a one-click export, and SHALL NOT build any in-app chart or dashboard. The minimum event set SHALL include: `diagnostic-answered`, `confidence-tap` (pre-reveal), `priority-selected`, `stop-loss-demoted`, `manual-override`, and `quick-scan-opened|completed`; it SHALL also record each band's next-day accuracy change and per-question answer seconds. Manual-override outcomes SHALL NOT count toward any algorithm-success metric.

#### Scenario: Telemetry is flat local JSON with export, no dashboard

- **WHEN** rescue events occur
- **THEN** they SHALL append to a device-local flat JSON log exportable in one click
- **AND** no in-app visualization/dashboard SHALL be built for it

### Requirement: Rescue session delivery SHALL block-and-interleave with immediate feedback

Within a rescue session, questions SHALL be delivered in blocks of ~8 with at most 3 questions of the same concept per block (adjacent concepts interleaved to train discrimination). Each answer SHALL receive immediate per-option feedback, and a high-confidence-wrong question SHALL be additionally re-scheduled for extra review.

#### Scenario: Block delivery caps same-concept and interleaves

- **WHEN** a rescue block is delivered
- **THEN** it SHALL contain ~8 questions with at most 3 of the same concept
- **AND** adjacent concepts SHALL be interleaved rather than fully blocked

#### Scenario: High-confidence-wrong is re-scheduled after immediate feedback

- **GIVEN** a question submitted as "有把握" but answered wrong
- **WHEN** its answer is recorded
- **THEN** the player SHALL receive immediate per-option feedback
- **AND** the question SHALL be re-scheduled for extra review

### Requirement: Rescue SHALL reuse the existing answering path and preserve source attribution

Rescue sessions SHALL answer through the existing `QuizModal` / `recordQuestionResult` path (the two-button submit is a rescue-only submit affordance, not a new scoring path), so every answer records to `questionHistory` and SRS exactly as any other quiz answer. Rescue answers SHALL update `questionHistory` and SRS only; they SHALL NOT trigger the daily-prescription or cram-rescue economy (`recordCramRescueAnswer` / `creditCramRescue`), so no prescription meta is written by rescue answering — the only rescue-owned synced surface is the `rescue:v1:` key family (per the rescue key-family requirement), and rescue telemetry remains device-local. Each question card SHALL continue to display the 陽明國考考古題小組 attribution and source URL inline.

#### Scenario: Rescue answers flow through the normal recording path

- **WHEN** the player answers a question in a rescue session
- **THEN** the answer SHALL record to `questionHistory` and update SRS exactly as any other quiz answer

#### Scenario: Attribution remains on every rescue question card

- **WHEN** a question is shown in a rescue session
- **THEN** its card SHALL display the 陽明國考考古題小組 attribution and source URL inline
