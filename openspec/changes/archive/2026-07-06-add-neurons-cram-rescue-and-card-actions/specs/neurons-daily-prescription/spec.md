## MODIFIED Requirements

### Requirement: System SHALL present a single CTA that routes to the next incomplete line

The prescription card SHALL present a two-button action row: a 高頻考點 button (→ `/cram`) and a primary 今日處方 button. The 今日處方 button is the single primary CTA that routes the player to the next incomplete line — 訂正錯題 first, then 開發盲區 — so the player never has to choose a mode. When both lines are complete the 今日處方 button SHALL render a non-routing completed state rather than routing. The 高頻考點 button SHALL carry no badge / count / countdown / streak.

#### Scenario: CTA routes to the wrong line first
- **WHEN** the 訂正錯題 line is incomplete and the player taps 今日處方
- **THEN** the player SHALL be routed into the wrong-pool expedition flow

#### Scenario: CTA routes to the blind-spot line once errors are done
- **WHEN** the 訂正錯題 line is complete but 開發盲區 is not, and the player taps 今日處方
- **THEN** the player SHALL be routed into the 盲區 family's `fresh` mode

#### Scenario: CTA shows completed state when both lines are done
- **WHEN** both lines are complete for the day
- **THEN** the 今日處方 button SHALL render a completed state and SHALL NOT route into a quiz

#### Scenario: Two-button action row
- **WHEN** the expanded card renders
- **THEN** a 高頻考點 button (to `/cram`) and a 今日處方 button SHALL appear as a side-by-side row, and the 高頻考點 button SHALL carry no badge / count / countdown

### Requirement: Completing the daily prescription SHALL mature the NG-0717 collectible neuron by rolling completions

When both lines of the day's prescription are complete, the system SHALL mark the day complete (`prescription:v1:completed:{date}`) and advance the maturation of **NG-0717**, a collectible mascot neuron (an adult-born dentate granule cell). Maturation SHALL be driven ONLY by the rolling count of completed days (`completedDayCount`), NOT by the calendar. NG-0717 SHALL have four visible stages reached at completion milestones **1 / 3 / 6 / 10** (dogfood-tunable): stage 1 newborn stem cell → stage 2 migrating neuroblast → stage 3 immature wiring neuron → stage 4 mature integrated neuron (full form). The current stage SHALL be **derived** from `completedDayCount` (never stored as its own mutable field). Reaching stage 4 SHALL unlock a permanent keepsake. Reward claiming SHALL be idempotent per day (`prescription:v1:reward:{date}`), so completing on a second device the same day SHALL NOT double-advance.

The card PRESENTATION of maturation SHALL be open-ended and anti-anxiety: it SHALL NOT surface the milestone thresholds (1/3/6/10), a 「還差 X 天」 countdown, or a 「第 N 天完全體」 deadline framing. The maturation hint SHALL read as open-ended (e.g. 「每一次完成都算數」, no deadline, no regression), and the keepsake SHALL be framed as a memento of the repair journey, not a deadline.

#### Scenario: Completing both lines advances NG-0717 by one completed day
- **WHEN** the player completes both the 訂正錯題 and 開發盲區 lines on a day
- **THEN** `prescription:v1:completed:{date}` SHALL be set and NG-0717's derived stage SHALL reflect the updated `completedDayCount`

#### Scenario: NG-0717 stage changes at milestone completions
- **WHEN** `completedDayCount` reaches 1, 3, 6, or 10
- **THEN** NG-0717 SHALL render the corresponding stage (newborn → neuroblast → wiring → mature), derived from `completedDayCount`

#### Scenario: Full maturity unlocks the keepsake
- **WHEN** `completedDayCount` reaches 10
- **THEN** NG-0717 SHALL reach stage 4 and unlock a permanent keepsake

#### Scenario: Reward is idempotent per day
- **WHEN** the same day's completion is processed more than once (e.g. a second device syncs the same day)
- **THEN** NG-0717 SHALL advance at most once for that date (no double-advance)

