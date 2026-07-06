# neurons-cram-tab

## Purpose

考前猜題 (cram) subtab over the 一階 corpus: per-subject 速看重點 (compressed high-yield tables/kernels traceable to real past questions) + 押題清單 (concept-recurrence ranking, honest raw counts + tier), each drilling to real source questions and bridging into the game via a low-friction practice on-ramp. Fully open (no gate), pixel-themed, mobile-first, honesty-constrained.

## Requirements

### Requirement: The 題庫 tab SHALL become a subtab group with 題庫 and 考前猜題

The system SHALL present the 題庫 top-nav entry as a subtab group containing `/bank` (existing question bank, behavior unchanged) and `/cram` (考前猜題), reusing the app's existing subtab pattern. The 題庫 top-nav entry SHALL stay highlighted while either subtab is active.

#### Scenario: Both subtabs highlight 題庫
- **WHEN** the user is on `/bank` or on `/cram`
- **THEN** the top-nav 題庫 entry SHALL render as active, and the subtab bar SHALL show 題庫 and 考前猜題

#### Scenario: Direct URL and reload work in production
- **WHEN** the user opens `/cram` directly or reloads (F5) on `/cram` on the production host
- **THEN** the 考前猜題 view SHALL render (not a 404 / not a redirect to home)

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

### Requirement: 押題 items SHALL be honest — raw counts and tiers only, no guarantee or precision claims

Each 押題 item SHALL display only raw recurrence counts (e.g. 「23 次考試出現 N 次」) and its tier label. The feature MUST NOT display normalized scores, hit-rate percentages, or any guarantee/prediction-certainty language. This guarantee/prediction-language ban applies to **every surfaced 考前猜題 string, including 速看 section headings** — not only 押題 item fields — and the build-time cram validator SHALL enforce it on 速看 block headings (block body text, which may legitimately contain figures such as a sensitivity of 100%, is out of scope of the heading lint).

#### Scenario: Raw counts, no fabricated precision
- **WHEN** a 押題 item is rendered
- **THEN** it SHALL show its raw sitting count and tier, AND MUST NOT show a normalized 0–1 score, a 命中率%, or wording such as 保證/必中/100%/今年一定考

#### Scenario: 速看 headings carry no guarantee wording
- **WHEN** a 速看重點 block heading is authored and built into `cram.json`
- **THEN** it MUST NOT contain 保證/必中/100%/今年一定考 wording (e.g. 必中考古 is disallowed; 高頻考古 is compliant), AND the cram validator SHALL fail the build if any 速看 heading contains a banned phrase

#### Scenario: Cooling topics are labelled
- **WHEN** a 押題 concept is 經典但降溫
- **THEN** its cooling status SHALL be shown, not hidden

### Requirement: The 考前猜題 view SHALL carry a persistent methodology disclaimer and version stamp

`/cram` SHALL show a persistent one-line disclaimer plus an expandable methodology note and a data-window version stamp, always in-view (not a dismissible modal).

#### Scenario: Disclaimer and version stamp always present
- **WHEN** the 考前猜題 view is shown
- **THEN** a persistent disclaimer stating the ranking is frequency-based (頻率高 ≠ 今年一定考), an expandable "怎麼算的" methodology note, and a 「統計至 115-1」 version stamp SHALL all be present

### Requirement: cram content units SHALL be self-contained; 押題 items SHALL drill down to real source questions via an evidence-first drawer

Each cram line (速看 block row or 押題 item) SHALL be fully readable without expanding any source. **押題 items** SHALL carry `sourceQuestionIds` (the questions tagged with that concept) and expose a low-emphasis count chip that opens an **evidence-first drawer**: the concept's raw count + tier plus a recent-first, capped read-only mini-list of its real source questions (`QuestionReviewCard`), preserving passive source-verification. Selecting a question SHALL open its existing read-only view inline; the source PDF panel SHALL open only on the explicit 看原始詳解 PDF control, never automatically. **速看 blocks** SHALL be self-contained and are NOT required to carry per-row source links (they are compressed, deliberately standalone).

