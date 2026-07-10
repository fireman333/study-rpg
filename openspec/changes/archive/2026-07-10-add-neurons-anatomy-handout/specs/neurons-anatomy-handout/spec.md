## ADDED Requirements

### Requirement: 考前講義入口按鈕

The `/cram`（考前猜題）page SHALL render a 「考前講義(beta)」entry button in the top action row, positioned to the LEFT of the「五分鐘速看版」button. The button SHALL use a background color visually distinct from the 五分鐘速看版 gold button (an anatomy-green family fill), and SHALL open the handout scene at route `/cram/handout`.

#### Scenario: 按鈕呈現於速看版左側

- **WHEN** 使用者開啟 `/cram` 頁面
- **THEN** 動作排出現「考前講義(beta)」按鈕，位於「五分鐘速看版」按鈕左側，底色為解剖學綠系（非金色）

#### Scenario: 點擊開啟講義場景

- **WHEN** 使用者點擊「考前講義(beta)」按鈕
- **THEN** 導向 `/cram/handout` 並開啟全螢幕講義場景

### Requirement: 全螢幕教學型講義場景

The handout scene SHALL render as a full-screen, vertically scrollable overlay that `createPortal`s to `document.body` (escaping the `AnimatedRoutes` transform, mirroring `SpeedReviewPage`). The scene SHALL provide a close control that returns to `/cram`. The route SHALL be registered as a real route OUTSIDE `AnimatedRoutes` plus a placeholder route (`<span aria-hidden />`) INSIDE `AnimatedRoutes`, so in-app navigation, direct-URL entry, and F5 reload all render correctly.

#### Scenario: 場景全螢幕覆蓋並可捲動

- **WHEN** 講義場景開啟
- **THEN** 內容以 `position:fixed inset:0` 全螢幕呈現、可垂直捲動，且不受 `AnimatedRoutes` transform 限制而塌陷

#### Scenario: 關閉回到考前猜題

- **WHEN** 使用者點擊場景的 `✕` 關閉鍵
- **THEN** 場景關閉並導回 `/cram`

#### Scenario: 直接網址與重新整理

- **WHEN** 使用者直接開啟 `/cram/handout` 或在該路由按 F5
- **THEN** 講義場景正確 render，而非 404 或殘留前一頁

### Requirement: 講義內容契約 handout.json

The handout content SHALL be served from a static `handout.json` under the existing `content/neurons-tw/` asset directory. Its top-level shape SHALL be `{ version, builtAt, subjects: HandoutSubject[] }`, where each `HandoutSubject` carries at least `{ subjectId, title, html }`. The `subjects` array SHALL be extensible to all 11 families; for this beta it SHALL contain exactly the `解剖學` entry. The loader SHALL prefix the fetch path with `import.meta.env.BASE_URL`.

#### Scenario: beta 範圍只含解剖學

- **WHEN** app 載入 `handout.json`
- **THEN** `subjects` 陣列恰含一筆 `subjectId === '解剖學'` 的教學內容，且結構允許日後新增其他科而不需破壞性變更

#### Scenario: 內容以 BASE_URL 前綴取得

- **WHEN** loader 取得 `handout.json`
- **THEN** fetch 路徑帶 `import.meta.env.BASE_URL` 前綴（prod `/neurons/`、dev `/`），避免 prod SPA index.html fallback 造成 JSON 解析失敗

### Requirement: 依官方 blueprint 分章的教學結構

解剖學 handout content SHALL be organized by the anatomy content pack's canonical 4-chapter blueprint (`neuroanatomy` 神經解剖學 / `head-and-neck` 頭頸部 / `chest-abdomen-pelvis` 胸腹骨盆 / `upper-lower-extremities` 上下肢). Each chapter SHALL contain, in order: (1) a plain-language 導言 understandable to a first-time reader, (2) a 必背重點 list, (3) a 構造 / 神經支配 / 血供 reference table, and (4) an 易混考點 X-vs-Y discriminator table. Content SHALL be curated to a high-yield subset readable within roughly one week, and SHALL be more detailed and more beginner-friendly than the existing `cram.json` 解剖學 blocks.

#### Scenario: 四章齊備且每章四段

- **WHEN** 讀者開啟解剖學講義
- **THEN** 內容依 4 章 blueprint 分章，且每章依序含導言、必背重點、構造/神經/血供表、易混考點對照

#### Scenario: 比小抄更詳盡好懂

- **WHEN** 比較講義與 `cram.json` 解剖學區塊
- **THEN** 講義提供白話解說與教學脈絡（第一次唸也看得懂），而非僅 discriminator 對照

### Requirement: 事實 grounding 與押題誠實

Every anatomical fact in the handout SHALL be traceable to the exam corpus (`questions.json` 解剖學 stems / answers / `optionExplanations` / `explanation`) or to standard anatomy cross-verified against that corpus; facts SHALL NOT be generated from unverified model memory. The handout SHALL NOT contain prediction-certainty language (命中率 / 保證會考 / 今年一定考 or equivalents); high-frequency framing SHALL be presented as historical 投報率參考 only.

#### Scenario: 事實可回溯題庫

- **WHEN** 稽核講義任一必背 / 易混條目
- **THEN** 該條目可指回題庫的題目 / 選項詳解，或為對題庫交叉驗證過的標準解剖知識

#### Scenario: 無命中率保證字眼

- **WHEN** 掃描講義文字
- **THEN** 不出現「命中率 / 保證會考 / 今年一定考」等預測保證字眼

### Requirement: CI-safe 靜態內容交付

The handout content pipeline SHALL follow the `cram.json` precedent: a committed source authored under `packages/content-neurons-tw/src/handout/`, a build step emitting `dist/handout.json`, and `copy-content.mjs` copying it into `apps/neurons-tw/public/content/neurons-tw/`. The pipeline SHALL NOT require headless Chromium or any network fetch at build time, and SHALL NOT alter the CF Pages asset-directory allowlist. The change SHALL NOT bump Dexie schema, R2 bundle `SCHEMA_VERSION`, or the sync engine.

#### Scenario: build 不需瀏覽器且落在既有 assetDir

- **WHEN** 執行 content pack build 與 `copy-content`
- **THEN** `handout.json` 產生於 `public/content/neurons-tw/`（既有 `content` assetDir 內），過程不啟動 headless Chromium、不抓網路、不改 CF Pages allowlist

#### Scenario: 零 sync / schema 影響

- **WHEN** 審視本變更的 diff
- **THEN** 未觸及 Dexie `.version()`、R2 `SCHEMA_VERSION`、`SYNCED_META_KEYS` 或 sync engine
