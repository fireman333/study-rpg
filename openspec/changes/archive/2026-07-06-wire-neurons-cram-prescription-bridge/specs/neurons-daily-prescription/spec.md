## ADDED Requirements

### Requirement: Prescription progress SHALL be credited and surfaced from any answer entry point, including 考前猜題 practice

The system SHALL credit a frozen-snapshot repair or breadth question when it is answered from ANY quiz entry point — 答題 / 錯題出征 / 模考 / **考前猜題 practice mode** — not only via the 開始今日處方 CTA. Practice mode's "no progression" contract (grants no XP, gacha draw, or game streak) SHALL NOT suppress prescription crediting: correctly answering a repair-pool question consolidates that connection regardless of where it was answered — a **deliberate, documented exception scoped to prescription crediting only** ("answering correctly IS repairing the connection, regardless of entry point"). The answer verdict SHALL surface each credit at the moment it happens: a repair consolidation as 「連結已固化」, a first breadth-family answer as a 「新連結已開發」-class note, and the answer that completes both lines as a non-punishing 「今日處方箋完成」note. Crediting SHALL remain dedup / anti-cheat safe via the existing per-question write-once keys (no double-count, no target change, no snapshot mutation, no new question injection).

#### Scenario: Cram-practice answer to a repair-snapshot question consolidates and surfaces
- **WHEN** the player answers a question in today's `wrongEligibleQuestionIds` correctly from 考前猜題 practice mode
- **THEN** its repair key SHALL be set (at most once that day) and the verdict SHALL show the 「連結已固化」note, exactly as if answered from the 開始今日處方 flow

#### Scenario: First breadth answer surfaces a breadth note
- **WHEN** the player answers an in-`breadthFamilyId` snapshot question for the first time today from any entry point
- **THEN** its breadth key SHALL be set and the verdict SHALL surface a 「新連結已開發」-class note for that first credit

#### Scenario: The completing answer surfaces a non-punishing completion note
- **WHEN** an answer from any entry point makes both the repair and breadth lines reach their targets for the first time today
- **THEN** the verdict SHALL surface a 「今日處方箋完成」note, and the day-completion / reward / imprint keys SHALL be written exactly once (idempotent per day)

#### Scenario: Practice crediting grants no economy or game progression
- **WHEN** a prescription line is credited from practice mode
- **THEN** only the prescription line (and its existing completion path) SHALL advance — no XP, no DMN draw, no leaderboard axis, and no game streak SHALL be granted by the practice answer

### Requirement: The 處方箋 card SHALL offer a low-salience exit to 考前猜題

The 今日處方箋 card SHALL surface exactly one low-emphasis link to `/cram` (考前猜題), framed as an optional exam-eve resource (e.g. 「考前？看高頻考點 →」), placed so it does NOT compete with the primary 開始今日處方 CTA. The link SHALL NOT be styled as a task or a line, SHALL NOT carry a badge / count / countdown / streak, and SHALL NOT imply the daily two-line ritual is incomplete without it (the anti-anxiety contract is preserved).

#### Scenario: A low-salience cram link is present and secondary to the CTA
- **WHEN** the expanded 處方箋 card renders
- **THEN** a single low-emphasis link to `/cram` SHALL be shown, visually subordinate to the 開始今日處方 CTA

#### Scenario: The cram link carries no anxiety framing
- **WHEN** the cram link renders
- **THEN** it SHALL NOT show a badge, count, countdown, or any copy implying the daily ritual is incomplete without visiting 考前猜題
