## MODIFIED Requirements

### Requirement: The 題庫 tab SHALL become a subtab group with 題庫 and 考前猜題

The system SHALL present the 題庫 top-nav entry as a subtab group containing exactly two subtabs: `/bank` (existing question bank, behavior unchanged) and `/cram` (考前中心 — the consolidated exam-prep hub), reusing the app's existing subtab pattern. The `/cram` subtab SHALL be labelled 考前中心 (renamed from 考前猜題). 考前講義 SHALL NOT be a separate subtab — it is reached from within the 考前中心 hub (per `neurons-exam-prep-hub`) via each subject card's 講義(beta) entry and the existing 速看 block「開啟本科講義」control; the `/cram/handout` route itself is unchanged. The 題庫 top-nav entry SHALL stay highlighted while any of its subtabs (or their nested routes such as `/cram/handout`, `/cram/5min`) is active.

#### Scenario: Subtab bar shows 題庫 and 考前中心
- **WHEN** the user is on `/bank`, `/cram`, `/cram/handout`, or `/cram/5min`
- **THEN** the top-nav 題庫 entry SHALL render as active, and the subtab bar SHALL show exactly two subtabs — 題庫 and 考前中心 (no separate 考前講義 subtab)

#### Scenario: Direct URL and reload work in production
- **WHEN** the user opens `/cram` directly or reloads (F5) on `/cram` on the production host
- **THEN** the 考前中心 hub SHALL render (not a 404 / not a redirect to home)

### Requirement: 考前猜題 SHALL present per-subject 速看重點 and 押題清單, organized by paper, with progressive disclosure

`/cram` SHALL organize content by subject within two regions (醫學一 / 醫學二), using a single-select **subject card grid** (cards grouped by paper), replacing the former subject filter-chip row. Each subject card SHALL carry the subject name, its NT-branch accent, and a 講義 mini entry; selecting a subject card SHALL surface only that subject's 猜題 panel. There SHALL be no expand/collapse accordion and no sticky quick-jump anchor row. On entry with no prior selection, the first subject SHALL be surfaced so the view always shows content. Within the selected subject's panel, the 速看重點 blocks SHALL render first and directly (no "展開速看重點" toggle — content is already scoped to one subject), followed by the section practice CTA and then the 考古清單. The user-facing label for the 押題 (recurrence-ranked concept) list SHALL read 考古清單; the internal `cram.json` `push` field name is unchanged.

#### Scenario: Single-select subject card
- **WHEN** the user selects a subject card
- **THEN** only that subject's 猜題 panel SHALL be shown, with no accordion expand/collapse and no sticky quick-jump row

#### Scenario: 速看重點 first and shown directly
- **WHEN** a subject is selected
- **THEN** its 速看重點 blocks SHALL render first and be shown directly (no collapse toggle), and its 考古清單 SHALL appear after the section practice CTA

#### Scenario: First subject surfaced on entry
- **WHEN** the 考前中心 hub first renders with no prior subject selection
- **THEN** the first subject SHALL be surfaced so content is visible without any tap

#### Scenario: Mobile no horizontal scroll
- **WHEN** viewed on a phone-width (≈390px) viewport
- **THEN** the subject card grid SHALL wrap, and no content SHALL cause horizontal page scroll
