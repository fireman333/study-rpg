# hospital-fate-cards Specification

## Purpose

命運卡 — 消耗 reputation 抽 4 階卡包（普通 1k / 稀有 10k / 史詩 100k / 傳奇 1M），內容池含招募券、進修保證券、facility / throughput 加成。Pity 3：連續 3 次衰運後第 4 次必中（每階獨立 counter，via monotonicCounters MAX-merge）。

## Requirements
### Requirement: Fate cards SHALL be unlocked at 醫學中心 tier

The system SHALL gate fate card draws behind `gameCounters.tier >= '醫學中心'`. The fate card UI SHALL be hidden (no nav link visible, route returns 404 if accessed directly) until the player reaches this tier. Once unlocked, the UI SHALL remain available even if the tier definition changes (no regression possible due to monotonic tiers).

#### Scenario: Pre-醫學中心 player cannot access fate cards

- **GIVEN** tier `'區域醫院'`
- **WHEN** the player navigates the app
- **THEN** no fate card nav link SHALL be visible
- **AND** directly navigating to `/fate-cards` SHALL render a "tier-locked" placeholder

#### Scenario: 醫學中心 player sees fate card nav

- **GIVEN** tier `'醫學中心'`
- **WHEN** the player views the home navigation
- **THEN** a fate card nav entry SHALL be visible

### Requirement: Four card-pack tiers SHALL be available with locked costs

The system SHALL provide exactly 4 card-pack tiers with locked reputation costs and content pools:

| Pack | Reputation cost | Content pool | Bad-luck rate |
|---|---|---|---|
| 普通命運（白） | 1,000 | recruitment ticket ×3 / minor revenue / event-immunity card | 5% (penalty: `-1,000 rep`) |
| 稀有命運（藍） | 10,000 | recruitment ticket ×10 / training guarantee voucher ×1 / event-positive trigger | 5% (penalty: `-10,000 rep`) |
| 史詩命運（紫） | 100,000 | targeted P3+ recruitment ticket / facility +0.5 permanent / 1-week salary waiver | 5% (penalty: `-50,000 rep`) |
| 傳奇命運（金） | 1,000,000 | targeted P2 recruitment ticket / all-room facility +1 / 1-week throughput ×2 | 0% |

The costs SHALL be recorded as literals in `packages/content-medexam2-tw/src/fate-cards.ts`. Insufficient-reputation attempts SHALL be blocked client-side BEFORE the draw.

#### Scenario: Common pack draw deducts reputation

- **GIVEN** `reputation = 5,000` and player initiates a 普通命運 draw
- **WHEN** the draw completes
- **THEN** `reputation` SHALL equal `4,000` (1,000 deducted regardless of result)
- **AND** a row SHALL appear in `fateCardHistory`

#### Scenario: Insufficient reputation blocks draw

- **GIVEN** `reputation = 5,000` and player attempts a 稀有命運 draw (cost 10,000)
- **WHEN** the draw button is pressed
- **THEN** no reputation deduction SHALL occur
- **AND** the UI SHALL display an insufficient-reputation error

### Requirement: Fate card draw history SHALL be persisted

The system SHALL append a row to `fateCardHistory` table for every draw with:

- `drawnAt: number` — Unix ms timestamp
- `packTier: 'common' | 'rare' | 'epic' | 'legendary'`
- `resultType: 'reward' | 'badLuck'`
- `rewardKey: string | null` — which reward pool item was drawn (null if bad luck)
- `costPaid: number` — reputation deducted

#### Scenario: Each draw creates history row

- **GIVEN** a clean `fateCardHistory` table
- **WHEN** the player completes 5 fate card draws
- **THEN** `fateCardHistory` SHALL contain exactly 5 rows
- **AND** the rows SHALL be ordered by `drawnAt`

### Requirement: Bad luck penalty SHALL never reduce reputation below zero

If a bad-luck penalty would drive `reputation` below 0, the system SHALL clamp to 0 (not negative). The player's tier SHALL never regress due to a bad-luck event (tier progression is monotonic per `clinic-level-up`).

#### Scenario: Penalty clamps at zero

- **GIVEN** `reputation = 500` and a 普通命運 draw resolves to bad luck (-1,000 rep penalty)
- **WHEN** the penalty applies
- **THEN** `reputation` SHALL equal `0`
- **AND** the player SHALL be notified of the penalty cap

### Requirement: Fate card SHALL apply consecutive-bad-luck pity at threshold 3

The system SHALL track a per-pack-tier `consecutiveBadLuckCount` counter (initialized 0 for each of `'common' / 'rare' / 'epic'`; the legendary tier has 0% bad luck rate and no counter). On each draw at a tier:

