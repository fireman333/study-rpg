## ADDED Requirements

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
