## MODIFIED Requirements

### Requirement: /cram SHALL compose as a subject-led 考前中心 hub

The `/cram` route SHALL render a subject-led 考前中心 (exam-prep hub) that consolidates the exam-prep surfaces, composed top-to-bottom as: (1) a 救急狀態條 (rescue status strip), (2) an 11-subject card grid (each card carrying its 講義 and 猜題 entries) with the selected subject's 猜題 panel (速看 blocks + section-practice CTA + 考古清單) rendered directly under the grid, (3) a 我的字卡 (handout cloze cards) entry block, (4) a first-class 五分鐘速看 entry card, and (5) the A4 PDF download controls sunk to the bottom. The hub SHALL be fully open (no sign-in / no gate), pixel-themed, and mobile-first.

The 我的字卡 block SHALL be a link to the full-screen page `/cram/cards` owned by `neurons-handout-cloze-review`. It SHALL show the number of collected cards and today's pushed-card count as defined by that capability. While the card corpus or the card table is still loading, the block SHALL show no number rather than 0. When the corpus fails to load, the block SHALL still render as a link, without numbers.

The hub's own composition SHALL NOT introduce any Dexie schema change, R2 `SCHEMA_VERSION` change, or `SYNCED_META_KEYS` change, and rendering the hub or any of its blocks SHALL write nothing. The persistent card state that the 我的字卡 block reads is introduced and owned by `neurons-handout-cloze-review`, not by the hub.

#### Scenario: Hub renders in subject-led order
- **WHEN** the user opens `/cram`
- **THEN** the page SHALL render, from top to bottom, a rescue status strip, then the 11-subject card grid with the selected subject's 猜題 panel directly beneath it, then the 我的字卡 block, then a first-class 五分鐘速看 card, then the A4 PDF download controls

#### Scenario: Direct URL and reload work in production
- **WHEN** the user opens `/cram` directly or reloads (F5) on `/cram` on the production host
- **THEN** the 考前中心 hub SHALL render (not a 404, not a redirect to home)

#### Scenario: Hub adds no persistent state
- **WHEN** the hub renders and the user interacts with any entry
- **THEN** the hub itself SHALL introduce no new Dexie `.version()`, no R2 `SCHEMA_VERSION` change, and no `SYNCED_META_KEYS` diff, and opening the hub SHALL write no Dexie row and no `meta` key

#### Scenario: The card block never shows a loading zero
- **GIVEN** a learner with 5 collected cards
- **WHEN** the hub renders before the card corpus has finished loading
- **THEN** the 我的字卡 block SHALL show no count, AND once loading finishes it SHALL show 5 collected cards
