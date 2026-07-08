# neurons-speed-review

## Purpose

進考場前 ~5 分鐘的全螢幕純讀速看模式：把 11 科最高投報率的精華一行句掃一遍。資料源＝既有 cram.json 的 `kernel`（🎯 高頻考古）blocks（複用、非新 artifact），一科一卡全螢幕滑動呈現、環境沙漏（零計分壓力）、依 read-only 弱科重排，另附一頁式「進場前一張紙」速看 PDF。獨立路由 `/cram/5min`，零 Dexie/R2/sync/schema 改動。

## Requirements

### Requirement: Static all-family essence set from kernel blocks
The 5-minute speed-review SHALL present a single STATIC essence set that is identical for every user, drawn from the `kernel`（🎯 高頻考古）blocks of the existing cram fragments, sized at up to 5 essence one-liners per family across all 11 families (~55 lines total). The set SHALL NOT vary by user; per-user signals MAY only reorder or flag families (see personalization), never change the content set.

#### Scenario: Same content for every user
- **WHEN** two different users open the 5-minute speed-review
- **THEN** both see the same essence one-liners for each family (content set identical), differing at most in family ordering and weak-family flags

#### Scenario: Per-family line count is capped
- **WHEN** the speed-review essence set is assembled from kernel blocks
- **THEN** each of the 11 families contributes at most 5 essence one-liners

### Requirement: Backfill missing kernel blocks as the single source
The 6 families lacking a `kernel` block (生物化學／組織學／胚胎學／病理學／微生物學／公共衛生學) SHALL have kernel essence one-liners authored INTO the existing cram fragments (`packages/content-neurons-tw/src/cram/fragments/*.html`), drafted from `concept-recurrence` 常青 concepts and owner-reviewed (medical facts verified via OpenEvidence) before shipping. The cram fragments' kernel blocks SHALL be the single source of truth for both the existing `/cram` tab and the speed-review; no parallel essence dataset SHALL be created. Consistent with the existing 速看 self-contained design, kernel lines SHALL NOT carry per-line source anchors.

#### Scenario: All 11 families have a kernel block before ship
- **WHEN** the content build runs for production
- **THEN** every one of the 11 families has a non-empty kernel block (the build fails or flags if any is missing)

#### Scenario: Existing /cram gains consistency, unchanged for the 5 covered families
- **WHEN** the 6 families' kernel blocks are added to the fragments
- **THEN** the existing `/cram` tab renders a kernel (🎯 高頻考古) block for all 11 families, and the 5 already-covered families' fragments are unchanged

### Requirement: Full-screen card-per-subject presentation
The speed-review SHALL render as a full-screen, horizontally swipeable stack of one card per family (11 subject cards plus an intro and a close card), with an 11-dot progress indicator showing position and already-viewed families.

#### Scenario: One card per family, swipeable
- **WHEN** the user opens the speed-review and swipes forward
- **THEN** each swipe advances to the next family card and the progress dots update to reflect the current and viewed families

### Requirement: Ambient timer with zero pressure
The 5-minute timer SHALL be ambient only (e.g. an hourglass). On completion it SHALL show a gentle, non-interrupting hint and SHALL NOT display any score, countdown-pressure, behind/late indicator, or block interaction. This honors the existing cram honesty rule.

#### Scenario: Timer completion is gentle
- **WHEN** the 5-minute ambient timer elapses while the user is still viewing cards
- **THEN** a gentle hint appears without interrupting scrolling, and no score or pressure indicator is shown

### Requirement: Read-only weakness personalization
The speed-review MAY reorder family cards to surface weaker families first and MAY flag weak-family cards, derived read-only from existing `everWrong` / `familyMastery` / `recentAccuracyPct`. It SHALL NOT write to Dexie or R2 and SHALL NOT affect progression, streak, or养成 state.

#### Scenario: Weak family surfaced without mutating state
- **WHEN** a user with a low recent-accuracy family opens the speed-review
- **THEN** that family's card is ordered earlier and/or flagged, and no persisted state (Dexie/R2/streak) is written as a result

### Requirement: Pure-read mode
Essence lines in the speed-review SHALL be non-interactive (pure read). The mode SHALL NOT provide per-line drill-down into full questions or an evidence drawer.

#### Scenario: Essence lines are not clickable
- **WHEN** the user taps an essence line on a family card
- **THEN** nothing navigates or expands (the line is read-only)

### Requirement: Dedicated shareable route
The speed-review SHALL be reachable at a dedicated route `/cram/5min` and SHALL have an entry point from the `/cram` page. The route SHALL render correctly on direct-URL load and on reload (F5) in production (CF Pages static host), not only via in-app navigation.

#### Scenario: Direct URL and reload work in production
- **WHEN** a user opens `/cram/5min` directly by URL or reloads (F5) while on it, in production
- **THEN** the speed-review renders (not a 404 / host default page)

#### Scenario: Entry from cram page
- **WHEN** the user is on the `/cram` page
- **THEN** an entry control opens the 5-minute speed-review

### Requirement: One-page speed-review PDF
The build SHALL also emit a one-page 「進場前一張紙」 speed-review PDF containing the essence set, produced by the same content build pipeline and distinct from the existing full 醫一／醫二 A4 explanation PDFs.

#### Scenario: One-page PDF produced by build
- **WHEN** the content build runs
- **THEN** a one-page speed-review PDF is produced alongside the app artifact, separate from the full A4 explanation PDFs

### Requirement: Build-time only, reusing cram.json with no new artifact or schema change
The speed-review SHALL consume the existing `cram.json` (already lazy-fetched by `/cram`, already in the content assetDir) and extract each family's kernel items at the app layer; it SHALL NOT introduce a new JSON artifact or a new CF Pages `assetDir`. The only new build output SHALL be the one-page speed-review PDF (see PDF requirement), gated by `verify:cram`. The change SHALL NOT alter Dexie schema, R2 bundle schema, or synced meta keys.

#### Scenario: No new data artifact or assetDir
- **WHEN** the change ships
- **THEN** the speed-review reads the existing `cram.json` (no new `speed-review.json`, no new CF Pages assetDir entry)

#### Scenario: No schema bump
- **WHEN** the change ships
- **THEN** no Dexie version, R2 SCHEMA_VERSION, or synced meta key is added or changed
