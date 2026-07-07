## RENAMED Requirements

- FROM: `### Requirement: Prescription state SHALL persist in local-only meta keys with no schema or sync change`
- TO: `### Requirement: Prescription daily state SHALL persist in meta keys and sync cross-device as a date-windowed daily-quest table`

## ADDED Requirements

### Requirement: 今日處方 SHALL extend into a four-tier same-day ladder with derived tiers and a claim-floor monotonic display

The 今日處方箋 SHALL extend into a **four-tier same-day ladder** (all targets and energy amounts dogfood-tunable):

- **T1 基礎處方** — the existing two lines (訂正 N + 開發新連結 M), mechanically UNCHANGED: `prescription:v1:completed:{date}` keeps driving NG-0717 maturation, lineage imprints, and the completion celebration. T1 SHALL remain the ONLY tier whose copy calls anything 「完成」.
- **T2 追加固化** — approximately 3 further corrections beyond T1's target, drawn from the SAME frozen `wrongEligibleQuestionIds` snapshot's overflow; when the overflow is exhausted the plan-frozen fallback chain applies (breadth pool, then cram practice at a doubled target counted via the `cramRescue:{date}:{qid}` keys).
- **T3 形成連結** — at least 1 synapse formed or strengthened today (per the form-synapse objective requirement); reaching it MAY additionally render an **ephemeral glow** (UI-only, never persisted).
- **T4 深度出征 (stretch)** — cumulative corrections today reaching approximately 12 (the same unit stream T1+T2 count) AND at least 2 synapses today; reaching it MAY render an optional **cosmetic pulse** that SHALL carry NO exclusive power, stat, or gameplay advantage.

The day's tier objectives SHALL be **frozen into the plan at generation time** as tier-spec fields (`t2Kind` / `t2Extra` / `t3Kind` / `t3Target` / `t4Kind` / `t4Target`) and SHALL NOT change for the rest of the day. Objectives SHALL auto-shrink at generation via the frozen fallback chain so that a plan can NEVER freeze an unachievable tier (no「今天不可能達成」dead state).

The current tier SHALL be **derived** (`derivedTier`), a pure function of the (winner) plan's frozen tier spec and the UNION'd progress keys — NEVER stored as a mutable tier field and requiring NO new merge type. The DISPLAYED tier SHALL be `displayTier = max(derivedTier, highestClaimedTier)`, where `highestClaimedTier` derives from the write-once claim markers (`reward:{date}`, `tierClaim:{date}:{2|3|4}`), so the displayed tier is **same-day monotonic**: it SHALL NEVER downgrade within a day, including after a divergent plan loses the cross-device earliest-wins merge.

Tiers SHALL NOT accumulate across days in any form: NO tier streak, NO weekly/rolling tier statistics, NO tier collection, NO leaderboard axis, and NO DMN draw axis. Tier state resets with the new day's plan.

The tier UI SHALL use **progressive disclosure**: the T2–T4 ladder SHALL NOT exist in the UI (no rows, no locked placeholders, no teaser) until T1 is complete — mirroring the 考前救援 visibility gate. Un-reached tiers SHALL use invite tone only; the copy-guard test's banned tokens SHALL extend to cover 未達成 and 落後 (alongside the already-banned 還差 / 連續 etc.), and every static tier-panel copy constant SHALL join the guarded literal list.

#### Scenario: Tier derives from frozen spec + progress and the display never downgrades

- **WHEN** a device's `derivedTier` computes to 3 and its claim markers include `tierClaim:{date}:3`, and a later cross-device plan merge makes `derivedTier` recompute to 2
- **THEN** `displayTier` SHALL remain 3 (claim-floor: `max(derivedTier, highestClaimedTier)`), and no tier the player has seen reached SHALL be shown as lost that day

#### Scenario: T2–T4 do not exist in the UI before T1 completes