#### Scenario: Maturation presentation carries no countdown or deadline
- **WHEN** the NG-0717 maturation hint or keepsake renders on the card
- **THEN** it MUST NOT display the milestone numbers (1/3/6/10), a 「還差 X 天」 countdown, or a 「第 N 天完全體」 deadline framing

### Requirement: The 處方箋 card SHALL offer a low-salience exit to 考前猜題

The 今日處方箋 card SHALL surface exactly one 高頻考點 button linking to `/cram` (考前猜題), framed as an optional exam-eve resource, presented as the left button of the two-button action row alongside the primary 今日處方 button. The button SHALL NOT carry a badge / count / countdown / streak, and SHALL NOT imply the daily two-line ritual is incomplete without it (the anti-anxiety contract is preserved).

#### Scenario: A 高頻考點 button is present in the action row
- **WHEN** the expanded 處方箋 card renders
- **THEN** a single 高頻考點 button linking to `/cram` SHALL be shown in the action row

#### Scenario: The cram button carries no anxiety framing
- **WHEN** the 高頻考點 button renders
- **THEN** it SHALL NOT show a badge, count, countdown, or any copy implying the daily ritual is incomplete without visiting 考前猜題

## ADDED Requirements

### Requirement: 今日處方箋 SHALL offer an optional 考前救援 bonus that credits cram engagement without altering dayComplete

After (and only after) today's two-line prescription is complete (`dayComplete === true`), the card SHALL surface an OPTIONAL 考前救援 bonus tier. Its completion metric SHALL be: the player has practiced at least `CRAM_RESCUE_TARGET` (= 1) question from the 考前猜題 (cram) practice entry today, **regardless of correct or wrong**. This bonus MUST NOT be part of the `dayComplete` definition (the two lines alone define completion), MUST NOT be framed as 「下一步 / 未完成 / 繼續完成」, and MUST NOT introduce a countdown / denominator / prediction. Credit MAY accrue at any time today (e.g. morning cram practice); only the bonus's VISIBILITY is gated on `dayComplete`. Completion SHALL be tracked in LOCAL-ONLY write-once daily meta keys within the existing `prescription:v1:` namespace (`prescription:v1:cramRescue:{date}:{qid}`), so account-reset/switch wipes them via the existing prefix; it SHALL introduce no Dexie schema, no R2 bundle, and no sync-allowlist change. The bonus SHALL NOT grant any real NG-0717 stat, XP, gacha, or leaderboard change (「額外養分 +1」 is flavor only).

#### Scenario: Bonus appears only after both lines are done
- **WHEN** the two prescription lines are not both complete
- **THEN** the 考前救援 bonus tier SHALL NOT be shown

#### Scenario: Cram practice credits the bonus regardless of correctness
- **WHEN** the player answers a question opened from the 考前猜題 practice entry today (correct OR wrong)
- **THEN** a write-once `prescription:v1:cramRescue:{date}:{qid}` key SHALL be recorded, and once the count reaches `CRAM_RESCUE_TARGET` the 考前救援 bonus SHALL read as done

#### Scenario: Bonus does not change dayComplete
- **WHEN** the 考前救援 bonus is incomplete but both prescription lines are complete
- **THEN** the day SHALL still count as complete (`dayComplete === true`) and NG-0717 maturation SHALL be unaffected by the bonus

#### Scenario: Bonus framing is optional, not a deficit
- **WHEN** the 考前救援 bonus renders in its undone state
- **THEN** it SHALL be framed as an optional invite (e.g. 「想趁手感還在？去高頻考點練 1 題就好（可選）」) and MUST NOT use 「未完成 / 還差 / 下一步 / 繼續完成」 or any countdown / denominator

#### Scenario: Bonus grants no economy
- **WHEN** the 考前救援 bonus reaches done
- **THEN** it SHALL show a flavor acknowledgement only and MUST NOT grant XP, gacha, leaderboard, or any real NG-0717 stat advance