#### Scenario: Line stands alone
- **WHEN** a user reads a cram line without expanding sources
- **THEN** the line SHALL convey its full takeaway with no dependency on the source list

#### Scenario: 押題 count chip opens an evidence-first drawer
- **WHEN** the user taps a 押題 item's count chip
- **THEN** an evidence drawer SHALL show the concept's raw count + tier and a recent-first, capped read-only mini-list of its source questions, and selecting one SHALL open the existing read-only question view for that real question id

#### Scenario: PDF panel never auto-opens on mobile
- **WHEN** a user expands any cram accordion, 押題 drawer, or source list
- **THEN** the docked/full-screen PDF panel MUST NOT open automatically; it SHALL open only when the user taps the explicit 看原始詳解 PDF control

#### Scenario: Broken 押題 source links are impossible at build
- **WHEN** the cram data is built
- **THEN** a validator SHALL verify every 押題 `sourceQuestionIds` value exists in the built `questions.json`, failing the build otherwise

### Requirement: 考前猜題 SHALL bridge into the game via a low-friction practice on-ramp, without gating or manipulation

The 押題 evidence drawer SHALL embed a low-friction primary CTA (「▶ 答 1 題看看」) that opens the existing quiz in **practice mode** over that concept's questions; each selected subject's panel SHALL offer exactly ONE section-level 「用本章高頻概念練幾題」 CTA (not a per-row CTA), positioned above the 考古清單. Practice mode SHALL NOT grant XP, gacha rolls, or game-streak progression; the sole deliberate exception is that answering credits the 今日處方箋 (daily prescription) 修煉 when the answered question is in today's frozen plan snapshot (per `wire-neurons-cram-prescription-bridge`), and practice SHALL record wrong answers to the 錯題本 (feeding the existing 出征 loop). To make that prescription-crediting payoff reliably reachable, when a cram practice pool is built the system SHALL prioritize questions that are in today's prescription snapshot (repair ∪ breadth eligible ids) to the front of the served order, without altering the snapshot, targets, or injecting any question; when today has no prescription plan yet, the pool SHALL fall back to its normal shuffled order (no behavior change). Answering SHALL require no sign-in; sign-in prompts MAY appear only at a save moment (persisting 錯題本 / 出征 / collection), framed as saving progress, never as unlocking content. The feature MUST NOT: require registration before reading sources or answering; hide cram highlights behind game progress; show hit-rate / guarantee language; push gacha / leaderboard before the user has engaged; use streak / countdown / rank pressure to create anxiety; attach a CTA to every highlight row; or shame wrong answers.

#### Scenario: One-tap practice from a 押題 concept
- **WHEN** the user taps 「▶ 答 1 題看看」 in a 押題 evidence drawer
- **THEN** the quiz SHALL open directly in practice mode on that concept's questions with a single-question probe, requiring no sign-in, no difficulty/count prompt, and no full-screen promo modal first

#### Scenario: Wrong answer bridges to 出征 without shaming
- **WHEN** the user answers a cram practice question incorrectly
- **THEN** the wrong question SHALL be recorded to the 錯題本 (per existing practice-mode behavior), and any post-answer prompt SHALL frame it as a repairable synapse to fix via 出征, shown only after the answer, never before

#### Scenario: Cram practice credits the daily prescription but grants no game progression
- **WHEN** the user answers a cram practice question that is in today's prescription plan snapshot
- **THEN** the answer SHALL credit the 今日處方箋 修煉 (surfacing the existing 「🩹 連結已固化 / 🔍 新連結已開發」 verdict note) AND SHALL NOT grant XP, gacha rolls, or game-streak progression

#### Scenario: Prescription-snapshot questions are served first, snapshot untouched
- **WHEN** a cram practice pool is built and today's prescription plan exists
- **THEN** questions that are in today's prescription snapshot (repair ∪ breadth eligible ids) SHALL be ordered before the rest of the pool, and the prescription snapshot, targets, and question set MUST NOT be modified or extended