- **WHEN** today's two prescription lines are not both complete
- **THEN** the card SHALL render NO tier ladder, NO locked tier placeholder, and NO tier teaser — exactly the pre-change card

#### Scenario: Objectives auto-shrink so no impossible tier is frozen

- **WHEN** the plan is generated and the wrong-snapshot overflow beyond T1's target has fewer questions than T2's default target
- **THEN** the frozen tier spec SHALL fall back along the frozen chain (breadth pool, then cram practice at a doubled target) or shrink the target to what is achievable, and the frozen spec SHALL NOT change for the rest of the day

#### Scenario: Tiers do not accumulate across days

- **WHEN** the player reaches T4 today and opens the app tomorrow
- **THEN** the new day SHALL start at no tier with a fresh frozen tier spec, and NO cross-day tier streak, weekly tally, collection entry, leaderboard axis, or DMN draw SHALL exist anywhere

#### Scenario: Copy guard fails on deficit tier copy

- **WHEN** a static tier-panel copy constant is authored containing a banned token (e.g. 未達成, 落後, 還差, 連續)
- **THEN** the automated copy-guard test SHALL fail

#### Scenario: T1 semantics are unchanged

- **WHEN** the player completes the two lines (T1)
- **THEN** `prescription:v1:completed:{date}` SHALL be written exactly as before, NG-0717 maturation and the lineage imprint SHALL advance exactly as before, and the completion celebration SHALL play per the celebration-once rule

### Requirement: The tier ladder SHALL count a form-synapse objective via write-once wire keys from the expedition co-repair path

The T3/T4 form-synapse objective SHALL be counted by a listener on the existing connectome events `connectome.synapseFormed` and `connectome.synapseStrengthened` that records a **write-once** meta key `prescription:v1:wire:{date}:{pairKey}` (truthy, never deleted). Today's synapse count SHALL be the number of distinct `wire:{date}:*` keys for today — the write-once key gives per-pair-per-day dedup for free (the same pair forming then strengthening, or strengthening twice, counts once per day). The wire keys SHALL sync cross-device as write-once UNION within the daily date window, so a synapse formed on one device counts on all devices.