1. Before rolling, if `consecutiveBadLuckCount[tier] >= 3`, the draw SHALL skip the bad-luck roll and force a reward result (drawn from the reward pool with uniform probability). The counter SHALL then reset to 0.
2. Otherwise, the system SHALL roll bad-luck-vs-reward per the standard probability table.
3. If the result is bad luck, `consecutiveBadLuckCount[tier] += 1`.
4. If the result is reward (including pity-forced reward), `consecutiveBadLuckCount[tier] = 0`.

The counter SHALL be persistent across app reloads (stored in `gameCounters.singleton` or similar). The counter SHALL be independent per pack tier — bad luck at 普通命運 does NOT increment the counter for 稀有命運.

#### Scenario: Pity triggers reward after 3 consecutive bad luck

- **GIVEN** `consecutiveBadLuckCount['common'] = 3` (from 3 prior bad-luck draws at 普通命運)
- **WHEN** the player initiates another 普通命運 draw
- **THEN** the draw SHALL skip the 5% bad-luck roll
- **AND** the result SHALL be a reward drawn from the common reward pool
- **AND** `consecutiveBadLuckCount['common']` SHALL reset to `0`

#### Scenario: Reward resets the counter

- **GIVEN** `consecutiveBadLuckCount['common'] = 2`
- **WHEN** the player initiates a 普通命運 draw and the result is a reward (95% probability)
- **THEN** `consecutiveBadLuckCount['common']` SHALL reset to `0`

#### Scenario: Counter is independent per tier

- **GIVEN** `consecutiveBadLuckCount['common'] = 3` and `consecutiveBadLuckCount['rare'] = 0`
- **WHEN** the player draws a 稀有命運 card
- **THEN** the draw SHALL use the standard 5% bad-luck roll (no pity)
- **AND** if the result is bad luck, `consecutiveBadLuckCount['rare']` SHALL equal `1`
- **AND** `consecutiveBadLuckCount['common']` SHALL remain `3`

#### Scenario: Pity counter persists across reload

- **GIVEN** `consecutiveBadLuckCount['epic'] = 2`
- **WHEN** the app reloads
- **THEN** after rehydration, `consecutiveBadLuckCount['epic']` SHALL still equal `2`

### Requirement: Targeted ticket reward SHALL persist to dedicated table

When an epic or legendary fate card draw resolves to a `targeted-p3-ticket` or `targeted-p2-ticket` reward, the system SHALL create a row in a dedicated `targetedTickets` IndexedDB table and SHALL NOT increment the global `tickets.available` counter. The row SHALL carry:

- `id: string` — `crypto.randomUUID()` or fallback unique id
- `subjectId: SubjectId | null` — `null` until player picks a subject
- `minRarity: 'P2' | 'P3'` — `P3` for epic source, `P2` for legendary source
- `status: 'pending' | 'assigned' | 'consumed'` — initial value `pending` until subject is chosen
- `obtainedAt: number` — `Date.now()` at draw resolution
- `assignedAt: number | null` — set when `status` transitions to `assigned`
- `consumedAt: number | null` — set when `status` transitions to `consumed`
- `resultDoctorId: string | null` — FK to `doctors.id`, set on consume
- `sourceFateCardTier: 'epic' | 'legendary'`
- `updatedAt: number` — last-write-wins timestamp for future cloud sync

The system SHALL also append a row to `targetedTicketHistory` with `event = 'obtained'` at the same moment.

#### Scenario: Epic fate card draw creates pending targeted ticket

- **GIVEN** the player draws an epic 命運卡 and the result resolves to `rewardKey = 'targeted-p3-ticket'`
- **WHEN** the draw resolution executes
- **THEN** a new row SHALL be inserted into `targetedTickets` with `status = 'pending'`, `minRarity = 'P3'`, `subjectId = null`, `sourceFateCardTier = 'epic'`
- **AND** `tickets.available` SHALL NOT be incremented
- **AND** a `targetedTicketHistory` row SHALL be created with `event = 'obtained'`

#### Scenario: Legendary fate card draw uses P2 floor

- **GIVEN** the player draws a legendary 命運卡 and the result resolves to `rewardKey = 'targeted-p2-ticket'`
- **WHEN** the draw resolution executes
- **THEN** a new row SHALL be inserted into `targetedTickets` with `minRarity = 'P2'` and `sourceFateCardTier = 'legendary'`

#### Scenario: Common and rare fate card ticket rewards remain global

- **GIVEN** the player draws a common 命運卡 and resolves to `rewardKey = 'recruitment-ticket-x3'`, OR a rare 命運卡 and resolves to `rewardKey = 'recruitment-ticket-x10'`
- **WHEN** the draw resolution executes
- **THEN** `tickets.available` SHALL be incremented by 3 or 10 respectively (existing behavior)
- **AND** no row SHALL be created in `targetedTickets`

