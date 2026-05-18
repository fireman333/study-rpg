## ADDED Requirements

### Requirement: QuizModal SHALL render question image when `imagePath` is present

When `question.imagePath` is a non-null, non-empty string, the `QuizModal` SHALL render an `<img>` element directly beneath the question stem and above the option buttons. The image SHALL:

- Use `${import.meta.env.BASE_URL}${question.imagePath}` as the `src` (base URL path safety: dev `/study-rpg/hospital/` and prod `/study-rpg/hospital/` share the same base, but using `BASE_URL` insulates against future base changes)
- Use the literal string `"題目附圖"` as the `alt` attribute
- Be wrapped in a styled container `<div className="quiz-modal__image">` to allow CSS sizing (max-width: 100%, max-height: 50vh, object-fit: contain for aspect-ratio preservation on small screens)
- Render between the stem `<p>` and the options `<ul>` in DOM order

The image SHALL re-render correctly when the player advances to a new question (React key on question id, or unconditional re-render on stem change).

#### Scenario: Question with imagePath renders img element

- **GIVEN** the player is shown question `108-2-醫學三-內科-Q45` in QuizModal
- **AND** `question.imagePath = "images/medexam2-tw/108-2-醫學三-內科-Q45.png"`
- **WHEN** the modal renders
- **THEN** an `<img>` element SHALL be present in the DOM, between the stem and the options
- **AND** the `src` attribute SHALL end with `"images/medexam2-tw/108-2-醫學三-內科-Q45.png"`
- **AND** the `alt` attribute SHALL equal `"題目附圖"`

#### Scenario: Switching to next question swaps image

- **GIVEN** the player is viewing a question with an image
- **WHEN** the player clicks 「下一題」 and the next question also has an image (different `imagePath`)
- **THEN** the rendered `<img>` SHALL update its `src` to the new question's `imagePath`
- **AND** no stale image from the previous question SHALL remain in the DOM

#### Scenario: Plain text question renders no image element

- **GIVEN** the player is shown a question where `question.imagePath` is `null` or absent
- **AND** `question.hasImage` is `false`
- **WHEN** the modal renders
- **THEN** no `<img>` element SHALL be present in the question body
- **AND** no `.quiz-modal__image` or `.quiz-modal__image-missing` container SHALL render

### Requirement: QuizModal SHALL render missing-image fallback when `hasImage` is true but `imagePath` is absent

When `question.hasImage === true` AND `question.imagePath` is null/absent, the `QuizModal` SHALL render a fallback notice in place of where the image would appear. The notice SHALL:

- Display Chinese copy: `「📷 此題含附圖但尚未補齊（{question.id}）」`
- Render in a styled container `<div className="quiz-modal__image-missing">` with muted appearance (e.g., gray border, italic text, smaller font) to signal degraded state without blocking interaction
- NOT prevent answering — option buttons SHALL remain interactive

This handles two known cases gracefully:
1. **False positives**: the tightened `hasImage` regex misses an edge case and flags a question that does not actually require an image (rare after regex tightening; still possible)
2. **Extraction failures**: the PyMuPDF extraction script failed to locate or extract the image for that question (logged to `extraction.log`; user can manually backfill later by dropping a PNG into `public/images/medexam2-tw/`)

The fallback SHALL persist until the next build re-runs and the missing PNG is now present.

#### Scenario: hasImage with no imagePath renders fallback notice

- **GIVEN** a question with `hasImage = true` and `imagePath = null`
- **AND** the question id is `109-1-醫學四-外科-Q12`
- **WHEN** the modal renders
- **THEN** the fallback container `.quiz-modal__image-missing` SHALL be present
- **AND** the text content SHALL contain `"📷 此題含附圖但尚未補齊（109-1-醫學四-外科-Q12）"`
- **AND** no `<img>` element SHALL be present

#### Scenario: Fallback does not disable answering

- **GIVEN** the modal renders the missing-image fallback
- **AND** a doctor is bound
- **WHEN** the player clicks an option button
- **THEN** the answer flow (correct/wrong handling, mastery / affinity / history updates per existing requirements) SHALL proceed normally
- **AND** the fallback notice SHALL remain visible alongside the revealed explanation
