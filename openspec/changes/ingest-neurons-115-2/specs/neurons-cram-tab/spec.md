## MODIFIED Requirements

### Requirement: 押題 items SHALL be honest — raw counts and tiers only, no guarantee or precision claims

Each 押題 item SHALL display only raw recurrence counts (e.g. 「N 次考試出現 M 次」, where N is the published sitting total for the shipped corpus) and its tier label. The denominator SHALL be read from the built dataset rather than written into the UI as a literal, so it can never state a smaller corpus than the one shipped. The feature MUST NOT display normalized scores, hit-rate percentages, or any guarantee/prediction-certainty language. This guarantee/prediction-language ban applies to **every surfaced 考前猜題 string, including 速看 section headings** — not only 押題 item fields — and the build-time cram validator SHALL enforce it on 速看 block headings (block body text, which may legitimately contain figures such as a sensitivity of 100%, is out of scope of the heading lint).

#### Scenario: Raw counts, no fabricated precision
- **WHEN** a 押題 item is rendered
- **THEN** it SHALL show its raw sitting count and tier, AND MUST NOT show a normalized 0–1 score, a 命中率%, or wording such as 保證/必中/100%/今年一定考

#### Scenario: The denominator matches the shipped corpus
- **WHEN** a sitting is ingested and the content pack is rebuilt
- **THEN** the sitting total shown beside every 押題 item SHALL increase to match the corpus without any UI source edit

#### Scenario: 速看 headings carry no guarantee wording
- **WHEN** a 速看重點 block heading is authored and built into `cram.json`
- **THEN** it MUST NOT contain 保證/必中/100%/今年一定考 wording (e.g. 必中考古 is disallowed; 高頻考古 is compliant), AND the cram validator SHALL fail the build if any 速看 heading contains a banned phrase

#### Scenario: Cooling topics are labelled
- **WHEN** a 押題 concept is 經典但降溫
- **THEN** its cooling status SHALL be shown, not hidden

### Requirement: The 考前猜題 view SHALL carry a persistent methodology disclaimer and version stamp

`/cram` SHALL show a persistent one-line disclaimer plus an expandable methodology note and a data-window version stamp, always in-view (not a dismissible modal). The version stamp SHALL name the **most recently ingested sitting**, and both it and the sitting total quoted in the methodology note SHALL be read from the built cram dataset — never hard-coded — so ingesting a sitting cannot leave the view claiming a narrower data window than it actually ranks over.

#### Scenario: Disclaimer and version stamp always present
- **WHEN** the 考前猜題 view is shown
- **THEN** a persistent disclaimer stating the ranking is frequency-based (頻率高 ≠ 今年一定考), an expandable "怎麼算的" methodology note, and a 「統計至 <最新梯次>」 version stamp SHALL all be present

#### Scenario: Version stamp follows the corpus
- **WHEN** the corpus gains a newer sitting and the content pack is rebuilt
- **THEN** the stamp SHALL read that sitting (e.g. 「統計至 115-2」) and the methodology note SHALL quote the same sitting total the ranking uses, with no UI source edit