### Requirement: Draw-time subject picker SHALL gate targeted ticket assignment to unlocked banners with double-step confirmation

Immediately after an epic or legendary fate card draw resolves to a targeted ticket reward, the system SHALL present a subject picker modal. The picker SHALL show only subjects whose banner is currently unlocked (i.e., `affinity[subject] >= threshold[subject]` per `recruitment-gacha` Req「Banner unlock SHALL follow binary threshold gate per subject」).

When the player taps a subject row in the picker, the system SHALL NOT immediately commit the assignment. Instead, a **confirmation modal** SHALL display: 「確定要把這張 ${tier} targeted ticket 指派給 ${subjectId}？此操作不可逆」with two actions: "確認指派" and "我再想想". Only on tapping "確認指派" SHALL the system update the `targetedTickets` row: `subjectId = <picked>`, `status = 'assigned'`, `assignedAt = Date.now()`. Tapping "我再想想" SHALL close the confirm modal and return the player to the picker.

A `targetedTicketHistory` row with `event = 'assigned'` SHALL be appended on successful confirmation.

Once `status = 'assigned'`, the `subjectId` SHALL NOT be reassigned through normal UI flow (no cancel window, no pre-consume reassign). The picker modal SHALL block dismissal until either (a) a subject is picked AND confirmed, or (b) the player explicitly defers via a "save for later" action (transitioning the ticket to remain `pending`).

#### Scenario: Picker lists only unlocked banners

- **GIVEN** the player draws an epic targeted ticket
- **AND** `affinity = { 內科: 60, 外科: 50, 皮膚科: 5 }` with `threshold = { 內科: 50, 外科: 50, 皮膚科: 30 }`
- **WHEN** the subject picker opens
- **THEN** the picker SHALL show 內科 and 外科 as selectable
- **AND** 皮膚科 SHALL NOT be selectable (banner locked)

#### Scenario: Selecting a subject opens confirm modal before commit

- **GIVEN** the player has a pending targeted ticket from an epic draw and 外科 is unlocked
- **WHEN** the player taps 外科 in the picker
- **THEN** a confirmation modal SHALL display with copy「確定要把這張 epic targeted ticket 指派給 外科？此操作不可逆」
- **AND** the ticket row SHALL NOT yet have updated `status` or `subjectId`

#### Scenario: Confirm commits assignment

- **GIVEN** the confirm modal is open for 外科 assignment
- **WHEN** the player taps "確認指派"
- **THEN** the ticket row SHALL update to `subjectId = '外科'`, `status = 'assigned'`, `assignedAt = <now>`
- **AND** the targeted ticket SHALL be visible in the recruitment page's targeted ticket section
- **AND** subsequent UI SHALL NOT offer a reassign option

#### Scenario: Cancel from confirm returns to picker

- **GIVEN** the confirm modal is open for 外科 assignment
- **WHEN** the player taps "我再想想"
- **THEN** the confirm modal SHALL close
- **AND** the picker modal SHALL remain visible with 外科 still selectable
- **AND** the ticket row SHALL remain `status = 'pending'`, `subjectId = null`

#### Scenario: Player defers picker via save for later

- **GIVEN** the player draws an epic targeted ticket and unlocked banners include 內科
- **WHEN** the player chooses "save for later" instead of picking a subject
- **THEN** the ticket SHALL remain `status = 'pending'`, `subjectId = null`
- **AND** the picker SHALL be reachable from the FateCardPage pending banner chip

### Requirement: Pending targeted tickets SHALL persist when no banners are unlocked

If a targeted ticket is created while no subject banners are unlocked (i.e., every `affinity[subject] < threshold[subject]`), the system SHALL still create the row with `status = 'pending'` and SHALL surface a chip on the FateCardPage and RecruitmentPage indicating `「N 張待指派 targeted ticket — 解鎖任一 banner 後可指派」`. When a banner subsequently unlocks (via accumulating affinity from quiz answers), tapping the chip SHALL open the picker modal allowing assignment.

#### Scenario: Targeted ticket persists across reload while pending

- **GIVEN** the player draws an epic targeted ticket with `subjectId = null` and 0 banners unlocked
- **AND** the player closes and reopens the app
- **WHEN** the FateCardPage and RecruitmentPage render
- **THEN** the pending ticket SHALL still exist in `targetedTickets` with `status = 'pending'`
- **AND** the pending chip SHALL be visible on both pages

#### Scenario: Banner unlock reveals pending picker

- **GIVEN** a pending targeted ticket exists with 0 banners unlocked
- **WHEN** the player answers enough 內科 quiz questions to satisfy `affinity['內科'] >= threshold['內科']`
- **THEN** the pending chip SHALL update count or remain visible
- **AND** tapping the chip SHALL open the picker modal showing 內科 as selectable
