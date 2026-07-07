# neurons-simplified-explanations Specification

## Purpose

Defines the per-option 簡答 (short answer) layer for neurons 詳解: an offline-generated, deterministically-validated, QA-gated sidecar that condenses each question's authoritative 詳解 into one short plain-text rationale per option (marking the correct one), then build-merges it additively onto `Question.optionExplanations`. Replaces the prior inline prose/table/figure 詳解 rendering across the three answer surfaces (QuestionBankPage, QuizModal, MockExamRunner) with this per-option list, while the full reconstructed prose/tables/figures stay reachable via the authoritative 「看原始詳解 PDF」 control. Generation is resumable, re-runnable as deltas, and never invents rationale the source 詳解 does not support; QA failures are quarantined for manual review and ship nothing.

## Requirements

### Requirement: Per-option 簡答 SHALL cover every option and be derived only from the authoritative 詳解

For each question that receives a 簡答, the generated `optionExplanations` SHALL contain one short text entry for EVERY option key present in the question's `options` (A/B/C/D…), and no entry for any key not in `options`. Each entry SHALL be derived only from that question's own `stem`, `options`, `answer`, and `explanation` — it is a condensing of the existing authoritative 詳解, not net-new knowledge. Entries SHALL be plain text only (no tables, figures, markdown, or references to non-existent options). Each entry SHALL be between 12 and 60 CJK characters.

#### Scenario: Every option is covered
- **WHEN** a four-option question is given a 簡答
- **THEN** `optionExplanations` SHALL have exactly the keys `{A,B,C,D}` (matching `options`)
- **AND** each value SHALL be non-empty plain text of 12–60 CJK characters

#### Scenario: No extra or missing keys
- **WHEN** a question's `options` keys are `{A,B,C,D,E}`
- **THEN** `optionExplanations` SHALL have exactly those five keys and no others

### Requirement: 簡答 framing SHALL match the official answer

The entry for the option equal to the question's `answer` SHALL explain why that option is correct. The entry for every other option SHALL explain why that option is wrong, as supported by the 詳解.

#### Scenario: Correct option states why correct
- **WHEN** `answer` is `C`
- **THEN** the `C` entry SHALL frame `C` as the correct choice and the `A`/`B`/`D` entries SHALL frame those as incorrect

### Requirement: The pipeline SHALL NOT invent rationale the 詳解 does not support

When the source `explanation` does not justify why a particular wrong option is wrong, the entry for that option SHALL be the literal string `詳解未明確說明此選項錯因` rather than an invented medical reason.

#### Scenario: Unsupported wrong option
- **WHEN** the 詳解 explains only why the correct option is correct and says nothing about wrong option `B`
- **THEN** the `B` entry SHALL be `詳解未明確說明此選項錯因`

### Requirement: Disputed and multi-answer questions SHALL NOT assert a single correct answer

For a question with `disputed === true` or `acceptedAnswers.length > 1`, no entry SHALL assert that a single option is the uniquely correct answer; the framing SHALL reflect the dispute / multiple accepted answers.

#### Scenario: 送分 question
- **WHEN** a question has `disputed === true`
- **THEN** none of its `optionExplanations` entries SHALL claim a single uniquely-correct option

### Requirement: 簡答 SHALL be merged additively at build into `Question.optionExplanations`

The content build SHALL merge the QA-passed 簡答 sidecar into each baked question as `optionExplanations?: Record<string,string>`. The merge SHALL NOT alter `id`, `answer`, `stem`, `options`, or `explanation`. A question with no sidecar entry SHALL be baked without the field. The mechanism SHALL mirror the existing build-injected explanation-enrichment sidecars (figures / table-images) and SHALL require no per-user storage (no Dexie/R2) change.

#### Scenario: Field injected without touching authoritative data
- **WHEN** the build merges a sidecar entry for question `Q`
- **THEN** `Q.optionExplanations` SHALL equal the sidecar's `optionExplanations`
- **AND** `Q.id`, `Q.answer`, `Q.options`, `Q.stem`, and `Q.explanation` SHALL be byte-identical to their pre-merge values

#### Scenario: Question without a 簡答
- **WHEN** no sidecar entry exists for question `Q`
- **THEN** baked `Q` SHALL NOT carry an `optionExplanations` field

