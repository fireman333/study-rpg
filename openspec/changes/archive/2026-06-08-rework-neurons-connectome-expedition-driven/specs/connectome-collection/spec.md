## REMOVED Requirements

### Requirement: Synapse SHALL be created between two families upon first same-day co-firing reaching N=5 threshold per family

**Reason**: 觸發改綁「出征共同修復」（repair together, wire together）以對齊真正的學習價值（錯題回收）；「同日各科答對 5 題」鼓勵的是打卡式多科淺練，與學習目標脫節。

**Migration**: 由新 ADDED 需求「Synapse SHALL be created between two subjects upon same-day cross-subject expedition repair」取代。既有 `db.synapses` row 保留、不 backfill、從新規則向前更新。`familyAccrual.firedToday` / N=5 同日 co-fire 計數不再用於 synapse 形成（AP monotonic counter 本身保留作 provenance，見既有「Per-family Action Potential」需求，未變）。

### Requirement: Synapse state machine SHALL implement three discrete states (dormant / weak / strong) with strengthening on subsequent same-day co-fires

**Reason**: 升階改由「不同日再次跨科共同修復（出征）」驅動，不再是「不同日各科同日共同答對」。

**Migration**: 由新 ADDED 需求「Synapse state machine SHALL strengthen on subsequent-day cross-subject co-repair」取代；狀態值 dormant/weak/strong 與既有 row 完全相容。

### Requirement: LTD decay SHALL downgrade synapse state by one level after 7+ days without co-fire, never removing the synapse

**Reason**: 衡量基準由「無共同 co-fire」改為「無共同 co-repair」（出征驅動）；衰退窗**維持既有 7 天**（遊戲 ~2 個月玩完，7 天讓「不維護就變弱」有意義、漏 2–3 天又不致挫折——owner 拍板，不改 14/21）。

**Migration**: 由新 ADDED 需求「LTD decay SHALL downgrade synapse state by one level after 7+ days without co-repair」取代；衰退語意（降一階、不移除、降後更新日期防串聯）不變。

## MODIFIED Requirements

### Requirement: Daily reset SHALL run lazily on next user interaction crossing local-TZ midnight

The system SHALL use a lazy daily reset strategy rather than a background scheduler:

