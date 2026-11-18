## ADDED Requirements

### Requirement: The handout SHALL draw each resolvable card's answer as a highlight without changing the rendered document

WHILE a subject's handout is open in `/cram/handout` and the highlight layer is enabled, the scene SHALL draw the `answer` mask of every card of that subject that resolves (see the anchoring requirement) as a highlight registered through the CSS Custom Highlight API. Cards the learner has already collected SHALL be drawn under a second highlight name with a visibly different tint.

The layer SHALL NOT insert, wrap, remove, split, or rewrite any node of the rendered handout, and SHALL NOT set any attribute on a node of the authored HTML. The `::highlight()` styles SHALL use only colour, background colour, and text decoration, so drawing SHALL cause no layout change. The print stylesheet SHALL render both highlights transparent, so the downloaded PDF carries no highlight.

`gloss` and `hint` masks SHALL NOT be drawn in the handout.

Because the document is unchanged, the `?leaf=` / `?section=` landing, the 「本單元猜題」 links, the keypoint card rows, the chapter quiz controls and the reading progress SHALL be unaffected by the layer.

#### Scenario: A pilot card is drawn
- **WHEN** a learner opens 寄生蟲學 in a browser that supports the Custom Highlight API, with the layer enabled
- **THEN** each resolvable card's answer text SHALL be covered by a highlight range whose text equals the card's answer `exact`

#### Scenario: The rendered document is byte-identical after drawing
- **WHEN** the layer resolves and registers every card of a subject
- **THEN** the serialised HTML of the handout's scroll container SHALL be identical before and after

#### Scenario: A collected card changes tint
- **WHEN** the learner collects a card while its subject is open
- **THEN** that card's range SHALL move to the collected highlight without the handout HTML being re-rendered

### Requirement: Runtime anchoring SHALL draw a card only where the displayed bullet equals the card's bulletText, and SHALL otherwise skip it

To anchor a card, the layer SHALL:
1. require the card's `anchorId` subject to equal the open subject;
2. find the single `.hdt-topic` of the open handout whose first `data-leaf-ids` token equals the card's leaf id;
3. consider only that topic's authored bullets, `ul.hdt-must > li`, so that nodes the app adds to the topic (the 「本單元猜題」 links, the keypoint card row and any list inside it) are never treated as authored;
4. derive each authored bullet's own text from the DOM — its text nodes excluding any nested list — without normalisation;
5. select the single bullet whose own text equals the card's `bulletText` character for character;
6. take the answer mask's position from `neurons-handout-cloze-review`'s `playableCardsForConcept`, require the mask's `prefix + exact + suffix` to occur exactly once in that bullet at that position, build a range over `exact`, and require the range's text to equal `exact`.

WHEN any step fails, the card SHALL NOT be drawn and SHALL be counted under a named reason (`wrong-subject`, `no-topic`, `ambiguous-topic`, `text-miss`, `text-ambiguous`, `unresolved`, `ambiguous`, `range-mismatch`). There SHALL be no fallback that places a range anywhere else. For each subject the layer SHALL log the drawn count and the skipped count by reason. The layer SHALL NOT load the card corpus itself. A skipped card SHALL remain collectable through the keypoint card row.

#### Scenario: Every shipped card resolves on its subject
- **WHEN** the pilot subjects' shipped handout HTML is rendered with the 「本單元猜題」 links and keypoint card rows present, and every card in the shipped `handout-cloze.json` is anchored
- **THEN** no card SHALL be skipped, and every range's text SHALL equal its card's answer `exact`

#### Scenario: The handout was edited after the card was reviewed
- **WHEN** the anchored bullet's displayed text no longer equals the card's `bulletText`
- **THEN** the card SHALL NOT be drawn, and the subject log SHALL count it under `text-miss`

#### Scenario: A card row lists the card's sentence
- **WHEN** a keypoint card row inside the topic renders a list item containing the card's sentence
- **THEN** that item SHALL NOT be considered an authored bullet, and the range SHALL be placed in the authored bullet

#### Scenario: A skip is reported, not silent
- **WHEN** a subject has cards that fail to anchor
- **THEN** the subject log SHALL state the drawn count and each skip reason with its count

### Requirement: Highlights SHALL be re-anchored when the handout's authored text is replaced

WHEN the handout's authored text nodes are replaced — for example when the learner switches subject — the layer SHALL detect that a registered range no longer covers its `exact` text, or that topics were added, and SHALL re-anchor. Before registering, the layer SHALL re-check each range's text and SHALL NOT register a range whose text differs from its `exact`. Activity limited to the 「本單元猜題」 links or the keypoint card rows SHALL NOT by itself trigger a re-anchor. On leaving a subject or closing the handout the layer SHALL remove its registered highlights.

#### Scenario: Switching subject
- **WHEN** the learner switches from 寄生蟲學 to 胚胎學
- **THEN** 寄生蟲學's highlights SHALL be removed before 胚胎學's are registered, and no highlight SHALL remain on detached nodes

#### Scenario: Expanding a card row
- **WHEN** the learner expands a keypoint card row
- **THEN** no re-anchor SHALL run

