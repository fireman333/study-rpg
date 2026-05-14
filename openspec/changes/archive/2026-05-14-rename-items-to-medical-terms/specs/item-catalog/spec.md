## ADDED Requirements

### Requirement: Item naming source

The `itemCatalog` exported by every content-coupled theme pack (`@study-rpg/theme-<content-domain>`) SHALL derive all item `name` and `flavor` values from the content pack's question corpus, not from generic placeholder names.

For the default theme `theme-pixel-medical` paired with `content-medexam-tw`, all 20 starter items SHALL use medical proper nouns extracted from the 藥理學 question bank at build time (`packages/content-medexam-tw/dist/questions.json`).

#### Scenario: All starter item names exist in the bound question corpus

- **WHEN** any item in `THEME_PIXEL_MEDICAL.itemCatalog` is inspected
- **THEN** its `name` field SHALL contain at least one medical proper noun (drug name / receptor / mechanism / drug class) that appears in `content-medexam-tw/dist/questions.json` stem, options, answer, or explanation
- **AND** the `flavor` field SHALL NOT exceed 25 Chinese characters and SHALL adopt the WLK Stardew-RPG voice (player-perspective tsukkomi, not textbook definitions)

#### Scenario: Build-time extraction is reproducible

- **WHEN** `pnpm --filter @study-rpg/theme-pixel-medical extract-terms` (new script) is run
- **THEN** the script SHALL read `apps/medexam-tw/public/content/medexam-tw/questions.json` (built from the content pack)
- **AND** emit `packages/theme-pixel-medical/src/items.terms.json` containing the extracted candidate terms, their question-frequency, source question IDs, and proposed rarity tier
- **AND** the output SHALL be deterministic given the same input questions.json

### Requirement: Slot ↔ medical category fixed mapping

The catalog SHALL enforce a fixed slot-to-medical-category mapping so that players develop muscle memory associating equipment slots with pharmacology categories.

| Slot | Medical category |
|---|---|
| `head` | Receptor / drug target |
| `body` | Drug class |
| `weapon` | Specific drug (named molecule) |
| `charm` | Mechanism keyword |
| `consumable` | Adverse effect / metabolic concept |

#### Scenario: Slot mapping is enforced across all items

- **WHEN** any item in `THEME_PIXEL_MEDICAL.itemCatalog` is inspected
- **THEN** the `slot` SHALL imply the category of medical proper noun used in `name`, per the table above

### Requirement: Rarity reflects pedagogical importance

The 5-tier rarity assignment SHALL correlate with medical importance in this corpus:

| Rarity | Importance signal |
|---|---|
| N | High frequency in stems, basic mechanisms |
| R | First-line clinical drugs / frequently tested classes |
| SR | Specialty drugs / clinically dangerous (narrow therapeutic index) |
| SSR | High-yield differential / classic exam landmarks |
| UR | Historically significant / Nobel-tier breakthrough drugs |

Distribution SHALL remain N=8 / R=6 / SR=4 / SSR=1 / UR=1 (total 20).

#### Scenario: UR item is a Nobel-tier or paradigm-shifting drug

- **WHEN** the single UR item is inspected
- **THEN** its `name` SHALL be a drug or molecule with documented historical or paradigm-shifting status (Penicillin, Insulin, Cisplatin, Imatinib, or equivalent)
- **AND** the `flavor` SHALL reference its historical / cultural significance, not its pharmacology

### Requirement: Loot distribution invariance

Changing item names SHALL NOT affect the loot roll probability distribution.

#### Scenario: Pre/post rename rolls produce statistically identical distributions

- **WHEN** `scripts/loot-smoke.mjs` is re-run after the rename
- **THEN** the 10000-roll rarity tally SHALL still fall within ±2σ of N:6000 / R:2500 / SR:1000 / SSR:400 / UR:100
- **AND** the pity-counter logic SHALL produce identical fire counts (within statistical noise) compared to pre-rename baseline

### Requirement: Source provenance is preserved

For debug / educational inspection, each item SHALL record which questions contributed to its naming choice.

#### Scenario: Item carries optional source question IDs

- **WHEN** an item is created from extracted terms
- **THEN** it MAY include an optional `sourceQuestionIds: string[]` field listing the question IDs (`<year>-<session>-<book>-<subject>-Q<n>`) where the term was surfaced
- **AND** this field SHALL NOT be displayed in the player-facing UI
- **AND** this field SHALL be type-extended in `Item` interface as optional, non-breaking

### Requirement: Attribution non-removable

The 陽明國考考古題小組 attribution and source URL displayed on every question card SHALL remain present even after item names are derived from the same source corpus.

#### Scenario: Question card footer attribution intact

- **WHEN** a player views any question card in the UI after this change is applied
- **THEN** the card footer SHALL still display the 陽明國考考古題小組 credit + URL inline
- **AND** removal of this attribution from any item / card UI element SHALL be considered a breaking change requiring explicit user approval per the project rule `yangming-attribution`