NO new synapse emitter SHALL be introduced: the counted events originate ONLY from the existing wrong-pool expedition settlement path (`creditConnectomeFromExpedition`), which already sits behind the effective-completion gate and the daily pair cap. As an anti-farm guard, tier-countable synapse credit SHALL require a **pre-existing-wrong basis**: a synapse event SHALL count toward T3/T4 only when the underlying settlement's counted repairs include questions that were already wrong BEFORE today's plan was generated (e.g. intersecting the plan's frozen `wrongEligibleQuestionIds` snapshot), so deliberately answering fresh questions wrong today and immediately repairing them SHALL NOT mint tier-countable synapse credit.

#### Scenario: A formed synapse counts once toward today's objective

- **WHEN** `connectome.synapseFormed` fires for pair `藥理學↔生理學` during a qualifying expedition settlement
- **THEN** `prescription:v1:wire:{today}:{pairKey}` SHALL be written once and today's synapse count SHALL include that pair

#### Scenario: The same pair does not double-count in a day

- **WHEN** the same pair strengthens again later the same day (a second `connectome.synapseStrengthened` for the same `pairKey`)
- **THEN** the existing wire key SHALL be left as-is and today's synapse count SHALL NOT increment again

#### Scenario: Wire keys union across devices

- **WHEN** device A records `wire:{today}:{pairA}` and device B records `wire:{today}:{pairB}`, and both sync
- **THEN** both devices SHALL count 2 synapses today (write-once UNION), enough to satisfy T4's ≥2-synapse condition on either device

#### Scenario: Deliberately failing fresh questions today mints no tier credit

- **WHEN** a player answers questions wrong for the first time today and immediately repairs them in an expedition whose counted repairs include NO pre-today wrong questions
- **THEN** any synapse event from that settlement SHALL NOT count toward the T3/T4 objectives

## MODIFIED Requirements

### Requirement: System SHALL generate a daily two-line prescription capped at 12 questions

The system SHALL generate, once per local-TZ day (keyed by `todayISO()`), a "今日處方箋" consisting of exactly **two lines** — 訂正錯題 (correct-errors) and 開發盲區 (explore-blind-spots) — whose combined question target SHALL NEVER exceed 12. The plan SHALL be generated on first access of the day and then **frozen** (subsequent reads the same day SHALL return the identical plan). The 訂正錯題 target N SHALL scale to the current **repair-pool** size, where the repair pool is `( questions with lastResult === 'wrong'  ∪  questions flagged 🤔 guessedMarked )  −  questions flagged ✨ easyMarked`, computed within the effective year scope (see the year-filter requirement; the scoped repair pool falls back to all years only when it is empty). N scaling: pool 0 → N = 0 (line auto-satisfied); 1–3 → N = pool size; 4–20 → N = 4; 21–80 → N = 5; > 80 → N = 6. When the player's recent-20-answer accuracy is < 50% the N cap SHALL be lowered to 3; when 50–65% the N cap SHALL be lowered to 4 (this reduction SHALL NEVER be surfaced with any accuracy-attribution or deficit copy). The 開發盲區 target M SHALL be set so total ≤ 12: N = 0 → M = 10; N = 1–4 → M = 8; N = 5 → M = 7; N = 6 → M = 6.

On top of the two lines, plan generation SHALL freeze the day's **tier spec** for the optional T2–T4 ladder (per the tier-ladder requirement) as plan fields `t2Kind` / `t2Extra` / `t3Kind` / `t3Target` / `t4Kind` / `t4Target`, computed once from the same frozen snapshots with auto-shrink and the frozen fallback chain (T2: wrong-snapshot overflow → breadth pool → cram practice at a doubled target), so the frozen spec can never demand the impossible. The plan SHALL be **per-(account, date)**: when devices generate divergent plans for the same date offline, the account SHALL converge on the **earliest-created** plan (the earliest-createdAt-wins merge defined in the daily-state sync requirement); the frozen tier spec rides the plan and converges with it.

#### Scenario: Plan is generated once per day and frozen
- **WHEN** the player opens the homepage the first time on a given local-TZ day
- **THEN** a prescription plan for `todayISO()` SHALL be generated and persisted under `prescription:v1:plan:{date}`
- **AND** every subsequent read that same day SHALL return the identical frozen plan (targets and eligible question ids unchanged)

#### Scenario: Repair-pool includes guessed-correct and excludes too-easy
- **WHEN** the plan is generated and a question is `lastResult === 'correct'` but flagged 🤔 guessedMarked
- **THEN** that question SHALL be part of the repair pool that N scales to (a guessed-correct answer is a repairable connection)
- **AND** a question flagged ✨ easyMarked SHALL be excluded from the repair pool even if its `lastResult === 'wrong'`

#### Scenario: Wrong-line target scales to repair-pool size
- **WHEN** the plan is generated and the repair pool has 30 questions
- **THEN** the 訂正錯題 target N SHALL be 5
- **AND** the 開發盲區 target M SHALL be 7 (total = 12)

#### Scenario: Empty repair-pool auto-satisfies the wrong line
- **WHEN** the plan is generated and the repair pool is empty
- **THEN** N SHALL be 0, the 訂正錯題 line SHALL render as already-complete (「今日無待修補連結」), and M SHALL be 10

#### Scenario: Low recent accuracy lowers the wrong-line target without deficit copy
- **WHEN** the plan is generated, the repair pool has 50 questions, and the player's recent-20-answer accuracy is 42%
- **THEN** N SHALL be capped at 3 (not 5)
- **AND** no copy SHALL attribute the smaller target to the player's accuracy dropping

#### Scenario: Tier spec is frozen at generation and rides the plan
- **WHEN** the plan is generated
- **THEN** the tier-spec fields (`t2Kind` / `t2Extra` / `t3Kind` / `t3Target` / `t4Kind` / `t4Target`) SHALL be frozen into the plan and SHALL NOT change for the rest of that day
- **AND** when the account converges on a different (earlier-created) plan, the winner plan's tier spec SHALL govern derivation from then on (the claim-floor keeps the displayed tier monotonic)

### Requirement: Prescription daily state SHALL persist in meta keys and sync cross-device as a date-windowed daily-quest table

All prescription state SHALL live in the existing `meta` key-value table under the `prescription:v1:` namespace, keyed by `todayISO()`. The daily-quest state SHALL sync cross-device through the existing meta sync path as a **date-windowed table**, with per-family merge semantics and NO new merge machinery beyond ONE registered backfill post-pass:

| Key family | Sync | Merge |
|---|---|---|
| `plan:{date}` | SYNC, window today ±1 local day | **earliest-createdAt-wins MIN-LWW** on `(createdAt, seed)` — min `createdAt`, tie-broken by min `seed` — enforced by a registered backfill post-pass (`backfill/prescription-plan.ts`, run on pull completion); a malformed incoming plan SHALL keep the local plan |
| `wrong:{date}:{qid}` / `breadth:{date}:{qid}` | SYNC, window today ±1 local day | write-once presence → first-write-wins = UNION |
| `cramRescue:{date}:{qid}` | SYNC, window today ±1 local day | write-once presence → UNION |
| `wire:{date}:{pairKey}` | SYNC, window today ±1 local day | write-once presence → UNION |
| `tierClaim:{date}:{2\|3\|4}` | SYNC, window today ±1 local day | write-once `{claimedAt, energy, familyId}` → first-write-wins UNION (the earliest claim wins; applying an incoming claim SHALL NOT re-grant energy) |
| `completed:{date}` / `reward:{date}` | SYNC, **all dates** | write-once presence → UNION (full history: `completedDayCount` and NG-0717 maturation derive from every completed day) |
| `ng0717:imprint:<subjectId>:<date>` | SYNC (unchanged) | write-once presence → UNION per the imprint-keepsake requirement |
| `lightsOut:{date}` / `localSeed` | **LOCAL-ONLY** | never enter the bundle (deletable / device-ritual keys violate the write-once contract) |

The synced-membership test for these dynamic keys SHALL be a **prescription sub-key matcher** exported from the prescription service as a single source (mirroring `IMPRINT_PREFIX`) and consumed by `isSyncedMetaKey`, so the key mint and the sync filter can never drift; the metaAdapter snapshot and apply SHALL use the SAME test. The date window (today ±1 local day) bounds bundle growth and tolerates midnight/timezone skew; a key outside its family's window simply does not enter (nor is accepted from) the snapshot, and because first-write-wins never deletes local keys absent from an incoming bundle, out-of-window local keys are untouched.

This SHALL be a single **additive** R2 bundle `SCHEMA_VERSION` bump **25 → 26** with reader tolerance in both directions (an older client silently drops the prescription keys it does not recognise; a newer client reading an older bundle preserves its local keys). There SHALL be NO Dexie `.version()` bump (the keys already live in `meta`), NO Worker change, and NO new TableAdapter — the ONLY new merge machinery is the plan MIN-LWW post-pass registered in the pull-completion backfill orchestrator.

The plan key SHALL remain frozen after first generation on a device; cross-device divergence resolves via the earliest-createdAt merge above (MIN over the `(createdAt, seed)` pair is a semilattice, so convergence is pull-order-independent). Progress keys UNION'd from a losing device's plan SHALL remain counted (forgiving pre-convergence crediting — accepted by design; the tier claim-floor absorbs any derived-tier drop). Per-question progress keys and per-day completion keys SHALL be write-once (set to a truthy value, never deleted), keeping merges safe and the derived `completedDayCount` monotonic. No spendable or bidirectional counter SHALL be added (tier energy rides the existing MAX-merge `maze:<familyId>:earned` counter via write-once claims — avoiding monotonic-MAX resurrection). The plan SHALL snapshot `wrongEligibleQuestionIds`, `breadthEligibleQuestionIds`, and the effective **`yearScope`** (the resolved exam-year set, or `null` when all years) at generation time. A plan missing `yearScope` or the tier-spec fields (generated before this change) SHALL be treated tolerantly — `yearScope` as `null` (all years), tier spec as absent (tier panel hidden that day) — reader tolerance, no migration.

#### Scenario: Daily-quest keys sync within their date window
- **WHEN** device A writes `prescription:v1:wrong:{today}:q1` and pushes
- **THEN** the key SHALL enter the bundle via the prescription sub-key matcher, and device B's apply SHALL union it in (write-once, never deleted)
- **AND** a `wrong:` key dated outside the today-±1 window SHALL NOT enter the snapshot, while remaining untouched locally

#### Scenario: Completion history syncs in full and never double-advances
- **WHEN** a pulled bundle carries `completed:{date}` keys spanning many past dates
- **THEN** all of them SHALL be accepted (UNION) so `completedDayCount` converges across devices
- **AND** the same day completed on two devices SHALL converge to ONE `completed:{date}` key (NG-0717 advances at most once for that date)

#### Scenario: Divergent plans converge to the earliest-created plan in any pull order
- **WHEN** two offline devices each generated a `plan:{date}` for the same date and later sync in either order
- **THEN** both devices SHALL converge on the plan with the smaller `(createdAt, seed)` (post-pass MIN-LWW, pull-order-independent)
- **AND** progress keys already written under the losing plan SHALL remain (UNION) and keep counting

#### Scenario: Local-only keys never sync
- **WHEN** the synced meta snapshot is built or an incoming bundle is applied
- **THEN** `lightsOut:{date}` and `localSeed` SHALL be excluded in BOTH directions (the matcher never matches them)

#### Scenario: Single additive schema bump with no Dexie or Worker change
- **WHEN** the feature is implemented
- **THEN** the R2 bundle `SCHEMA_VERSION` SHALL bump exactly once, 25 → 26, with reader tolerance in both directions
- **AND** there SHALL be no Dexie `.version()` bump, no Worker change, and no new TableAdapter

#### Scenario: A legacy plan without yearScope or tier fields is treated tolerantly
- **WHEN** a frozen plan generated before this change (no `yearScope`, no tier-spec fields) is read
- **THEN** it SHALL be treated as all-years and its day SHALL render no tier panel (derived-absent), continuing to function unchanged

### Requirement: The prescription SHALL NOT introduce any economy or leaderboard inflation

The prescription SHALL NOT grant DMN gacha draws, SHALL NOT introduce any new currency or spendable resource, and SHALL NOT add any leaderboard axis or otherwise let prescription activity inflate leaderboard stats. The ONLY material reward SHALL be the tier-graded **conduction-energy grants** paid at tier crossing — T1 基礎處方 +10, T2 追加固化 +15, T3 形成連結 +20, T4 深度出征 +25 (all dogfood-tunable), for a daily total ≤ 70 energy.

Each grant SHALL be delivered as a **flat write** (no streak / mastery / acceleration multipliers) into the existing per-family MONOTONIC `maze:<familyId>:earned` MAX-merge counter. Prescription energy SHALL NEVER be stored or merged as a scalar last-writer-wins value. The granted family SHALL be **deterministically derived from the frozen plan** (the plan's 開發新連結 family when present; otherwise a deterministic fallback derived from the frozen plan's date + seed) — never a random or time-dependent choice — so independent devices always grant the same family.

Every grant SHALL be gated by an idempotent write-once **claim marker**: `prescription:v1:reward:{date}` for T1 and `prescription:v1:tierClaim:{date}:{2|3|4}` for T2–T4. A device SHALL grant energy only when its OWN transaction transitions the claim key from absent to present; a claim arriving via cross-device sync SHALL mark the tier claimed WITHOUT re-granting locally (pull-replay safe — the granted energy already rides the MAX-merged counter). Because two offline devices crossing the same tier write the same flat amount into the same family's MAX-merge counter, a cross-device double-claim collapses on merge rather than stacking (forgiving-by-design).

#### Scenario: No draws or currency are granted
- **WHEN** the player completes any prescription tier
- **THEN** no DMN draw, no new currency, and no leaderboard axis SHALL be created or incremented by the prescription

#### Scenario: Tier energy is claim-gated and flat
- **WHEN** a device's answer crosses T2 for the first time today
- **THEN** the crediting transaction SHALL write `tierClaim:{date}:2` only because it was absent, and post-commit SHALL grant a flat +15 into the frozen plan's grant family `maze:<familyId>:earned` counter (no multipliers) with a non-punishing toast

#### Scenario: A pulled claim never re-grants
- **WHEN** a device applies an incoming bundle containing a `tierClaim:{date}:3` it does not hold
- **THEN** the tier SHALL render as claimed (claim-floor) and NO local energy grant SHALL fire (the energy already arrived inside the MAX-merged `earned` counter)

#### Scenario: Cross-device double-claim collapses instead of stacking
- **WHEN** two offline devices independently cross T2 the same day and each grants +15 flat from a similar counter base, then sync
- **THEN** the grant family's `earned` counter SHALL converge by MAX-merge to approximately a single +15 (never an additive +30)

### Requirement: 今日處方箋 SHALL offer an optional 考前救援 bonus that credits cram engagement without altering dayComplete

After (and only after) today's two-line prescription is complete (`dayComplete === true`), the card SHALL surface an OPTIONAL 考前救援 bonus tier. Its completion metric SHALL be: the player has practiced at least `CRAM_RESCUE_TARGET` (= 1) question from the 考前猜題 (cram) practice entry today, **regardless of correct or wrong**. This bonus MUST NOT be part of the `dayComplete` definition (the two lines alone define completion), MUST NOT be framed as 「下一步 / 未完成 / 繼續完成」, and MUST NOT introduce a countdown / denominator / prediction. Credit MAY accrue at any time today (e.g. morning cram practice); only the bonus's VISIBILITY is gated on `dayComplete`. Completion SHALL be tracked in write-once daily meta keys within the existing `prescription:v1:` namespace (`prescription:v1:cramRescue:{date}:{qid}`), so account-reset/switch wipes them via the existing prefix. These keys SHALL sync cross-device (write-once UNION, date-windowed) as part of the prescription daily-state sync table, so the bonus state and the tier ladder's T2 cram-fallback counting agree across devices; the keys additionally serve as the counting substrate for that T2 cram fallback (per the tier-ladder requirement). The R2 `SCHEMA_VERSION` bump is owned by the daily-state sync requirement (no separate bump here) and there is still NO Dexie schema change. The bonus itself SHALL NOT grant any real NG-0717 stat, XP, gacha, or leaderboard change (「額外養分 +1」 is flavor only).

#### Scenario: Bonus appears only after both lines are done
- **WHEN** the two prescription lines are not both complete
- **THEN** the 考前救援 bonus tier SHALL NOT be shown

#### Scenario: Cram practice credits the bonus regardless of correctness
- **WHEN** the player answers a question opened from the 考前猜題 practice entry today (correct OR wrong)
- **THEN** a write-once `prescription:v1:cramRescue:{date}:{qid}` key SHALL be recorded, and once the count reaches `CRAM_RESCUE_TARGET` the 考前救援 bonus SHALL read as done

#### Scenario: Cram-rescue credit syncs cross-device
- **WHEN** the player credits `cramRescue:{date}:{qid}` keys on the phone and later opens the laptop after a sync
- **THEN** the laptop SHALL count the same keys (write-once UNION) for both the 救援 bonus display and any T2 cram-fallback counting

#### Scenario: Bonus does not change dayComplete
- **WHEN** the 考前救援 bonus is incomplete but both prescription lines are complete
- **THEN** the day SHALL still count as complete (`dayComplete === true`) and NG-0717 maturation SHALL be unaffected by the bonus

#### Scenario: Bonus framing is optional, not a deficit
- **WHEN** the 考前救援 bonus renders in its undone state
- **THEN** it SHALL be framed as an optional invite (e.g. 「想趁手感還在？去高頻考點練 1 題就好（可選）」) and MUST NOT use 「未完成 / 還差 / 下一步 / 繼續完成」 or any countdown / denominator

#### Scenario: Bonus grants no economy
- **WHEN** the 考前救援 bonus reaches done
- **THEN** it SHALL show a flavor acknowledgement only and MUST NOT grant XP, gacha, leaderboard, or any real NG-0717 stat advance

### Requirement: Prescription progress SHALL be credited and surfaced from any answer entry point, including 考前猜題 practice

The system SHALL credit a frozen-snapshot repair or breadth question when it is answered from ANY quiz entry point — 答題 / 錯題出征 / 模考 / **考前猜題 practice mode** — not only via the 開始今日處方 CTA. Practice mode's "no progression" contract (grants no XP, gacha draw, or game streak) SHALL NOT suppress prescription crediting: correctly answering a repair-pool question consolidates that connection regardless of where it was answered — a **deliberate, documented exception scoped to prescription crediting only** ("answering correctly IS repairing the connection, regardless of entry point"). The answer verdict SHALL surface each credit at the moment it happens: a repair consolidation as 「連結已固化」, a first breadth-family answer as a 「新連結已開發」-class note, and the answer that completes both lines as a non-punishing 「今日處方箋完成」note. Crediting SHALL remain dedup / anti-cheat safe via the existing per-question write-once keys (no double-count, no target change, no snapshot mutation, no new question injection).

Tier crossings (per the tier-ladder requirement) SHALL likewise be credited at the moment they happen, from any entry point, via hooks at the prescription-crediting tail, the synapse-event listener, and the cram-practice record point — each newly-claimed tier surfacing as a non-punishing toast.

The day-completion celebration (the 「今日處方箋完成」note and any NG-0717 stage-up presentation) SHALL play ONCE per (account, day), on the **first-completing device**: the device whose OWN answer transitions `prescription:v1:completed:{date}` from absent to present. A device that learns of the day's completion via cross-device sync SHALL render the completed state silently, with NO second celebration.

#### Scenario: Cram-practice answer to a repair-snapshot question consolidates and surfaces
- **WHEN** the player answers a question in today's `wrongEligibleQuestionIds` correctly from 考前猜題 practice mode
- **THEN** its repair key SHALL be set (at most once that day) and the verdict SHALL show the 「連結已固化」note, exactly as if answered from the 開始今日處方 flow

#### Scenario: First breadth answer surfaces a breadth note
- **WHEN** the player answers an in-`breadthFamilyId` snapshot question for the first time today from any entry point
- **THEN** its breadth key SHALL be set and the verdict SHALL surface a 「新連結已開發」-class note for that first credit

#### Scenario: The completing answer surfaces a non-punishing completion note once
- **WHEN** an answer from any entry point makes both the repair and breadth lines reach their targets for the first time today on this account
- **THEN** the verdict SHALL surface a 「今日處方箋完成」note, and the day-completion / reward / imprint keys SHALL be written exactly once (idempotent per day)

#### Scenario: A second device learns of completion silently
- **WHEN** a device pulls a bundle whose `completed:{date}` marks today complete before the device itself completed the lines
- **THEN** the card SHALL render the completed state with NO celebration, NO toast replay, and NO second NG-0717 stage-up presentation

#### Scenario: Practice crediting grants no economy or game progression
- **WHEN** a prescription line is credited from practice mode
- **THEN** only the prescription line (and its existing completion and tier paths) SHALL advance — no XP, no DMN draw, no leaderboard axis, and no game streak SHALL be granted by the practice answer

### Requirement: Lineage imprint state SHALL persist as a cross-device write-once keepsake

All lineage-imprint state SHALL live in the existing `meta` key-value table under the `prescription:v1:ng0717:imprint:<subjectId>:<date>` namespace as **write-once** presence keys (set to a truthy value, never deleted). Imprint keys SHALL participate in cross-device sync as a **keepsake**: they join the synced meta set via a key **prefix** (`prescription:v1:ng0717:imprint:`) rather than an enumerated allowlist entry (the keys are dynamic — subject × date). Because the keys are write-once presence markers, their cross-device merge SHALL be **first-write-wins UNION** (the same convergence as the set-once `mazeSecondLapCelebrated:<family>` keys): a bud grown on either device ends up present on both, and a family's `touches` accumulates across devices as the UNION of its per-date keys. NO backfill post-pass and NO new R2 adapter SHALL be added **for the imprint family** (the prescription `plan:{date}` family's post-pass, per the daily-state sync requirement, is separate and does not touch imprint keys). The imprint introduction was an **additive** R2 bundle `SCHEMA_VERSION` bump with reader tolerance (an older client reading a newer bundle SHALL silently drop the imprint keys it does not recognise; a newer client reading an older bundle without imprint keys SHALL preserve its local imprints — first-write-wins never deletes local keys absent from the incoming bundle). The prefix SHALL remain exact to the imprint family — it SHALL NOT be the vehicle for any other `prescription:v1:*` key. (Other prescription daily-state families now sync via their own date-windowed matcher per the daily-state sync requirement; `lightsOut` / `localSeed` remain local-only.) NO Dexie `.version()` bump SHALL be introduced (the keys already exist locally; only the meta sync filter widens). Imprints SHALL remain **monotonic**; no spendable or bidirectional counter SHALL be added.