### Requirement: A deterministic validator SHALL gate every generated 簡答

Before any generated 簡答 is written to the shipped sidecar, a deterministic (non-LLM) validator SHALL verify: the entry key-set exactly equals the question's `options` key-set; the correct-answer key is present; every entry is 12–60 CJK characters; no entry is empty or contains markdown/tables/HTML; and the recorded `sourceHash` matches the question's current content hash. An entry failing any check SHALL NOT be shipped.

#### Scenario: Key mismatch rejected
- **WHEN** a generated 簡答 omits the `D` entry for a four-option question
- **THEN** the validator SHALL reject it and it SHALL NOT appear in the shipped sidecar

#### Scenario: Over-length entry rejected
- **WHEN** a generated entry exceeds 60 CJK characters
- **THEN** the validator SHALL reject it for regeneration

### Requirement: QA-failed questions SHALL be excluded from the shipped sidecar and recorded for manual review

A question whose 簡答 fails the deterministic validator or the LLM QA after the bounded retries SHALL be excluded from `option-explanations.generated.json` and recorded in `option-explanations.manual-review.json`. The build SHALL treat such a question as having no 簡答 (renders nothing inline), never shipping an unverified entry.

#### Scenario: Persistent failure goes to manual review
- **WHEN** a question's 簡答 still fails QA after the maximum retries
- **THEN** it SHALL be written to `option-explanations.manual-review.json`
- **AND** SHALL NOT be present in the shipped sidecar

### Requirement: Generation SHALL be resumable and re-runnable as deltas

Each generated entry SHALL record a `sourceHash` over the question's content (`stem`, `options`, `answer`, `acceptedAnswers`, `disputed`, normalized `explanation`) and the `promptVersion`. A re-run SHALL skip a question whose `sourceHash` is unchanged and whose entry passed QA, and SHALL regenerate a question whose content hash changed, whose entry is missing an option key or failed QA, or whose `promptVersion` was bumped.

#### Scenario: Unchanged question skipped on re-run
- **WHEN** a re-run encounters a question whose `sourceHash` matches a QA-passed entry
- **THEN** that question SHALL be skipped (not re-generated)

#### Scenario: Edited 詳解 regenerated
- **WHEN** a question's `explanation` changes so its `sourceHash` differs from the stored entry
- **THEN** that question's 簡答 SHALL be regenerated

### Requirement: The content build SHALL report 簡答 merge counts (No-Silent-Errors)

The content build SHALL print the number of questions merged with a 簡答, the number skipped (no sidecar entry / manual-review), and the corpus total, so a silent under-merge is detectable.

#### Scenario: Counts printed at build
- **WHEN** the content build merges the 簡答 sidecar
- **THEN** it SHALL log merged / skipped / total counts

### Requirement: The inline display SHALL render only the per-option 簡答 list, marking the correct option

When a question carries `optionExplanations` and the inline-explanation display is enabled, the three answer surfaces (QuestionBankPage, QuizModal, MockExamRunner) SHALL render an inline list of one row per option in the form `(<key>) <簡答>`, and SHALL NOT render the prose/table 詳解 inline. The row for the correct option SHALL be visually distinguished. The 「看原始詳解 PDF」 authoritative-source control SHALL remain available alongside the list.

#### Scenario: Per-option list shown on an answered question
- **WHEN** a question with `optionExplanations` `{A,B,C,D}` is answered on any of the three surfaces
- **THEN** the surface SHALL show four rows `(A) …` `(B) …` `(C) …` `(D) …`
- **AND** SHALL NOT show the flat prose/table 詳解 inline
- **AND** the correct option's row SHALL be visually marked

### Requirement: A question without 簡答 SHALL render nothing inline

When a question has no `optionExplanations`, the three surfaces SHALL render no inline explanation content (matching the prior hidden-詳解 behavior); only the 正解 and the 「看原始詳解 PDF」 control are shown.

#### Scenario: No regression for un-generated questions
- **WHEN** an answered question has no `optionExplanations`
- **THEN** no inline explanation list or prose SHALL be rendered

### Requirement: 簡答 MAY be generated from richer sources when the text 詳解 is insufficient