### Requirement: Tapping a highlight SHALL open a card preview whose collect action is delegated to the collection capability

WHEN the layer is enabled and the learner taps or clicks inside a drawn highlight, the scene SHALL open a card preview through the app's shared modal mechanism. Hit-testing SHALL use the caret position at the pointer (`caretPositionFromPoint` where available, otherwise `caretRangeFromPoint`) matched against the registered ranges of that topic, confirmed by the range's client rectangles; where no caret API exists, the rectangles alone SHALL decide.

The preview SHALL show the card face defined by `neurons-handout-cloze-review` — the answer replaced by 「［　　］」 and every gloss and hint replaced by 「（…）」 — so the blank does not reveal the answer's length. Its collect action SHALL call `collectClozeCard(cardId, 'highlight-preview')`, it SHALL read the collected state from `useClozeCollected`, and it SHALL show 「已收藏」 when the card is or becomes collected. A rejected collect SHALL show 「收藏失敗，請再試一次」 and log the error. The preview SHALL NOT offer uncollect and SHALL NOT itself write any learner state.

A tap SHALL NOT open the preview WHEN it lands on a link, a button or a keypoint card row, WHEN the learner has a non-collapsed text selection, or WHEN the layer is disabled. The layer SHALL NOT insert focusable elements; keyboard and assistive-technology users are served by the keypoint card row.

#### Scenario: Collect from the preview
- **WHEN** the learner taps a drawn highlight and presses 「收藏」 in the preview
- **THEN** `collectClozeCard` SHALL be called once with that card's id and the source `highlight-preview`, and the preview SHALL show 「已收藏」

#### Scenario: The preview hides the answer
- **WHEN** the preview opens for a card with an answer, a gloss and a hint mask
- **THEN** none of the three masked texts SHALL appear in the preview's card face before reveal

#### Scenario: Selecting text
- **WHEN** the learner drags to select text that crosses a highlight
- **THEN** no preview SHALL open

### Requirement: The 顯示重點 toggle SHALL sit in the handout header, default to on, sync across devices, and stay available while off

The scene SHALL offer a 「顯示重點」 toggle, with a pixel-sprite icon, in `header.hdt-header`, which every subject renders. The toggle SHALL be present WHEN the browser supports the Custom Highlight API and the open subject has at least one resolvable card, and absent otherwise. The resolvable-card count SHALL be the result of anchoring, computed independently of the toggle's state: anchoring SHALL run while the toggle is off, and only registration SHALL depend on the toggle.

The toggle SHALL default to on. Its state SHALL be stored as the `meta` row `handoutPrefs:v1:showHighlights` with the value `{ on, updatedAt }`; a missing or malformed row SHALL mean on. The row SHALL be written only by a dedicated seam module, only when the learner switches the toggle; a failed write SHALL be logged and SHALL NOT change the in-session behaviour. Its sync and merge are specified by `neurons-cloud-sync`. A change pulled from another device SHALL take effect in an open handout without a reload. The state SHALL be expressed on the scroll container as a class, not by re-rendering the handout HTML.

#### Scenario: First visit
- **WHEN** a learner who has never used the toggle opens a subject with resolvable cards
- **THEN** the toggle SHALL be present and on, the highlights SHALL be drawn, and no `handoutPrefs:v1:showHighlights` row SHALL have been written

#### Scenario: Off, then on again
- **WHEN** the learner switches the toggle off, and then on
- **THEN** after switching off the toggle SHALL still be present and unpressed with no highlight registered, AND after switching on the same set of cards SHALL be drawn again

#### Scenario: Preference follows the account to another device
- **WHEN** the learner switches the toggle off on one device and the bundle is pushed and then pulled on a second device
- **THEN** a subject opened on the second device SHALL show the toggle present and off, and draw no highlights

#### Scenario: A subject with no resolvable cards
- **WHEN** the open subject has no cards, or none of its cards can be anchored
- **THEN** the toggle SHALL NOT be rendered

### Requirement: Browsers without the Custom Highlight API SHALL get no highlight layer and an unchanged handout

WHEN the browser does not provide `CSS.highlights` and `Highlight`, the scene SHALL NOT anchor cards, register highlights, handle taps on prose, or render the toggle, and SHALL NOT log an error. The keypoint card rows SHALL remain available and unaffected.

#### Scenario: An older iOS Safari
- **WHEN** a learner opens a subject in a browser without the Custom Highlight API
- **THEN** the handout SHALL look and behave exactly as without this capability, and each topic's card row SHALL still work

### Requirement: The in-app help SHALL describe the highlight layer and where its toggle is

The HelpMenu 講義字卡 section SHALL state that the handout draws prepared cards as highlights, that tapping one opens a preview to collect it, and that the 「顯示重點」 toggle in the handout's top bar turns the highlights off. The toggle label in the help SHALL equal the label the scene renders, checked by a source-text guard.

#### Scenario: The help names a real control
- **WHEN** the help text names the 「顯示重點」 toggle
- **THEN** that label SHALL equal the label rendered in `header.hdt-header`, both extracted from source by the guard
