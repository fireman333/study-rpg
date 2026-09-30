## ADDED Requirements

### Requirement: Card source of truth is a reviewed, version-controlled file with stable card ids

The neurons cloze card corpus SHALL have a single source of truth: reviewed card files under `packages/content-neurons-tw/src/handout/_cloze/`, one file per handout subject (`<subjectId>.json`), committed to version control.

The build SHALL NOT generate, re-select, or re-number cards. It SHALL only validate the source and derive the shipped artifact from it.

Each card SHALL carry a `cardId` that:
- is unique across the whole corpus;
- is assigned once, when the card is admitted;
- is NOT derived from the card's text, so editing the anchored sentence does not change the card's identity.

Each card SHALL be anchored by `anchorId` = `<subjectId>::<leafId>`, where `leafId` is the FIRST token of the `data-leaf-ids` attribute of the handout topic (`.hdt-topic`) that holds the card. A topic without `data-leaf-ids` SHALL NOT hold cards. A topic ordinal or line number SHALL NOT be stored as an anchor.

Generator output SHALL live outside `_cloze/` and SHALL NOT be read by the build.

A source file SHALL be an object `{version: 1, cards: [...]}`. A card, or a file, whose required fields are missing or malformed SHALL be rejected with the reason `schema`. Malformed means any of:
- a file that is not an object, or whose `version` is not 1, or whose `cards` is not an array;
- a card missing `tierAtAdmission`;
- not exactly one `answer` mask;
- a role other than `answer`, `gloss`, or `hint`;
- more than 3 `hint` masks;
- a `prefix` or `suffix` longer than 12 characters.

#### Scenario: Two cards share a cardId
- **WHEN** two cards anywhere in `_cloze/` carry the same `cardId`
- **THEN** the build SHALL fail and name both source files

#### Scenario: Anchor does not resolve to a topic
- **WHEN** a card's `anchorId` does not equal `<subjectId>::<first data-leaf-ids token>` of any topic in that subject's handout
- **THEN** the build SHALL fail with the reason `unknown-anchor` and name the card

#### Scenario: Rewording the anchored sentence keeps the card's identity
- **WHEN** a maintainer edits the anchored bullet and re-anchors the card's masks to the new wording
- **THEN** the card's `cardId` SHALL be unchanged, and its `sentenceHash` in the shipped artifact SHALL change

### Requirement: Masks are verbatim and resolve exactly once within one bullet of the reader's text

Each card SHALL have one or more masks, each with `exact`, `prefix`, `suffix`, and a role of `answer`, `gloss`, or `hint`.

A **bullet** is the text of one `li` that is a direct child of a `ul.hdt-must` inside the topic, excluding the text of any nested list. Text in `p.hdt-teach`, a table, or a heading is not in a bullet; a mask resolving there SHALL be rejected with the reason `not-in-bullet`.

Every mask SHALL satisfy all of the following:
- `prefix + exact + suffix` occurs exactly once within the topic's plain text;
- that occurrence lies within a single bullet;
- all masks of one card lie within the same bullet.

The plain text SHALL be what the handout reader displays inside each bullet: the DOM `textContent` of the `li` (nested lists excluded) of the shipped handout HTML, produced by one shared, node-free transformation that parses HTML according to the HTML standard. It SHALL include the text of `<cite>` and of emoji characters, SHALL decode character entities, and SHALL NOT include markup. Runtime nodes the reader adds outside bullets (such as per-topic buttons) are not part of any bullet.

#### Scenario: Mask text is paraphrased
- **WHEN** a mask's `exact` does not occur in the topic's plain text
- **THEN** the build SHALL fail with the reason `unresolved`

#### Scenario: Mask matches twice
- **WHEN** `prefix + exact + suffix` occurs more than once in the topic's plain text
- **THEN** the build SHALL fail with the reason `ambiguous`

#### Scenario: Mask in a teaching paragraph
- **WHEN** a mask resolves inside `p.hdt-teach`
- **THEN** the build SHALL fail with the reason `not-in-bullet`

#### Scenario: Build text and reader text agree
- **WHEN** a pilot subject's shipped handout HTML is rendered by the reader in a browser
- **THEN** every carded bullet's `li` text, excluding nested lists, SHALL equal the card's `bulletText` character for character