#### Scenario: Imprint keys are write-once and sync via the prefix as a UNION keepsake
- **WHEN** a device grows an imprint key `prescription:v1:ng0717:imprint:藥理學:2026-07-05`
- **THEN** it SHALL be written once (truthy, never deleted) and SHALL be included in the device's synced meta snapshot by matching the imprint prefix
- **AND** on a second device the merge SHALL add that key if absent (first-write-wins UNION), so the bud appears on both devices and `touches` reflects the union of per-date keys

#### Scenario: The imprint prefix matches only imprint keys
- **WHEN** the synced meta snapshot is built
- **THEN** keys under `prescription:v1:ng0717:imprint:` SHALL be included via the imprint prefix
- **AND** sibling `prescription:v1:*` daily-state keys SHALL enter (or not) ONLY via the prescription daily-state matcher — never via the imprint prefix — while `lightsOut` / `localSeed` SHALL be excluded entirely

#### Scenario: Additive schema bump is reader-tolerant in both directions
- **WHEN** a client on the previous `SCHEMA_VERSION` reads a bundle containing imprint keys
- **THEN** it SHALL silently drop those keys (not in its allowlist/prefix), with no error
- **AND WHEN** a client on the new `SCHEMA_VERSION` reads an older bundle with no imprint keys
- **THEN** it SHALL preserve its local imprints (first-write-wins never deletes local keys absent from the incoming bundle)

#### Scenario: No Dexie bump and no bidirectional counter
- **WHEN** the keepsake sync is implemented
- **THEN** there SHALL be no Dexie `.version()` bump and no spendable/bidirectional counter — only the meta sync filter widens to include the imprint prefix and the R2 `SCHEMA_VERSION` bumps additively
