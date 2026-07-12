## ADDED Requirements

### Requirement: /cram SHALL compose as a subject-led 考前中心 hub

The `/cram` route SHALL render a subject-led 考前中心 (exam-prep hub) that consolidates the exam-prep surfaces, composed top-to-bottom as: (1) a 救急狀態條 (rescue status strip), (2) an 11-subject card grid (each card carrying its 講義 and 猜題 entries) with the selected subject's 猜題 panel (速看 blocks + section-practice CTA + 考古清單) rendered directly under the grid, (3) a first-class 五分鐘速看 entry card, and (4) the A4 PDF download controls sunk to the bottom. The hub SHALL be fully open (no sign-in / no gate), pixel-themed, and mobile-first. The composition SHALL NOT introduce any Dexie schema change, R2 `SCHEMA_VERSION` change (stays 28), or `SYNCED_META_KEYS` change — it is a navigation / information-architecture reorganization only.

#### Scenario: Hub renders in subject-led order
- **WHEN** the user opens `/cram`
- **THEN** the page SHALL render, from top to bottom, a rescue status strip, then the 11-subject card grid with the selected subject's 猜題 panel directly beneath it, then a first-class 五分鐘速看 card, then the A4 PDF download controls

#### Scenario: Direct URL and reload work in production
- **WHEN** the user opens `/cram` directly or reloads (F5) on `/cram` on the production host
- **THEN** the 考前中心 hub SHALL render (not a 404, not a redirect to home)

#### Scenario: Hub adds no persistent state
- **WHEN** the hub renders and the user interacts with any entry
- **THEN** no new Dexie `.version()`, no R2 `SCHEMA_VERSION` change, and no `SYNCED_META_KEYS` diff SHALL be introduced

### Requirement: The hub SHALL surface a rescue status strip that opens the same RescueScene in place

The 考前中心 hub SHALL render a 救急狀態條 that reflects the current active rescue plans, reusing the same global rescue-plan store as the homepage (`useRescuePlans` and the shared per-family rescue-chip computation). For each active plan the strip SHALL surface that family's status (days-to-exam and RescueScore, matching the homepage rescue chip's `D-3 · RescueScore 62` presentation). The strip SHALL be clickable to enter rescue **in place** — clicking SHALL open the same `RescueScene` overlay over the hub, driving the same plan (not a duplicate dashboard, not a route change). The rescue system's own device-local/synced semantics SHALL be unchanged; the strip is a read + entry surface only.

#### Scenario: Strip reflects active plans
- **WHEN** the user has one or more active rescue plans and opens the hub
- **THEN** the rescue status strip SHALL show each active family's status (days-to-exam + RescueScore), derived from the same store the homepage uses

#### Scenario: Clicking the strip opens RescueScene in place
- **WHEN** the user clicks the rescue status strip (or a family entry within it)
- **THEN** the same `RescueScene` overlay SHALL open over the hub driving the same plan, without navigating away from `/cram` and without route-izing the overlay

#### Scenario: No active plan
- **WHEN** the user has no active rescue plan and opens the hub
- **THEN** the strip SHALL offer an entry to create a rescue plan (opening the same rescue setup the homepage uses), and SHALL NOT imply a one-rescue-at-a-time constraint

### Requirement: The hub SHALL present each subject as a card carrying its 講義 and 猜題 entries