#### Scenario: Character entity in a bullet
- **WHEN** a bullet's source contains `&lt;`
- **THEN** the bullet's plain text SHALL contain `<`, and a mask matching the decoded text SHALL resolve

### Requirement: Hint masks hide phrases that give the answer away

A card MAY carry up to 3 `hint` masks. A `hint` mask hides a phrase in the same bullet that would let a reader infer the answer without knowing it — a synonym, abbreviation, or code for the answer; an English original or synonym that does NOT immediately follow the answer (one that does is covered by `gloss`); a 「並非／而非 X」 contrast; or a later restatement of the same fact. Hints do not address answers inferable by elimination, by arithmetic, or from the topic heading; the generator SHALL skip such sentences instead. A `hint` mask is not an answer: the card shows it hidden, the reader is not asked to fill it, and it SHALL NOT be graded or highlighted as the card's answer.

Every `hint` mask SHALL obey the same verbatim, unique, same-bullet, and `cite-overlap` rules as other masks. A `hint` longer than 20 characters, or more than 3 `hint` masks, SHALL be rejected with the reason `schema`. A `hint` consisting solely of polarity words or connectives SHALL be rejected with the reason `polarity-only`, because hiding a lone negation can invert what the sentence teaches. The masks of one card SHALL NOT overlap each other; overlapping masks SHALL be rejected with the reason `mask-overlap`.

The masked characters of one card (`answer` + `gloss` + `hint`) SHALL NOT exceed 40% of the bullet's text with `<cite>` text removed; otherwise the card SHALL be rejected with the reason `over-masked`, because a card with most of its sentence hidden no longer teaches the fact in context.

#### Scenario: Contrast phrase hidden
- **WHEN** the answer is `右葉`, the bullet also says `並非左葉`, and the card has a `hint` mask over `並非左葉`
- **THEN** the card SHALL NOT be rejected with the reason `answer-leak` or `mask-overlap`

#### Scenario: Answer repeated elsewhere is hidden
- **WHEN** the answer text occurs a second time in the bullet and that second occurrence is covered by a `hint` mask
- **THEN** the card SHALL NOT be rejected with the reason `answer-leak`

#### Scenario: Lone negation as a hint
- **WHEN** a `hint` mask's `exact` is `非`
- **THEN** the build SHALL fail with the reason `polarity-only`

#### Scenario: Too many or too long hints
- **WHEN** a card has 4 `hint` masks, or one `hint` of 21 characters
- **THEN** the build SHALL fail with the reason `schema`

#### Scenario: Adding a hint changes no identity
- **WHEN** a `hint` mask is added to an existing card
- **THEN** the shipped card SHALL include the `hint` mask with its role, and the card's `cardId`, `bulletText`, and `sentenceHash` SHALL be unchanged

#### Scenario: Too much hidden
- **WHEN** a card's masks cover more than 40% of the bullet text without `<cite>`
- **THEN** the build SHALL fail with the reason `over-masked`

#### Scenario: Overlapping masks
- **WHEN** a `hint` mask overlaps the card's `answer` mask
- **THEN** the build SHALL fail with the reason `mask-overlap`

### Requirement: Card shape is gated by a whitelist

The build SHALL accept a card only if it passes every check below. A rejection SHALL be a build failure, not a silent drop. The card's **visible text** is its bullet with the masks removed.

- **`length`** — the `answer` mask SHALL be 2–20 characters long.
- **`polarity-only`** — the `answer` SHALL NOT consist solely of a polarity word or a connective.
- **`sub-heading`** — the `answer` SHALL NOT be the bullet's leading `<b>` label when that label is followed only by a colon.
- **`answer-leak`** — the answer text SHALL NOT appear again in the card's visible text excluding `<cite>` text, and SHALL NOT equal a `<cite>` year token of that bullet.
- **`cite-overlap`** — no mask's `prefix + exact + suffix` occurrence SHALL overlap the text of a `<cite>` element.
- **`partial-range`** — when the answer is part of a numeric range (`A–B`, `A-B`, `A~B`, `A 至 B`), the answer mask SHALL cover the whole range.
- **`gloss-leak`** — when the answer is followed within two characters by a parenthesised English term, abbreviation, or synonym, that parenthesis SHALL be covered by a `gloss` mask.
- **`example-value`** — the answer SHALL NOT be an example value (a clause beginning with `如` or `例如`, or inside a `由 X 升至 Y` trajectory).
- **`excluded-source`** — the answered bullet's source HTML SHALL NOT contain an `hdt-intl` element or ⚠️.
- **`false-option-only`** — for each linked past-exam question: when the stem is not negated, the answer SHALL NOT occur only in its non-keyed options; when the stem is negated (何者錯誤 / 何者不正確 / 何者為非 / 最不適當 …, whitespace-insensitive), the answer SHALL NOT occur only in its keyed option. When question data is unavailable, a card with linked questions SHALL be rejected.

