# neurons-lofi-radio Specification

## Purpose

首頁 OverviewPage 迷宮下方一個可選、收合、預設 OFF 的像素 lofi 背景電台彩蛋，用於延長唸書 session、強化沉浸氛圍。播放引擎為框架無關的 Web Audio singleton（獨立 AudioContext，不干擾 MazeGrid 音效）：gapless loop（`AudioBufferSourceNode.loop`）、切歌 equal-power crossfade、per-track LUFS 音量正規化（gainmap）、記憶體上限 decode cache（≤3，行動裝置安全）、9 台選台（RANDOM 跨風格 / 7 風格 / pop-borrow / OFF）。137 首自製 opus ogg 曲庫 hosted on Cloudflare R2（custom domain + CDN 快取），app 經可設定的 `VITE_BGM_BASE_URL` 抓取，使音檔儲存位置為部署設定而非程式邏輯。電台狀態純本機、不進 cloud sync。

## Requirements

### Requirement: Homepage collapsible radio widget
系統 SHALL 在 OverviewPage（`/` 首頁）迷宮下方提供一個可收合的 lofi 電台 widget，預設為收合 + OFF（彩蛋定位，不搶唸書主畫面）。widget 的展開/收合狀態與電台開關互相獨立。

#### Scenario: 首次進站預設收合且靜音
- **WHEN** 玩家首次載入首頁
- **THEN** 電台 widget 以收合狀態呈現、模式為 OFF、無任何音訊播放

#### Scenario: 展開後仍不自動播放
- **WHEN** 玩家展開電台 widget 但尚未選台或按播放
- **THEN** 系統 SHALL NOT 自動播放（維持 OFF / 靜音），等待玩家明確操作

### Requirement: Gapless looping playback
系統 SHALL 使用 Web Audio（`AudioBufferSourceNode.loop = true`）播放每首曲目，達成無縫循環；SHALL NOT 使用 `<audio loop>`（其 codec padding 會在接縫產生可聞間隔）。

#### Scenario: 單曲無縫循環
- **WHEN** 一首曲目播放到結尾並回到開頭
- **THEN** 循環接縫無可聞的靜音間隔或喀聲

### Requirement: Station selection
系統 SHALL 提供 9 個台：RANDOM（在玩家選中的風格間真隨機跨風格洗牌）、7 個單一風格台（jazzhop / boombap / lofigirl / lofihouse / musicbox / rain-piano / binaural）、pop-borrow 台、以及 OFF。切到 OFF SHALL 停止播放。

#### Scenario: 切換到單一風格台
- **WHEN** 玩家用選台旋鈕切到某個風格台
- **THEN** 系統從該風格的曲目池抽一首開始播放，LCD 顯示該台名稱與當前曲目

#### Scenario: RANDOM 跨風格
- **WHEN** 玩家選 RANDOM 台且選中多個風格
- **THEN** 連續曲目可跨不同選中風格出現（不侷限單一風格）

#### Scenario: 切到 OFF 停止
- **WHEN** 玩家切到 OFF
- **THEN** 系統淡出並停止所有播放，狀態顯示 STANDBY

### Requirement: Transport controls and auto-advance
系統 SHALL 提供上一首、播放/暫停、下一首控制，並在每首播放約定時間後自動換下一首。上一首 SHALL 走播放歷史回溯。

#### Scenario: 下一首
- **WHEN** 玩家按下一首
- **THEN** 系統換到下一首曲目並以 crossfade 或微淡入接續

#### Scenario: 自動換曲
- **WHEN** 一首曲目連續播放達自動換曲間隔
- **THEN** 系統自動換下一首，無需玩家操作

#### Scenario: 暫停與恢復
- **WHEN** 玩家在播放中按暫停，稍後再按播放
- **THEN** 音訊在暫停處恢復，狀態於 ON AIR 與 PAUSED 間正確切換

### Requirement: Per-track loudness normalization
系統 SHALL 對每首曲目套用預先算好的音量乘數（gain map，來自 per-track LUFS 正規化 + true-peak cap −1 dBTP），使跨風格音量感一致且不 clip。

#### Scenario: 跨風格音量一致
- **WHEN** 從一個風格切到另一個明顯不同響度的風格
- **THEN** 兩者的感知音量相近（各自套用其 gain 乘數），玩家不需手動調音量

### Requirement: Memory-bounded decode cache
系統 SHALL 對已解碼的音訊緩衝設定數量上限（≤ 3 首），超過時淘汰最舊者，以避免行動裝置分頁因記憶體耗盡而崩潰。音檔 SHALL 隨播隨抓（lazy fetch），不一次載入整個曲庫。

#### Scenario: 快取上限淘汰
- **WHEN** 玩家連續切過多首曲目、解碼緩衝數超過上限
- **THEN** 系統淘汰最舊的解碼緩衝，維持記憶體在上限內

### Requirement: Configurable audio source
系統 SHALL 從可設定的 base URL（`VITE_BGM_BASE_URL`，未設定時退回 app 相對路徑 `${BASE_URL}bgm/`）抓取音檔，使音檔儲存位置（R2 / 本機 / 其他）為部署設定而非程式邏輯。

#### Scenario: 由設定決定來源
- **WHEN** 部署時設定 `VITE_BGM_BASE_URL` 指向 R2 custom domain
- **THEN** 播放器由該 URL 抓取 `<id>.ogg`，程式碼無需改動

### Requirement: No interference with existing subsystems
電台 SHALL 使用獨立的 AudioContext，SHALL NOT 影響既有 MazeGrid 音效、cloud sync、leaderboard、DMN、quiz 等任何既有功能；電台狀態為純本機、不進 cloud sync。

#### Scenario: 與既有音效並存
- **WHEN** 電台正在播放且玩家觸發 maze 音效
- **THEN** 兩者各自以獨立 AudioContext 運作、互不中斷或衝突