- A `meta.lastResetDate` value SHALL be persisted (initialized on save creation to that date)
- On every entry into `recordCorrectAnswer`, `loadConnectome`, and the expedition-settlement connectome-credit entry point (`onExpeditionComplete` path), the system SHALL check whether `meta.lastResetDate` ≠ today's local date
- If different, the system SHALL run the daily reset sequence before continuing:
  1. Clear the per-day repair tracking used by the expedition-driven synapse trigger (the prior day's `connectome:dailyRepair:<date>` / `connectome:dailyWiredPairs:<date>` are date-keyed and naturally roll; any in-memory per-day accumulator SHALL reset to empty)
  2. Run the LTD decay pass per the 7-day decay requirement
  3. If the prior day did NOT record an effective expedition completion, reset `expeditionStreak` to 0 (per the streak requirement)
  4. Update `meta.lastResetDate` to today's local date

The reset SHALL handle multi-day gaps (user opens the app after a multi-day absence): the LTD decay pass sets each decayed synapse's `lastCoFireDate` to the decay date so no cascading occurs and a single pass suffices; a multi-day gap with no completion breaks the streak (resets to 0).

#### Scenario: First app entry of a new day triggers reset before processing the answer

- **GIVEN** `meta.lastResetDate = "2026-06-08"` and today is `"2026-06-09"`
- **WHEN** the player takes the first connectome-affecting action of `2026-06-09` (answer, connectome load, or expedition settlement)
- **THEN** before processing, the per-day repair accumulation SHALL be empty for `2026-06-09`
- **AND** the 7-day LTD decay pass SHALL have run
- **AND** if `2026-06-08` recorded no effective expedition completion, `expeditionStreak` SHALL be reset to 0
- **AND** `meta.lastResetDate` SHALL equal `"2026-06-09"`

#### Scenario: Same-day repeated entry does not re-run reset

- **GIVEN** `meta.lastResetDate = "2026-06-09"` and today is `"2026-06-09"`
- **WHEN** the player takes a second connectome-affecting action on the same day
- **THEN** the daily reset sequence SHALL NOT run again
- **AND** `meta.lastResetDate` SHALL remain `"2026-06-09"`

## ADDED Requirements

### Requirement: Synapse SHALL be created between two subjects upon same-day cross-subject expedition repair

The neurons mode SHALL create / consider for strengthening cross-subject synapses based on **expedition repair**, evaluated at expedition settlement (`onExpeditionComplete`), NOT per individual answer:

- A "repair" is a question whose history `lastResult === 'wrong'` that is answered correctly (flip wrong → correct) **within an expedition session**. A wrong→correct flip outside an expedition session (normal random / per-family quiz) SHALL NOT count toward connectome wiring.
- The system SHALL accumulate, per local-TZ day, each subject's repair count (`connectome:dailyRepair:<date>`).
- A subject is **repaired today** once its same-day repair count reaches `K` (default 2, dogfood-tunable).
- **Effective-completion gate**: pair processing SHALL run ONLY on a day with an *effective expedition completion* (per the streak requirement — today's total repairs ≥ 5, or pool < 5 cleared AND ≥ 2). Below this gate, repaired-today counts still accumulate but NO pair SHALL be formed / strengthened (wiring shares the same daily bar as the streak so it is not trivially cheap at `K=2`).
- When ≥ 2 subjects are repaired today AND the effective-completion gate is met, the system SHALL form / strengthen synapses among them: candidate pairs = all unordered pairs of today's repaired subjects.
- The system SHALL process at most `DAILY_PAIR_CAP` (default 3, dogfood-tunable) pairs per day, selecting by priority order: (1) not-yet-existing pair, (2) `weak → strong` candidate, (3) longest time since last co-repair, (4) higher today repair-count product.
- A newly created synapse SHALL be `dormant`, with `pairKey = <smallerId>|<largerId>` (lexicographic) and `lastCoFireDate` (semantically the repair date) = today.
- Synapse creation SHALL emit `connectome.synapseFormed`; the per-day processed pairs SHALL be recorded (`connectome:dailyWiredPairs:<date>`) so the same pair is not re-processed twice in one day.
- The 年份回數遠征 (exam-set full-paper expedition) SHALL NOT count toward connectome wiring in this version (it is systematic full-coverage review, not wrong-answer repair).

#### Scenario: Two subjects each repaired ≥K in expeditions today form a synapse

- **GIVEN** today the player has, across expedition sessions, repaired (wrong→correct flip) 2 questions in `藥理學` and 2 in `解剖學`
- **WHEN** the expedition settlement connectome-credit runs
- **THEN** a synapse `pairKey = "藥理學|解剖學"` SHALL exist with `state = dormant` and `lastCoFireDate = today`
- **AND** a `connectome.synapseFormed` event SHALL have been emitted

#### Scenario: A subject below K repairs does not pair

- **GIVEN** today the player has repaired 2 in `藥理學` and only 1 in `解剖學`
- **THEN** no synapse SHALL be created for `藥理學|解剖學`

#### Scenario: Below the effective-completion gate, no pair forms

- **GIVEN** the day's wrong pool is ≥ 5 and today the player repaired 2 in `藥理學` and 2 in `解剖學` but only 4 total repairs (below the 5-repair effective-completion threshold)
- **WHEN** the expedition settlement connectome-credit runs
- **THEN** repaired-today counts SHALL be recorded but NO synapse SHALL be formed or strengthened today
- **AND** once a later expedition the same day brings total repairs to ≥ 5, pair processing SHALL run

#### Scenario: Daily pair cap bounds wiring

- **GIVEN** today 4 subjects are each repaired ≥K (6 possible pairs)
- **WHEN** the expedition settlement connectome-credit runs
- **THEN** at most `DAILY_PAIR_CAP` (default 3) pairs SHALL be formed / strengthened today, chosen by the priority order

#### Scenario: A normal-quiz wrong→correct flip does not wire

- **GIVEN** the player answers a previously-wrong question correctly in normal (non-expedition) quiz mode
- **THEN** it SHALL count as a question-history flip but SHALL NOT contribute to `connectome:dailyRepair` or any synapse wiring

### Requirement: Synapse state machine SHALL strengthen on subsequent-day cross-subject co-repair

The synapse state machine SHALL retain exactly three states with forward transitions driven by repeated cross-subject co-repair on later days:

| Current state | Transition trigger | Next state |
|---|---|---|
| `dormant` | Both subjects re-qualify as repaired-today on a day later than `lastCoFireDate` | `weak` |
| `weak` | Both subjects re-qualify on a later day | `strong` |
| `strong` | Both subjects re-qualify on a later day | `strong` (no further forward transition; `lastCoFireDate` updates) |

A pair SHALL advance at most one level per day. Transitions to `weak` / `strong` SHALL emit `connectome.synapseStrengthened`. An update that only refreshes `lastCoFireDate` without a state change SHALL NOT emit a strengthening event.

#### Scenario: Dormant upgrades to weak on a later-day co-repair

- **GIVEN** a synapse `state = dormant`, `lastCoFireDate = "2026-06-08"`
- **WHEN** on `"2026-06-09"` both subjects again qualify as repaired-today and the pair is selected within the daily cap
- **THEN** `state` SHALL become `weak`, `lastCoFireDate = "2026-06-09"`
- **AND** `connectome.synapseStrengthened` SHALL have been emitted `{ pairKey, fromState: "dormant", toState: "weak" }`

#### Scenario: Same-day re-repair does not double-advance

- **GIVEN** a pair already advanced one level today
- **WHEN** both subjects continue repairing more questions the same day
- **THEN** the pair SHALL NOT advance a second level that day

### Requirement: LTD decay SHALL downgrade synapse state by one level after 7+ days without co-repair, never removing the synapse

The daily reset job SHALL run an LTD decay pass:

- For every synapse where `today - lastCoFireDate` > 7 days: `strong → weak`, `weak → dormant`, `dormant → dormant` (no further decay).
- Decay SHALL emit `connectome.synapseDecayed { pairKey, fromState, toState }`.
- After decay, the synapse's `lastCoFireDate` SHALL be set to today so the next decay opportunity is ≥ 7 more days away (no cascading).
- A synapse SHALL NEVER be removed (`weak` does not auto-disappear; full decay rests at `dormant`).

#### Scenario: Strong decays to weak after 8 days without co-repair

- **GIVEN** a synapse `state = strong`, `lastCoFireDate = "2026-06-01"`, with no co-repair since
- **WHEN** the daily reset runs on `"2026-06-09"`
- **THEN** `state` SHALL become `weak`, `lastCoFireDate = "2026-06-09"`
- **AND** `connectome.synapseDecayed { fromState: "strong", toState: "weak" }` SHALL have been emitted

#### Scenario: Weak never disappears

- **GIVEN** a synapse `state = weak`, `lastCoFireDate` 60 days ago
- **WHEN** the daily reset runs
- **THEN** the synapse SHALL still exist with `state = dormant` (decayed one level) and SHALL never be removed

### Requirement: Daily effective expedition completion SHALL drive a cross-day study streak

The system SHALL track a cross-day study streak keyed on **effective expedition completion**:

- An effective expedition completion for a day = total expedition repairs that day ≥ 5; OR, when the day's available wrong pool was < 5, clearing all available wrong questions AND repairing ≥ 2.
- On the first effective completion of a day, the system SHALL increment `expeditionStreak` by 1 (once per day) and set `expeditionLastCompleteDate = today`.
- A day with no effective completion SHALL reset `expeditionStreak` to 0 (evaluated by the daily reset for the elapsed gap).
- The system SHALL ALSO surface a **rolling weekly completion** count `本週 X/7` (count of effective-completion days within the current local-TZ week) as a non-punitive framing so a single missed day does not emotionally zero the system. The weekly count MAY be derived from effective-completion dates (no additional persisted streak counter is required) and confers no bonus.
- The streak (and weekly count) SHALL be the only retention metrics gated on completion; they SHALL NOT confer any energy, speed, or gameplay-numeric bonus.

#### Scenario: Effective completion increments the streak once per day

- **GIVEN** `expeditionStreak = 3`, `expeditionLastCompleteDate = yesterday`
- **WHEN** the player today repairs ≥ 5 questions in expeditions
- **THEN** `expeditionStreak` SHALL become 4 and `expeditionLastCompleteDate = today`
- **AND** further repairs the same day SHALL NOT increment the streak again

#### Scenario: A missed day breaks the streak

- **GIVEN** `expeditionStreak = 4`, `expeditionLastCompleteDate` two days ago, and yesterday had no effective completion
- **WHEN** the daily reset runs
- **THEN** `expeditionStreak` SHALL be reset to 0

#### Scenario: Weekly framing shows days completed this week

- **GIVEN** the player had effective expedition completions on 4 distinct days within the current local-TZ week
- **WHEN** the homepage renders connectome status
- **THEN** it SHALL show `本週 4/7` alongside the daily streak

### Requirement: Synapses SHALL confer visible, additive, capped synaptic conduction

A formed cross-subject synapse SHALL confer **synaptic conduction** — a one-hop, additive, capped, VISIBLE cross-flow of neural energy along the wire. This REPLACES the prior invisible self-multiplying `synapseBonus` (removed; see `neurons-brain-maze`). The connectome is therefore NOT zero-numeric: wiring grants a felt, fair (additive-only), bounded energy benefit whose visual (the pulse) IS the benefit.

- **Trigger / batching**: conduction SHALL be computed on BATCHED source energy at (a) expedition settlement and (b) reading-session end — NOT per individual answer, and NOT via a daily sweep. For each family that earned energy in a batch and participates in ≥ 1 eligible synapse, each wired neighbor SHALL receive conduction.
- **Eligibility (validated synapses only)**: only a synapse whose `lastCoFireDate` is ≥ the conduction-rework ship epoch SHALL conduct. A legacy same-day-co-fire wire (`lastCoFireDate` before the epoch) SHALL NOT conduct until re-validated by a new co-repair (see the legacy-synapse requirement).
- **Rate** (applied to the source family's POST-multiplier earned energy for that batch): `dormant` 0% / `weak` 6% / `strong` 12% (dogfood-tunable).
- **Rounding / minimum pulse**: `conduction = floor(batchEarned × rate)`; if `< 1` → suppressed (no energy, no pulse); if `≥ 1` → the neighbor's energy pool SHALL be increased by that amount AND a `connectome.conductionPulse { fromFamily, toFamily, amount, state }` event SHALL be emitted (the visible pulse). UI MAY show the numeric label only for pulses `≥ 2`.
- **Direction**: bidirectional (each endpoint conducts to the other when it is the earning source).
- **Caps** (per local-TZ day, dogfood-tunable): per-wire `weak 8 / strong 15`; per-source-family `45` total outgoing; per-target-family `30` total incoming. Conduction exceeding any cap that day SHALL be dropped (not deferred).
- **Non-amplification / non-feedback**: conduction energy SHALL NOT itself trigger further conduction (one hop, no chaining); SHALL NOT be scaled by the target family's own multipliers; SHALL NOT strengthen any synapse; SHALL NOT count toward `connectome:dailyRepair` or co-repair.
- **Additive only**: a family's own accrual is unchanged by conduction; conduction is purely extra energy granted to wired neighbors. An unwired family receives no conduction and is never worse than baseline.

#### Scenario: A strong wire conducts a visible pulse to its neighbor

- **GIVEN** a validated `strong` synapse `藥理學|解剖學`, and an expedition settlement in which `藥理學` earned 100 post-multiplier energy this batch
- **WHEN** conduction is computed
- **THEN** `解剖學`'s energy pool SHALL increase by `floor(100 × 0.12) = 12` (within caps)
- **AND** a `connectome.conductionPulse { fromFamily: "藥理學", toFamily: "解剖學", amount: 12, state: "strong" }` event SHALL be emitted

#### Scenario: Sub-1 conduction is suppressed (no invisible dribble)

- **GIVEN** a validated `weak` synapse and a batch where the source earned 10 energy (`floor(10 × 0.06) = 0`)
- **THEN** no energy SHALL be granted and no pulse SHALL be emitted

#### Scenario: Per-wire daily cap bounds conduction

- **GIVEN** a validated `strong` wire that has already conducted 15 energy across it today
- **WHEN** the source earns more energy in a later batch
- **THEN** no further conduction SHALL flow across that wire today

#### Scenario: Conduction does not chain or strengthen

- **WHEN** family A conducts energy to wired neighbor B
- **THEN** B's received conduction energy SHALL NOT itself conduct onward to B's other neighbors
- **AND** the conduction SHALL NOT change any synapse's state and SHALL NOT count as co-repair

#### Scenario: An unwired family is never worse than baseline

- **GIVEN** a family with no synapses
- **WHEN** it earns energy
- **THEN** its accrual SHALL be identical to a save where conduction does not exist (no penalty for being unwired)

### Requirement: Legacy same-day-co-fire synapses SHALL be preserved as historical traces with no numeric effect until re-validated

Synapses created by the removed same-day-co-fire trigger (those whose `lastCoFireDate` precedes the conduction-rework ship epoch) SHALL be preserved — never wiped, never backfilled — but treated as **historical / 早期連線**:

- They SHALL render with a visually-distinct, quieter treatment (e.g., thinner / grey-blue) labeled 早期連線.
- They SHALL be EXCLUDED from the「穩定連線數」narrative stat (and from 最強 pair) and SHALL NOT conduct (no numeric effect), until re-validated.
- A legacy synapse is **re-validated** when a new expedition co-repair updates its `lastCoFireDate` to ≥ the ship epoch; thereafter it counts toward 穩定連線數 and conducts per its current state.

#### Scenario: A legacy synapse has no numeric effect until re-validated

- **GIVEN** a `strong` synapse whose `lastCoFireDate` precedes the ship epoch
- **WHEN** the homepage renders 穩定連線數 and an energy batch is conducted
- **THEN** that synapse SHALL NOT be counted in 穩定連線數, SHALL render as 早期連線, and SHALL NOT conduct any energy
- **AND** after a new expedition co-repair updates its `lastCoFireDate` to ≥ the ship epoch, it SHALL count toward 穩定連線數 and conduct per its current state