The 11-subject card grid SHALL render one card per subject (grouped by 醫學一 / 醫學二), each card carrying the subject name, its NT-branch accent, a 講義(beta) mini entry (the per-subject 講義 entry owned by `neurons-anatomy-handout`, subject-scoped deep-link to `/cram/handout?subject=…`, label dropping the 「考前」 prefix per the hub's label-soup reduction), and access to that subject's 猜題 (速看重點 + 考古清單) content. Selecting a subject card SHALL surface that subject's existing 猜題 panel (速看 blocks + section-practice CTA + 考古清單 evidence drawer, per `neurons-cram-tab`), with the panel's content semantics unchanged. On a phone-width viewport the card grid SHALL wrap without causing horizontal page scroll.

#### Scenario: Card carries 講義 and 猜題 entries
- **WHEN** a subject card renders
- **THEN** it SHALL show the subject name + NT-branch accent, a 講義(beta) mini entry (per `neurons-anatomy-handout`) that deep-links to `/cram/handout?subject=…`, and access to that subject's 猜題 content

#### Scenario: Selecting a card surfaces its 猜題 panel unchanged
- **WHEN** the user selects a subject card
- **THEN** that subject's existing 速看重點 blocks, section-practice CTA, and 考古清單 evidence drawer SHALL be surfaced with unchanged content semantics

#### Scenario: Mobile card grid no horizontal scroll
- **WHEN** the hub is viewed on a phone-width (≈390px) viewport
- **THEN** the subject card grid SHALL wrap and no content SHALL cause horizontal page scroll

### Requirement: The hub SHALL promote 五分鐘速看 to a first-class entry card with zero-decision preserved

The 五分鐘速看 SHALL be promoted from a buried action-row button to a first-class entry card placed below the subject card grid. The card SHALL open the existing full-screen speed-review scene at `/cram/5min` (per `neurons-speed-review`). The card MUST NOT expose any subject picker, filter, or configuration — the speed-review's zero-decision value (open → swipe → out the door, spanning all 11 subjects) SHALL be preserved.

#### Scenario: 5min is a first-class card below the subject grid
- **WHEN** the hub renders
- **THEN** a first-class 五分鐘速看 entry card SHALL appear below the subject card grid and open `/cram/5min` when activated

#### Scenario: 5min card exposes no configuration
- **WHEN** the 五分鐘速看 card renders
- **THEN** it MUST NOT show a subject picker, filter, or any setting — activation goes straight into the cross-subject speed-review

### Requirement: The hub SHALL offer a leaf-level context toolbar linking teaching, prediction, practice, and rescue

The full context toolbar SHALL live on the 押題 item (in the hub 猜題 panel): for that canonical leaf it SHALL offer 看講義 (subject+leaf deep-link `/cram/handout?subject=…&leaf=…`), 對應練題 (existing practice-mode quiz over that leaf's questions), and 救急狀態 (an entry to the family's rescue plan when active). On the handout teaching topic (the deep-link landing side), the leaf SHALL surface the existing 本單元猜題 reverse-link (per `neurons-unit-correspondence`, `/cram?subject=…&push=…`) as the gateway into that same 押題 item's toolbar — the handout side is NOT required to duplicate 練題 / 救急 there (avoiding a QuizModal inside the handout portal scene and avoiding changes to the fragile reverse-link injection). The toolbar SHALL NOT modify the RescueScene 戰情圖 concept chip's handler — the rescue chip continues to deep-link via its existing navigation. The 救急狀態 action SHALL surface only the **family-level** rescue chip (days-to-exam + RescueScore) / rescue entry; it MUST NOT render per-leaf red/yellow/grey 戰情圖 band state into the 講義 body (rescue is device-local, the handout is cross-device consistent). The toolbar SHALL be built purely on the existing canonical-leafId cross-links and query-param deep-links; it SHALL introduce no new persistent state and no new deep-link URL format.

#### Scenario: Cram 押題 item carries the full leaf toolbar
- **WHEN** a 押題 item is shown in the hub 猜題 panel
- **THEN** its toolbar SHALL offer 看講義 (leaf deep-link), 對應練題 (practice over that leaf), and — when that family has an active rescue plan — 救急狀態 (entry to the family's rescue), each mapped to its existing deep-link / entry mechanism, without modifying the RescueScene chip handler

#### Scenario: Handout topic gateways into the toolbar via 本單元猜題
- **WHEN** a teaching topic that has a matching 押題 is shown on the handout
- **THEN** it SHALL surface the existing 本單元猜題 reverse-link (`/cram?subject=…&push=…`) leading to that 押題 item's toolbar, closing the 紅chip → 講義 → 本單元猜題 loop without duplicating 練題 / 救急 on the handout side

#### Scenario: Toolbar adds no new state or URL format
- **WHEN** any toolbar action is invoked
- **THEN** it SHALL reuse the existing `?subject=` / `?leaf=` / `?push=` deep-link formats and existing entries, introducing no new persistent state and no new URL format

### Requirement: The repurposed entry banner SHALL advertise the 考前中心 hub

The existing homepage rescue promo banner SHALL be repurposed to advertise / link into the 考前中心 hub rather than acting as a third, redundant rescue entry. The banner SHALL remain dismissible (its existing versioned dismiss behavior). Repurposing the banner SHALL NOT alter the homepage rescue CTA, the FamilyPicker header rescue entry, or the `?rescue=<familyId>` return-loop — those remain unchanged.

#### Scenario: Banner points at the hub
- **WHEN** the repurposed banner renders and the user activates it
- **THEN** it SHALL lead the user into the 考前中心 hub, not open a duplicate rescue entry

#### Scenario: Homepage rescue entries unchanged
- **WHEN** the banner is repurposed
- **THEN** the homepage rescue CTA, the FamilyPicker header 考前救急 entry, and the `?rescue=` return-loop SHALL be unchanged

### Requirement: The hub reorganization SHALL preserve all existing exam-prep deep-links

The hub reorganization SHALL keep every existing cross-surface deep-link emitting **byte-identical URLs to what the current code produces** (do NOT rewrite or "normalize" them from spec prose): 救急 concept chip → 講義 leaf, 押題 → 講義 leaf, 速看 block → 講義 subject, and 講義 topic → 押題 reverse-link. In particular the 救急 concept chip target carries a `&from=rescue` param that gates the handout's 「← 回救急」 button render — that param and the load-bearing 「← 回救急」 BASE_URL full-navigation (which guards against the production basename blank-page trap) SHALL NOT be modified. These deep-links MUST continue to work under client-side (in-app) navigation, direct URL, and reload (F5).

#### Scenario: All four deep-links survive the reorganization
- **WHEN** the hub is reorganized
- **THEN** all four existing exam-prep deep-links SHALL continue to resolve to their same target URLs and land on the correct teaching leaf / region / 押題 item

#### Scenario: Deep-links work under client-side nav, not just direct URL
- **WHEN** a deep-link is triggered via in-app navigation (e.g. 救急 chip → 講義, or 講義 topic → 押題)
- **THEN** the target SHALL render correctly without requiring a full page reload, and the 「← 回救急」 BASE_URL full-navigation SHALL remain unmodified
