## MODIFIED Requirements

### Requirement: 閱讀進度與章節深連結

The handout scene SHALL surface reading progress derived from the internal scroll container's position, and SHALL persist the last read scroll position per subject in `localStorage` so that reopening the same subject restores the prior position. The scene SHALL support entering a specific chapter via a deep-link (`#<region-id>` hash or `?section=<region-id>` query), scrolling to that region on load. The scene SHALL additionally accept a `?subject=<subject-id>` query that selects the target subject; this subject selection SHALL be resolved **synchronously on first render** (e.g. via a `useState` initializer that reads the query), so that a cross-subject deep-link derives its regions from the correct subject on the first render rather than from the default first subject — this prevents a consume-once deep-link from mis-landing on the default subject's last-read position when the requested subject is not the first one. When a `?section=<region-id>` deep-link resolves and scrolls to its target region, the scene SHALL briefly highlight the landed region (a transient visual cue that adds then removes a class after a short delay), with no persistent state written. All persistence SHALL be device-local `localStorage` only and SHALL NOT touch Dexie, R2, or the sync engine.

#### Scenario: 呈現閱讀進度

- **WHEN** 使用者捲動講義內容
- **THEN** 場景依內部捲動位置呈現閱讀進度指示

#### Scenario: 回到上次閱讀位置

- **WHEN** 使用者重新開啟先前讀過的同一科講義
- **THEN** 內部捲動位置還原到該科上次離開的位置（來源為 per-subject `localStorage`）

#### Scenario: 章節深連結

- **WHEN** 使用者以 `#<region-id>` 或 `?section=<region-id>` 開啟講義
- **THEN** 載入後自動捲動到該 region 章節

#### Scenario: 跨科深連結落在正確 subject 的 region

- **WHEN** 使用者以 `?subject=<subject-id>&section=<region-id>` 開啟講義，且該 subject 不是預設第一科
- **THEN** 首次 render 即以該 `subject-id` 選定的科目 derive regions，並捲動到該科的 `<region-id>` 章節（不落在預設第一科的上次閱讀位置）

#### Scenario: 深連結落點短暫 highlight

- **WHEN** `?section=<region-id>` 深連結解析並捲動到目標 region
- **THEN** 該 region 短暫顯示視覺 highlight（加 class、短延遲後移除），且不寫入任何持久狀態

#### Scenario: 進度持久化不進雲端

- **WHEN** 審視進度 / 位置持久化的儲存路徑
- **THEN** 僅寫入 device-local `localStorage`，未觸及 Dexie `.version()`、R2 `SCHEMA_VERSION`、`SYNCED_META_KEYS` 或 sync engine
