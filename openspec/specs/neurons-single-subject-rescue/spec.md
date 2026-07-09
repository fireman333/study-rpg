# neurons-single-subject-rescue

## Purpose

Defines the neurons-tw single-subject last-minute rescue mode (考前救急): lock exactly one family + an exam date + a daily-minutes budget, and each day build a highest-ROI question queue that drills with pre-reveal confidence capture. The rescue **plan, pre-reveal confidence, and stop-loss overrides sync cross-device** via the existing R2 `neurons` bundle meta path (a windowed `rescue:v1:` key family riding the pre-existing Dexie `meta` store — **no Dexie `.version()` bump**, R2 `SCHEMA_VERSION` 26→27 with reader tolerance); only telemetry stays device-local. Rescue answers still flow through the normal `recordQuestionResult` + SRS path so `questionHistory` syncs as usual, and they never write daily-prescription or cram meta. Covers the rescue lifecycle (one-at-a-time account-wide, auto-archive at `examDate + 1 day`, abandon via explicit-null envelope), the D-scaled diagnostic blitz (once per plan across devices), the `priority = Yield × Movability × Confidence × typeCoefficient ÷ EstTime` selection algorithm (with triage-drop + stop-loss intervention), pre-reveal two-button confidence, backward-planning window-compressed daily scheduling, RescueScore + a qualitative return estimate, an exam-morning quick-scan preset, and thin device-local telemetry. The `neurons-homepage` header entry + card 變身 and the `neurons-weakness-radar` targeted-drill absorption are specified in those capabilities.
## Requirements
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