The build SHALL print imported, rejected (by reason), and total counts, including when it fails.

#### Scenario: Answer is only a negation
- **WHEN** a card's answer mask is `不`
- **THEN** the build SHALL fail with the reason `polarity-only`

#### Scenario: Mask covers a citation year
- **WHEN** a mask's `prefix + exact + suffix` occurrence overlaps the text of the bullet's `<cite>115</cite>`
- **THEN** the build SHALL fail with the reason `cite-overlap`

#### Scenario: International-textbook note bullet
- **WHEN** the answered bullet contains `<span class="hdt-intl">`
- **THEN** the build SHALL fail with the reason `excluded-source`

#### Scenario: Negated stem
- **WHEN** a linked question asks 何者錯誤, and the answer occurs only in that question's keyed option
- **THEN** the build SHALL fail with the reason `false-option-only`

#### Scenario: Counts on success
- **WHEN** every card passes
- **THEN** the build SHALL print imported, rejected, and total counts, where rejected is 0 and imported equals total

### Requirement: Per-topic card count is capped by recurrence tier

Each topic SHALL have at most `maxCards` cards. The topic's tier SHALL be the highest recurrence tier among its `data-leaf-ids`, looked up in `concept-recurrence.json` by `(subjectId, leafId)` (a leafId is not unique across subjects). Every leaf of a carded topic SHALL have a recurrence entry. The mapping SHALL be closed and SHALL cover every tier the recurrence build can emit: 常青必掃 5, 近年新寵 4, 穩定考點 4, 經典但降溫 4, low-yield 3. Tier order, highest first: 常青必掃, 近年新寵, 穩定考點, 經典但降溫, low-yield.

Each card SHALL record `tierAtAdmission`, the topic tier when it was admitted. Admission SHALL enforce the cap of the current tier only against cards not already in `_cloze/`; a re-admitted existing card (same `cardId`) SHALL keep its recorded `tierAtAdmission` and SHALL NOT be dropped by the cap. The build SHALL enforce the cap of the highest `tierAtAdmission` among the topic's cards, so a later recurrence rebuild that lowers the tier does not fail the build; the build SHALL list such tier drift in the report.

`maxCards` is a ceiling, not a target; the generator SHALL NOT fill a topic up to its ceiling from low-signal sentences.

#### Scenario: Topic over its ceiling
- **WHEN** a topic's cards all record `tierAtAdmission` `low-yield` and the topic has 4 cards
- **THEN** the build SHALL fail with the reason `over-cap`

#### Scenario: Tier drops after an exam ingest
- **WHEN** a topic admitted at 常青必掃 with 5 cards is now 穩定考點 in `concept-recurrence.json`
- **THEN** the build SHALL pass and the report SHALL list the drift

#### Scenario: Re-admission after tier drift
- **WHEN** a topic has 5 promoted cards admitted at 常青必掃, its current tier is 穩定考點, and admission is re-run after a handout fix
- **THEN** the 5 existing cards SHALL keep `tierAtAdmission` 常青必掃 and remain, and no new card SHALL be admitted to that topic

#### Scenario: Unmapped or missing tier
- **WHEN** a leaf of a carded topic has no recurrence entry for that subject, or a tier (current or `tierAtAdmission`) is not in the mapping
- **THEN** the build SHALL fail with the reason `unmapped-tier` rather than fall back to a default

### Requirement: Shipped artifact is written only after every cloze gate passes

The build SHALL write `handout-cloze.json` only after every existing handout gate and every cloze check has passed. When any cloze check fails, the build SHALL exit non-zero and SHALL NOT leave behind a `handout-cloze.json`. When `_cloze/` is absent or empty, the build SHALL write an artifact with zero cards.

