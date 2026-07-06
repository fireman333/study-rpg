## MODIFIED Requirements

### Requirement: 考前猜題 SHALL present per-subject 速看重點 and 押題清單, organized by paper, with progressive disclosure

`/cram` SHALL organize content by subject within two regions (醫學一 / 醫學二), using a single-select subject **filter-chip row** (chips grouped by paper). Selecting a subject chip SHALL show only that subject's panel; there SHALL be no expand/collapse accordion and no sticky quick-jump anchor row. On entry with no prior selection, the first subject SHALL be auto-selected so the view always shows content. Within the selected subject's panel, the 速看重點 blocks SHALL render first and directly (no "展開速看重點" toggle — content is already scoped to one subject), followed by the section practice CTA and then the 考古清單. The user-facing label for the 押題 (recurrence-ranked concept) list SHALL read 考古清單; the internal `cram.json` `push` field name is unchanged.

#### Scenario: Single-select subject filter
- **WHEN** the user taps a subject filter chip
- **THEN** only that subject's panel SHALL be shown, with no accordion expand/collapse and no sticky quick-jump row

#### Scenario: 速看重點 first and shown directly
- **WHEN** a subject is selected
- **THEN** its 速看重點 blocks SHALL render first and be shown directly (no collapse toggle), and its 考古清單 SHALL appear after the section practice CTA

#### Scenario: First subject selected on entry
- **WHEN** the 考前猜題 view first renders with no prior subject selection
- **THEN** the first subject SHALL be auto-selected so content is visible without any tap

#### Scenario: Mobile no horizontal scroll
- **WHEN** viewed on a phone-width (≈390px) viewport
- **THEN** the subject filter chips SHALL wrap, and no content SHALL cause horizontal page scroll

### Requirement: 考前猜題 SHALL bridge into the game via a low-friction practice on-ramp, without gating or manipulation

The 押題 evidence drawer SHALL embed a low-friction primary CTA (「▶ 答 1 題看看」) that opens the existing quiz in **practice mode** over that concept's questions; each selected subject's panel SHALL offer exactly ONE section-level 「用本章高頻概念練 N 題」 CTA (not a per-row CTA), positioned above the 考古清單. Practice mode SHALL NOT affect progression but SHALL record wrong answers to the 錯題本 (feeding the existing 出征 loop). Answering SHALL require no sign-in; sign-in prompts MAY appear only at a save moment (persisting 錯題本 / 出征 / collection), framed as saving progress, never as unlocking content. The feature MUST NOT: require registration before reading sources or answering; hide cram highlights behind game progress; show hit-rate / guarantee language; push gacha / leaderboard before the user has engaged; use streak / countdown / rank pressure to create anxiety; attach a CTA to every highlight row; or shame wrong answers.

#### Scenario: One-tap practice from a 押題 concept
- **WHEN** the user taps 「▶ 答 1 題看看」 in a 押題 evidence drawer
- **THEN** the quiz SHALL open directly in practice mode on that concept's questions with a single-question probe, requiring no sign-in, no difficulty/count prompt, and no full-screen promo modal first

#### Scenario: Wrong answer bridges to 出征 without shaming
- **WHEN** the user answers a cram practice question incorrectly
- **THEN** the wrong question SHALL be recorded to the 錯題本 (per existing practice-mode behavior), and any post-answer prompt SHALL frame it as a repairable synapse to fix via 出征, shown only after the answer, never before

#### Scenario: No gate, no manipulation
- **WHEN** any cram → game on-ramp is presented
- **THEN** it MUST NOT gate reading or answering behind sign-in, MUST NOT use hit-rate / guarantee language, and MUST NOT inject streak / countdown / rank pressure