When a question's text `explanation` is insufficient to produce a faithful per-option 簡答 (it failed the deterministic validator or QA in the initial text run), the 簡答 MAY be generated from a richer source: the original 詳解 PDF page (read by a vision model) for questions that have a PDF page mapping, or a strong text regeneration. Every generated 簡答 — regardless of source — SHALL still satisfy the existing per-option contract (every option covered; correct = why right, others = why wrong or the sentinel; 8–80 CJK chars; plain text; disputed not single-answer) and SHALL pass the same deterministic validator and QA gate before shipping. A 簡答 derived from the PDF page SHALL use only the region for that question; if that region is absent or unclear the generator SHALL decline rather than borrow another question's 詳解.

#### Scenario: A QA-failed question is regenerated from its 詳解 PDF page
- **WHEN** a question whose text-run 簡答 failed QA has a PDF page mapping
- **THEN** its 簡答 MAY be regenerated from the rendered 詳解 PDF page by a vision model
- **AND** the result SHALL pass the same deterministic validator + QA gate before being shipped

#### Scenario: A question without a usable source stays unshipped
- **WHEN** no source (text / PDF page / strong-regen) yields a 簡答 that passes the validator + QA after the bounded retries
- **THEN** the question SHALL remain in `manual-review.json` with no shipped 簡答 (no-簡答 over wrong-簡答)

### Requirement: Each generated 簡答 SHALL record its generation source

Each entry in the shipped sidecar SHALL record how it was generated via a `source` field — such as `text` (the original text-詳解 run), `text-compress`, `pdf-page-vision`, `text-strong-regen`, or a manual fix during a corpus-driven re-sync — plus the model used (and, for `pdf-page-vision`, the source PDF file, page, and render scale) — so a re-run or audit knows the provenance of every 簡答.

#### Scenario: Provenance recorded for a PDF-sourced 簡答
- **WHEN** a 簡答 is generated from a 詳解 PDF page
- **THEN** its sidecar entry SHALL record `source: 'pdf-page-vision'`, the model, and the PDF file + page it was read from

### Requirement: Wrong answers SHALL actively replay the chosen distractor's explanation and the correct option's key

When the player answers a question incorrectly, the QuizModal reveal SHALL actively surface, without requiring the player to expand the passive「簡答」disclosure, two pieces sourced from the existing per-option `optionExplanations`: (1) the explanation of the **option the player chose** framed as the misconception ("你選了 X → …"), and (2) the explanation / key of the **correct option** ("正解 Y → …"). This error-cause replay SHALL render only after an incorrect answer (a correct answer SHALL NOT trigger it). When `optionExplanations` for the chosen or correct option is absent, that piece SHALL degrade gracefully (omit it) rather than render an empty block.

#### Scenario: Wrong answer surfaces chosen-vs-correct replay

- **WHEN** the player answers a question incorrectly and the reveal renders
- **THEN** the QuizModal SHALL show the chosen wrong option's `optionExplanation` as the misconception AND the correct option's explanation/key
- **AND** this SHALL be visible without expanding the passive「簡答」disclosure

#### Scenario: Correct answer does not trigger error-cause replay

- **WHEN** the player answers correctly
- **THEN** the error-cause replay block SHALL NOT render

#### Scenario: Missing option explanation degrades gracefully

- **GIVEN** a question whose chosen option has no `optionExplanation`
- **WHEN** the wrong-answer reveal renders
- **THEN** the missing piece SHALL be omitted with no empty placeholder block

### Requirement: Error-cause replay SHALL offer an add-to-quick-review action

The error-cause replay SHALL present a「加入快速複習」CTA that enqueues the just-missed question into a **transient device-local quick-review queue** (in-memory / `localStorage`, NOT a new synced Dexie table and NOT a schema bump). The next quick-review launch (the existing ≤5-question review mini-batch) SHALL draw from this queue first. The queue is a convenience buffer, not durable cross-device state.

#### Scenario: Add-to-quick-review enqueues the question locally

- **WHEN** the player taps「加入快速複習」on the error-cause replay
- **THEN** the current question SHALL be added to the transient device-local quick-review queue (no new synced table, no schema bump)
- **AND** the CTA SHALL reflect that the question is now enqueued

#### Scenario: Next quick-review draws from the queue first

- **GIVEN** the player has enqueued 2 questions via「加入快速複習」
- **WHEN** the player next launches a quick-review mini-batch
- **THEN** the batch SHALL include the enqueued questions ahead of other candidates
