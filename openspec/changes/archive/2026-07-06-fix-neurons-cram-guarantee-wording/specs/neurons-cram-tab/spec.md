## MODIFIED Requirements

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
