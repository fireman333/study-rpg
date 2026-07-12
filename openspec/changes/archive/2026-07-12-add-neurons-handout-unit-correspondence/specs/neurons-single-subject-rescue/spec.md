## MODIFIED Requirements

### Requirement: 戰情圖概念 chip SHALL deep-link 到該科考前講義對應 region

The rescue dashboard's 戰情圖 (war map) concept chips SHALL be actionable deep-links into the same subject's 考前講義 (handout) at **leaf granularity**. **All bands** (red / yellow / grey) SHALL be actionable — grey (never-encoded) concepts are exactly the ones the handout can supply, so band SHALL NOT gate clickability; red MAY carry a stronger visual affordance. The data direction SHALL be unidirectional (rescue → handout) and read-only: it SHALL introduce **no new persistent state** — it SHALL NOT bump Dexie `.version()`, SHALL NOT change R2 `SCHEMA_VERSION` (stays 28), SHALL NOT touch `SYNCED_META_KEYS`, and SHALL NOT import or mutate any rescue sync module.

On chip activation the resolution SHALL happen **on the rescue side** for the mapped-vs-unmapped decision only: it SHALL lazily load the handout bundle (module-cached; the 戰情圖 SHALL NOT eager-fetch the ~3 MB `handout.json` on render) and resolve `(subjectId, leafId) → { regionId, isChapter } | null` **forward** from the loaded subject's `chapterQuizzes[].leafIds`. `subjectId` SHALL be the rescue plan's `familyId`; `leafId` SHALL be the chip's `conceptId`. Resolution SHALL be two-segment (subject-scoped) — a global `leafId → regionId` map SHALL NOT be used, because `leafId` is not unique across subjects.

- **Mapped leaf** (resolution non-null): navigation SHALL go to `/cram/handout?subject=<subjectId>&leaf=<leafId>`, carrying the **leaf** (not a region). The handout scene's `neurons-unit-correspondence` resolver SHALL land at leaf granularity — the leaf's primary topic sub-anchor when present, else the leaf's region (region-keyed subject → its region; chapter-keyed 解剖學 → the matching chapter head). The rescue side SHALL NOT need to encode region vs chapter into the URL; it only needs the non-null resolution to confirm the leaf is mappable.
- The region/chapter distinction SHALL remain an **internal** resolver detail; it SHALL NOT be rendered as a pre-click chip label (resolution occurs only on click, so no pre-click UI moment exists to show it).

On successful (mapped) resolution the rescue overlay SHALL be dismissed via its existing close path and navigation SHALL proceed. Because navigating away unmounts the overlay's host route, no residual overlay SHALL remain (this SHALL NOT depend on callback-ordering / update-batching). Because the chips exist only on the rescue dashboard (not inside a run-in-progress session overlay), activation SHALL NOT collide with run-bound confidence capture. A rapid double-activation across chips SHALL be guarded (an in-flight resolution SHALL suppress subsequent activations), so `aria-busy` alone SHALL NOT be relied on for mutual exclusion.

Chips SHALL be rendered as `<button type="button">` with an accessible label (e.g. `開啟講義：<zh>`) and a tappable visual style; the war map's discoverability hint SHALL be consolidated into the existing head-row hint line (a competing second hint span SHALL NOT be stacked). While the handout bundle is being fetched the chip SHALL expose a busy state (`aria-busy`).

The two null outcomes SHALL be treated distinctly:

- **Unresolved leaf** (`resolveLeafToRegion` returns null — the handout loaded but the `conceptId` maps to no region, e.g. a 送分 / disputed-only leaf): the UI SHALL surface an inline "暫無對應講義段落" note plus a "開啟該科講義" escape hatch (navigates to the subject's handout top, no `?leaf=` / `?section=`). It SHALL NOT navigate to a wrong region, SHALL NOT crash, and SHALL NOT fall back to region 0 / subject 0.
- **Bundle load failure** (`loadHandout()` returns null — the handout could not be fetched): the UI SHALL surface a retryable "講義載入失敗" message; it SHALL NOT hang on an infinite loading state, and SHALL NOT route to the handout top (which would fail on the same bundle). The loader SHALL reset its in-flight state on failure so a retry is not blocked by a cached-null result.

#### Scenario: 全 band chip 皆可點

- **WHEN** the rescue 戰情圖 renders concept chips of any band (red / yellow / grey)
- **THEN** every chip SHALL be an actionable `<button type="button">` with an accessible label, not a plain non-interactive span
- **AND** band SHALL NOT be used to gate clickability

#### Scenario: Mapped 概念跳 leaf 級講義

- **WHEN** the player activates a chip whose `conceptId` resolves (non-null) within the plan's subject
- **THEN** the rescue overlay SHALL dismiss and navigate to `/cram/handout?subject=<subjectId>&leaf=<leafId>` (carrying the leaf, not a region)
- **AND** the handout scene SHALL land on the leaf's primary topic sub-anchor when present, else the leaf's region

#### Scenario: Chapter-keyed（解剖學）概念在無 anchor 時退回章首

- **WHEN** the player activates a chip whose `conceptId` resolves to a chapter-keyed 解剖學 chapter (`memberRegionIds` length > 1) and no topic carries that leaf as an anchor
- **THEN** the handout scene SHALL land on that chapter's `memberRegionIds[0]` (chapter head), NOT the chapter's `regionId`

#### Scenario: 無對應 region 明示 unavailable、不導航

- **WHEN** the player activates a chip whose `conceptId` maps to no handout region (handout loaded fine, e.g. a 送分 / disputed-only leaf)
- **THEN** the UI SHALL show an inline "暫無對應講義段落" note plus a "開啟該科講義" escape hatch to the subject's handout top
- **AND** it SHALL NOT navigate to a wrong region, SHALL NOT crash, and SHALL NOT fall back to region 0 / subject 0

#### Scenario: 講義 bundle 載入失敗可重試、不 hang

- **WHEN** `loadHandout()` fails (bundle fetch / parse error) on chip activation
- **THEN** the UI SHALL show a retryable "講義載入失敗" message, SHALL NOT hang on infinite loading, and SHALL NOT route to the handout top
- **AND** the loader SHALL reset its in-flight state so a subsequent activation retries rather than returning the cached-null result

#### Scenario: 解析 lazy、無 eager fetch

- **WHEN** the rescue dashboard 戰情圖 first renders
- **THEN** it SHALL NOT fetch `handout.json`
- **AND** the ~3 MB handout bundle SHALL only be loaded (module-cached) on the first chip activation

#### Scenario: 零 sync 足跡

- **WHEN** the deep-link integration is exercised
- **THEN** it SHALL NOT bump Dexie `.version()`, change R2 `SCHEMA_VERSION` (stays 28), diff `SYNCED_META_KEYS`, or import / mutate any rescue sync module
- **AND** the only contact with existing rescue paths SHALL be the existing `openRescue` / close paths plus read-only `localStorage` and a URL query param
