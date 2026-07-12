## ADDED Requirements

### Requirement: 戰情圖概念 chip SHALL deep-link 到該科考前講義對應 region

The rescue dashboard's 戰情圖 (war map) concept chips SHALL be actionable deep-links into the same subject's 考前講義 (handout). **All bands** (red / yellow / grey) SHALL be actionable — grey (never-encoded) concepts are exactly the ones the handout can supply, so band SHALL NOT gate clickability; red MAY carry a stronger visual affordance. The data direction SHALL be unidirectional (rescue → handout) and read-only: it SHALL introduce **no new persistent state** — it SHALL NOT bump Dexie `.version()`, SHALL NOT change R2 `SCHEMA_VERSION` (stays 28), SHALL NOT touch `SYNCED_META_KEYS`, and SHALL NOT import or mutate any rescue sync module.

On chip activation the resolution SHALL happen **on the rescue side**: it SHALL lazily load the handout bundle (module-cached; the 戰情圖 SHALL NOT eager-fetch the ~3 MB `handout.json` on render) and resolve `(subjectId, leafId) → { regionId, isChapter }` **forward** from the loaded subject's `chapterQuizzes[].leafIds`. `subjectId` SHALL be the rescue plan's `familyId`; `leafId` SHALL be the chip's `conceptId`. Resolution SHALL be two-segment (subject-scoped) — a global `leafId → regionId` map SHALL NOT be used, because `leafId` is not unique across subjects.

- **Region-keyed subject** (`memberRegionIds` length 1): the target SHALL be `memberRegionIds[0]`.
- **Chapter-keyed subject** (解剖學; `memberRegionIds` length > 1): the target SHALL be the matching chapter's `memberRegionIds[0]` (the chapter head), NOT the chapter's `regionId` (the chapter-end quiz CTA position). `isChapter` SHALL be true.
- The region/chapter distinction SHALL be an **internal** resolver output used to pick the jump target; it SHALL NOT be rendered as a pre-click chip label (resolution occurs only on click, so no pre-click UI moment exists to show it).

On successful resolution the rescue overlay SHALL be dismissed via its existing close path and navigation SHALL go to `/cram/handout?subject=<subjectId>&section=<regionId>`. Because navigating away unmounts the overlay's host route, no residual overlay SHALL remain (this SHALL NOT depend on callback-ordering / update-batching). Because the chips exist only on the rescue dashboard (not inside a run-in-progress session overlay), activation SHALL NOT collide with run-bound confidence capture. A rapid double-activation across chips SHALL be guarded (an in-flight resolution SHALL suppress subsequent activations), so `aria-busy` alone SHALL NOT be relied on for mutual exclusion.

Chips SHALL be rendered as `<button type="button">` with an accessible label (e.g. `開啟講義：<zh>`) and a tappable visual style; the war map's discoverability hint SHALL be consolidated into the existing head-row hint line (a competing second hint span SHALL NOT be stacked). While the handout bundle is being fetched the chip SHALL expose a busy state (`aria-busy`).

The two null outcomes SHALL be treated distinctly:

- **Unresolved leaf** (`resolveLeafToRegion` returns null — the handout loaded but the `conceptId` maps to no region, e.g. a 送分 / disputed-only leaf): the UI SHALL surface an inline "暫無對應講義段落" note plus a "開啟該科講義" escape hatch (navigates to the subject's handout top, no `?section=`). It SHALL NOT navigate to a wrong region, SHALL NOT crash, and SHALL NOT fall back to region 0 / subject 0.
- **Bundle load failure** (`loadHandout()` returns null — the handout could not be fetched): the UI SHALL surface a retryable "講義載入失敗" message; it SHALL NOT hang on an infinite loading state, and SHALL NOT route to the handout top (which would fail on the same bundle). The loader SHALL reset its in-flight state on failure so a retry is not blocked by a cached-null result.

#### Scenario: 全 band chip 皆可點

- **WHEN** the rescue 戰情圖 renders concept chips of any band (red / yellow / grey)
- **THEN** every chip SHALL be an actionable `<button type="button">` with an accessible label, not a plain non-interactive span
- **AND** band SHALL NOT be used to gate clickability

#### Scenario: Region-keyed 概念跳對應 region

- **WHEN** the player activates a chip whose `conceptId` resolves to a region-keyed subject's region
- **THEN** the rescue overlay SHALL dismiss and navigate to `/cram/handout?subject=<subjectId>&section=<regionId>` where `regionId === memberRegionIds[0]`

#### Scenario: Chapter-keyed（解剖學）概念跳章首

- **WHEN** the player activates a chip whose `conceptId` resolves to a chapter-keyed 解剖學 chapter (`memberRegionIds` length > 1)
- **THEN** the navigation target SHALL be that chapter's `memberRegionIds[0]` (chapter head), NOT the chapter's `regionId`
- **AND** the resolver SHALL report `isChapter === true` (internal; not rendered as a pre-click chip label)

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

### Requirement: 從講義返回救急 SHALL 以 URL-transient 參數閉合 loop

To close the diagnose → read → re-test loop, a handout entered from a rescue war-map chip SHALL offer a "← 回救急" return control that navigates to `/?rescue=<subjectId>`. The `OverviewPage` (home route, which hosts the rescue overlay) SHALL, on mount, read a `?rescue=<familyId>` query and open the rescue scene for that family (via the existing `openRescue`), then clear the query (e.g. `replaceState`) so a reload / manual return does not re-trigger it. The war-map state SHALL be restored from the existing persisted rescue plan; this return path SHALL be **URL-transient with zero persistent state** — it SHALL NOT bump Dexie / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS`, and SHALL NOT touch the multi-subject-rescue sync carve-outs.

#### Scenario: 講義返回鈕回到該科戰情圖

- **WHEN** the player opens the handout from a rescue chip and then activates the "← 回救急" control
- **THEN** navigation SHALL go to `/?rescue=<subjectId>` and the rescue scene SHALL reopen for that subject with its war map restored from the persisted plan

#### Scenario: 返回參數消費後即清除

- **WHEN** `OverviewPage` mounts with `?rescue=<familyId>` and opens the rescue scene
- **THEN** the `?rescue=` query SHALL be cleared so a reload or manual return to home does not re-open the overlay
- **AND** no persistent state SHALL be written (URL-transient only)