Each shipped card SHALL include `cardId`, `anchorId`, `masks`, the recorded selection signals (`marks`, `linkedQuestionIds`, `kind`, `signalScore`, `signalVersion`), `tierAtAdmission`, `bulletText` (the answer bullet's plain text), `citeRanges` (the `<cite>` text ranges within `bulletText`), and `sentenceHash` (djb2 of `bulletText` with the `citeRanges` removed, so adding a new sitting year to a bullet does not change the card's hash). The build SHALL check, before writing, that `sentenceHash` equals the djb2 of `bulletText` minus `citeRanges`, and that every mask's `prefix + exact + suffix` occurs in `bulletText`.

#### Scenario: A gate fails
- **WHEN** any card fails any cloze check
- **THEN** the build SHALL exit non-zero, and `handout-cloze.json` SHALL NOT exist from that run

#### Scenario: Editing text outside the carded bullet
- **WHEN** a maintainer edits text outside the bullet that holds a card's answer mask
- **THEN** that card's `sentenceHash` SHALL be unchanged

#### Scenario: A new sitting year is cited
- **WHEN** `<cite>113</cite>` on a carded bullet becomes `<cite>113/116</cite>`
- **THEN** that card's `sentenceHash` SHALL be unchanged and its `bulletText` SHALL change

#### Scenario: Shipped text and hash agree
- **WHEN** the build writes `handout-cloze.json`
- **THEN** for every card, djb2 of `bulletText` minus `citeRanges` SHALL equal `sentenceHash`, AND every mask's `prefix + exact + suffix` SHALL occur in `bulletText`

### Requirement: Duplicates and numeric contradictions are reported, and reported sentences are not admitted

The build SHALL produce a report listing cards across topics whose answers are equal and whose sentences are highly similar, and places in one subject where the same `<b>` subject is given different percentages. The report SHALL NOT fail the build and SHALL state that contradiction detection is heuristic.

The cloze layer SHALL NOT resolve a contradiction by picking one value. The handout SHALL be corrected; until it is corrected or the owner records the listing as not a contradiction, admission SHALL refuse to promote a card whose answer bullet is listed.

#### Scenario: Conflicting values in one subject
- **WHEN** one subject states the same `<b>` subject as `43%` in one bullet and `45–50%` in another
- **THEN** the report SHALL list both locations, and admission SHALL refuse cards on either bullet

#### Scenario: Owner acknowledges a false positive
- **WHEN** the report lists two different facts as a contradiction and the owner records that listing as not a contradiction
- **THEN** admission SHALL promote cards on those bullets

### Requirement: Pilot publication gate

The pilot SHALL cover the 33 topics of 胚胎學 (12) and 寄生蟲學 (21) that carry `data-leaf-ids`; topic coverage SHALL be reported over those 33.

Every pilot card that passed the gates SHALL be graded before promotion: good, ordinary, or bad, with any medical error recorded. A second grading pass SHALL compare each card with its linked past-exam questions and record `tested`, `related`, `not-tested`, `conflicts`, or `no-question`; a card with a medical error or `conflicts` SHALL be graded bad. Only a grades file whose grader is the owner SHALL allow promotion; the owner MAY adopt agent grades, and the file SHALL then record that they were adopted.

A handout error found during grading SHALL be verified by an independent reviewer against the linked question's official answer before the handout is changed. When the official answer differs from current textbooks, the handout SHALL keep the exam answer and add an `hdt-intl` note rather than adopt the textbook version.

The pilot SHALL pass only if, with the graded cards as the denominator, good cards are at least 70%, bad cards are at most 10%, and medical errors are 0. Fan-out to other subjects SHALL NOT begin until the pilot passes. This requirement is process-only: no build check enforces it except that promotion needs owner grades.

#### Scenario: Quality below threshold
- **WHEN** 65% of graded pilot cards are good
- **THEN** the pilot SHALL NOT pass, and no other subject SHALL receive cards

#### Scenario: One medical error
- **WHEN** one pilot card is graded as medically wrong
- **THEN** the pilot SHALL NOT pass, the handout sentence SHALL be corrected after independent verification, and the affected cards SHALL be re-anchored or dropped before re-grading

#### Scenario: Grader flags an official exam answer as outdated
- **WHEN** a grader reports a handout sentence as wrong, but the sentence matches the linked question's official answer
- **THEN** the handout sentence SHALL be kept and annotated with an `hdt-intl` note, not rewritten