#### Scenario: No plan yet falls back to normal order
- **WHEN** a cram practice pool is built and today has no prescription plan
- **THEN** the pool SHALL use its normal shuffled order with no prioritization and no behavior change

#### Scenario: No gate, no manipulation
- **WHEN** any cram → game on-ramp is presented
- **THEN** it MUST NOT gate reading or answering behind sign-in, MUST NOT use hit-rate / guarantee language, and MUST NOT inject streak / countdown / rank pressure

### Requirement: 考前猜題 SHALL offer one-click download of a pre-generated A4 PDF sharing one source with the in-app view

The view SHALL provide a one-click download of a pre-generated A4 PDF. The PDF and the in-app 速看 content SHALL share a single source of truth — both derive from the same committed 速看 fragments — so they do not diverge in content. The PDF SHALL be a committed, served static asset (never produced by the browser print dialog or client-side at runtime).

#### Scenario: One-click direct download
- **WHEN** the user taps the download control
- **THEN** the pre-generated A4 PDF SHALL download directly (not via the browser print dialog, not via client-side runtime generation)

#### Scenario: PDF and in-app 速看 share one source
- **WHEN** the 速看 content is authored
- **THEN** both the in-app 速看 view (`cram.json`) and the downloadable PDF SHALL derive from the same committed 速看 fragments, so their content does not diverge

### Requirement: 考前猜題 SHALL be fully open with no entitlement gate

All 考前猜題 content — 速看重點, 押題清單, source-question links, 詳解, the `cram.json` static asset, and the A4 PDF download — SHALL be accessible to all users without any sign-in, leaderboard, or game-progression requirement.

#### Scenario: Anonymous user has full access including PDF download
- **WHEN** a signed-out user opens `/cram`
- **THEN** all 速看重點 / 押題清單 / source links / 詳解 SHALL be readable AND the A4 PDF download SHALL work, with no sign-in, leaderboard, or level-unlock prompt

### Requirement: 考前猜題 SHALL continue the pixel theme

The view SHALL use the app's pixel theme tokens (cream/brown pixel panels, gold accent, Cubic 11 pixel font for headings) with the legible font stack for exam-text content. It MAY additionally apply per-subject NT-branch accent colors.

#### Scenario: Pixel-themed rendering
- **WHEN** the 考前猜題 view renders
- **THEN** it SHALL use the theme's pixel panel/heading styling, with exam-content text using the legible font stack

### Requirement: 考古清單 SHALL surface a positive, denominator-free coverage imprint from the player's own answer history

Each 考古 (recurrence-ranked concept) item SHALL derive a coverage state purely from `questionHistory`: an item is **covered** when at least one of its `sourceQuestionIds` has a history row whose latest result is correct (`lastResult === 'correct'`). A covered item SHALL render a single low-emphasis positive chip (「✓ 已固化過」); an uncovered item SHALL render nothing for coverage. The coverage indicator MUST be positive-only and MUST NOT display any denominator, count, percentage, ratio, remaining-gap placeholder, or gray "not-yet" slot. Coverage SHALL be a live-derived view (no new persisted field, no meta key, no write path) and MUST NOT introduce any prediction or guarantee language — it reflects only what the player has already answered correctly.

#### Scenario: Covered concept shows a positive chip
- **WHEN** a 考古 item has ≥1 `sourceQuestionId` whose `questionHistory` row has `lastResult === 'correct'`
- **THEN** the item SHALL render a single 「✓ 已固化過」 chip, with no percentage, count, denominator, or remaining-gap text

#### Scenario: Uncovered concept renders nothing
- **WHEN** a 考古 item has zero `sourceQuestionIds` currently answered correctly
- **THEN** the item SHALL render no coverage chip and no gray placeholder / gap slot

#### Scenario: Coverage is derived, not stored
- **WHEN** the coverage state is computed
- **THEN** it SHALL be derived live from the existing `questionHistory` (via the existing reactive subscription), introducing no new Dexie schema field, no meta key, and no new answer-time write path
