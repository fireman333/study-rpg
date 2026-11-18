## MODIFIED Requirements

### Requirement: 閱讀進度與章節深連結

The handout scene SHALL surface reading progress derived from the internal scroll container's position, and SHALL persist the last read scroll position per subject in `localStorage` so that reopening the same subject restores the prior position. The scene SHALL support entering a specific chapter via a deep-link (`#<region-id>` hash or `?section=<region-id>` query), scrolling to that region on load. The scene SHALL **additionally accept a `?leaf=<leaf-id>` query** that targets a leaf-granularity sub-anchor; leaf resolution is delegated to the `neurons-unit-correspondence` resolver (subject-scoped: leaf primary anchor → region fallback → inline unavailable, never region 0). When both `?leaf=` and `?section=` are present, `?leaf=` SHALL take precedence for the landing target. The scene SHALL additionally accept a `?subject=<subject-id>` query that selects the target subject; this subject selection SHALL be resolved **synchronously on first render** (e.g. via a `useState` initializer that reads the query), so that a cross-subject deep-link derives its regions from the correct subject on the first render rather than from the default first subject — this prevents a consume-once deep-link from mis-landing on the default subject's last-read position when the requested subject is not the first one. When a `?section=<region-id>` or a `?leaf=<leaf-id>` deep-link resolves and scrolls to its target, the scene SHALL briefly highlight the landed region/anchor (a transient visual cue that adds then removes a class after a short delay), with no persistent state written. The persistence of reading progress and reading position SHALL be device-local `localStorage` only and SHALL NOT touch Dexie, R2, or the sync engine. The handout scene itself (the page component and the code that renders the handout HTML) SHALL NOT write Dexie, R2, `meta`, or the sync engine by any other path. The one exception is the handout cloze collect / uncollect actions owned by `neurons-handout-cloze-review`: a control the scene renders MAY invoke those actions, which write only through that capability's own module. The exception is granted to the actions, not to a particular control, so a later control that invokes the same actions is covered without changing this requirement. A second exception is the 顯示重點 preference owned by `neurons-handout-cloze-highlights`: the header toggle the scene renders MAY invoke that capability's seam module, which alone writes the `meta` row `handoutPrefs:v1:showHighlights`, and only when the learner switches the toggle. Opening, scrolling, or deep-linking the scene SHALL write no Dexie row.

#### Scenario: 呈現閱讀進度

- **WHEN** 使用者捲動講義內容
- **THEN** 場景依內部捲動位置呈現閱讀進度指示

#### Scenario: 回到上次閱讀位置

- **WHEN** 使用者重新開啟先前讀過的同一科講義
- **THEN** 內部捲動位置還原到該科上次離開的位置（來源為 per-subject `localStorage`）

#### Scenario: 章節深連結

- **WHEN** 使用者以 `#<region-id>` 或 `?section=<region-id>` 開啟講義
- **THEN** 載入後自動捲動到該 region 章節

#### Scenario: leaf 深連結落在 leaf 級 sub-anchor

- **WHEN** 使用者以 `?subject=<subject-id>&leaf=<leaf-id>` 開啟講義，且該 leaf 在該科有 primary topic anchor
- **THEN** 場景 SHALL 捲動到該 leaf 的 primary topic sub-anchor（而非只到 region 頂），並短暫 highlight
- **AND** leaf 無 anchor / 無 region 時 SHALL 依 `neurons-unit-correspondence` resolver 降級（region fallback 或 inline unavailable），絕不落到 region 0

#### Scenario: 跨科深連結落在正確 subject 的 region

- **WHEN** 使用者以 `?subject=<subject-id>&section=<region-id>` 開啟講義，且該 subject 不是預設第一科
- **THEN** 首次 render 即以該 `subject-id` 選定的科目 derive regions，並捲動到該科的 `<region-id>` 章節（不落在預設第一科的上次閱讀位置）

#### Scenario: 深連結落點短暫 highlight

- **WHEN** `?section=<region-id>` 或 `?leaf=<leaf-id>` 深連結解析並捲動到目標
- **THEN** 該落點短暫顯示視覺 highlight（加 class、短延遲後移除），且不寫入任何持久狀態

#### Scenario: 進度持久化不進雲端

- **WHEN** 審視進度 / 位置持久化的儲存路徑
- **THEN** 僅寫入 device-local `localStorage`，未觸及 Dexie `.version()`、R2 `SCHEMA_VERSION`、`SYNCED_META_KEYS` 或 sync engine

#### Scenario: 開啟講義不寫入 Dexie

- **GIVEN** 一個沒有任何字卡列的存檔
- **WHEN** 使用者開啟有字卡的講義科目、捲動整份講義、以 `?leaf=` 深連結跳到某考點
- **THEN** `handoutClozeState` SHALL 仍為空，且任何 Dexie 表與 `meta` key 都 SHALL NOT 被寫入（閱讀位置的 `localStorage` 除外），包括 `handoutPrefs:v1:showHighlights`

#### Scenario: 收藏字卡走 capability 的動作

- **WHEN** 使用者在講義考點尾端的字卡列按「收藏本考點 N 張」
- **THEN** 寫入 SHALL 只經 `neurons-handout-cloze-review` 的收藏動作完成，講義頁元件與講義 HTML 渲染程式碼本身 SHALL NOT 含任何 Dexie handle 或 storage 寫入

#### Scenario: 顯示重點開關只經 seam 寫入

- **WHEN** 使用者在講義 header 切換「顯示重點」
- **THEN** `meta` 的 `handoutPrefs:v1:showHighlights` SHALL 只由 `neurons-handout-cloze-highlights` 的 seam 模組寫入，講義頁元件本身 SHALL NOT 含任何 Dexie handle 或 storage 寫入
