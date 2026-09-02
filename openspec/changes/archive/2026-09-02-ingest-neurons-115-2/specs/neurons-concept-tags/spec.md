## RENAMED Requirements

- FROM: `### Requirement: Recurrence SHALL be per-concept sitting-breadth, capped at 23, with a 押題 threshold and disputed filtering`
- TO: `### Requirement: Recurrence SHALL be per-concept sitting-breadth over every ingested sitting, with a 押題 threshold and disputed filtering`

## MODIFIED Requirements

### Requirement: Recurrence SHALL be per-concept sitting-breadth over every ingested sitting, with a 押題 threshold and disputed filtering

The build SHALL emit a concept-recurrence dataset in which the 押題 sort key is **sitting-breadth** = the number of distinct exam sittings in which the concept was tested, deduplicated within a sitting and capped at the total number of ingested sittings. That total SHALL be **derived from the corpus itself**, never written as a literal, and SHALL be published in the dataset as `meta.sittingsTotal` so every downstream surface states the same denominator. Multi-label questions SHALL contribute each of their tested concepts' sitting-presence. Total question-count SHALL be a secondary "intensity" field only, explicitly labelled as possibly exceeding the true question total (because cross-concept questions count on multiple concepts). A 押題 eligibility threshold SHALL apply; concepts below it are searchable but not ranked as 押題. Disputed / 送分 questions SHALL be filtered or annotated using the repo's existing answer-correction data. Coarse-chapter breadth SHALL be the union of its leaves' tested sittings.

Tier boundaries and the 押題 threshold are **absolute sitting counts**, expressing how many sittings of evidence a judgement requires. They SHALL NOT be rescaled when the denominator grows; ingesting a sitting therefore moves concepts across tiers only because they were genuinely tested again.

#### Scenario: Breadth uses distinct sittings and is capped
- **WHEN** recurrence is computed
- **THEN** a concept's breadth SHALL be the count of distinct sittings in which it was tested, with multiple questions on that concept within one sitting counting as a single sitting, and the value never exceeding `meta.sittingsTotal`

#### Scenario: The denominator is derived from the corpus
- **WHEN** a new sitting is ingested
- **THEN** `meta.sittingsTotal` SHALL increase without any source edit, and SHALL equal the number of distinct `(year, session)` pairs present in the corpus

#### Scenario: Multi-label does not inflate breadth
- **WHEN** a question tests two concepts A and B in one sitting
- **THEN** A and B SHALL each record that sitting once (correct — both were tested), AND question-count (which would sum above the true total under multi-label) SHALL NOT be used as the 押題 sort key, only as a labelled secondary field

#### Scenario: Low-frequency long tail is not sold as 押題
- **WHEN** a concept's breadth is below the 押題 threshold (a small breadth such as 1–4 sittings carries large uncertainty)
- **THEN** it SHALL be marked searchable/low-yield and MUST NOT be presented as a ranked 押題 prediction

#### Scenario: Tiers and cooling
- **WHEN** a concept's breadth is known
- **THEN** it SHALL receive exactly one tier from {常青必掃, 穩定考點, 近年新寵, 經典但降溫}, and a concept high all-time but genuinely long-absent (a recency gap wide enough that the absence is not a coincidental streak) SHALL be labelled 經典但降溫

#### Scenario: Disputed questions do not inflate breadth
- **WHEN** a concept's breadth is derived
- **THEN** questions flagged 送分 / answer-corrected SHALL be excluded from or annotated in the count using the existing correction data

### Requirement: Each subject SHALL have a closed two-level concept tree anchored on the official exam blueprint

The system SHALL define, per 一階 subject (解剖/生理/生化/組織/胚胎/病理/藥理/微生/公衛/免疫/寄生), a two-level concept **tree**: a coarse chapter level derived from the official 考選部 命題大綱, and a fine (leaf) concept level derived from the officially-listed reference textbook table-of-contents, calibrated bottom-up against the actual corpus. Every fine concept SHALL belong to exactly one coarse chapter, so a question's chapter is derived from its fine concept's parent (never tagged separately). The vocabulary SHALL be closed and canonical: synonyms are pre-mapped to a single canonical id and no free-form tags are permitted. Per-subject fine-concept count SHALL be chosen by recurrence density so counts stay discriminable, not by a flat global number.

#### Scenario: Coarse level tracks the official blueprint
- **WHEN** a subject's tree is built
- **THEN** its coarse (章節) nodes SHALL correspond to that subject's official 命題大綱 topic structure (e.g. 微生物→細菌學/病毒學/真菌學; 免疫→過敏反應/自體免疫/移植)

#### Scenario: Chapter is derived, not tagged
- **WHEN** a question is tagged with a fine concept
- **THEN** its coarse chapter SHALL be obtained from that fine concept's parent in the tree, with no separate chapter tag stored on the question

#### Scenario: Fine-concept granularity is density-targeted
- **WHEN** a subject's fine-concept set is sized
- **THEN** the count SHALL be chosen so the subject's median tested concept lands in a discriminable sitting-breadth band (roughly subject-question-count ÷ ~8–12 per concept), avoiding a granularity so coarse that concepts saturate at the full sitting count

#### Scenario: Bottom-up corpus calibration is mandatory
- **WHEN** the tree is finalized
- **THEN** concepts tested in the corpus but not listed in the 大綱 SHALL be added under the appropriate chapter, AND chapters listed in the 大綱 but tested by zero questions SHALL be marked cold (not eligible for 押題)

#### Scenario: Synonyms collapse to one canonical leaf
- **WHEN** two surface forms denote the same concept (e.g. `corticospinal tract` and `皮質脊髓徑`)
- **THEN** they SHALL map to a single canonical leaf id so breadth is not diluted
