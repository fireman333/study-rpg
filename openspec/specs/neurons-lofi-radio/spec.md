# neurons-lofi-radio Specification

## Purpose

首頁 OverviewPage 迷宮下方一個可選、收合、預設 OFF 的像素 lofi 背景電台彩蛋，用於延長唸書 session、強化沉浸氛圍。曲庫來自 Lofi像素電台（med-study-rpg.com/lofi/）：執行時讀取 `<VITE_LOFI_RADIO_URL>tracks.json`（預設 `/lofi/`，與 `/neurons/` 同 origin），目前 6 台約 600 首完整曲，Lofi 端補曲後自動出現。播放引擎為框架無關的 singleton（獨立 AudioContext，不干擾 MazeGrid 音效）：兩個常駐 `<audio>` deck 串流整首曲目並接進 Web Audio（gain ramp + analyser VU），播完自動換曲、可選曲尾 6 秒 equal-power crossfade；選台為 RANDOM（跨選中台）/ 各台 / OFF。響度正規化在 Lofi 出檔時完成，neurons 端不套 gain。電台狀態純本機、不進 cloud sync。

## Requirements

### Requirement: Homepage collapsible radio widget
系統 SHALL 在 OverviewPage（`/` 首頁）迷宮下方提供一個可收合的 lofi 電台 widget，預設為收合 + OFF（彩蛋定位，不搶唸書主畫面）。widget 的展開/收合狀態與電台開關互相獨立。

#### Scenario: 首次進站預設收合且靜音
- **WHEN** 玩家首次載入首頁
- **THEN** 電台 widget 以收合狀態呈現、模式為 OFF、無任何音訊播放

#### Scenario: 展開後仍不自動播放
- **WHEN** 玩家展開電台 widget 但尚未選台或按播放
- **THEN** 系統 SHALL NOT 自動播放（維持 OFF / 靜音），等待玩家明確操作

### Requirement: Station selection
系統 SHALL 提供 RANDOM、Lofi像素電台曲庫中的每一個台（目前 6 台：library 圖書館午後 / rainywindow 窗邊雨天 / morningcoffee 早晨咖啡 / latenight 深夜書桌 / citynight 城市夜景 / sunday 週日午後）、以及 OFF。台的清單 SHALL 來自執行時讀取的 `tracks.json`，不寫死在 app 內。RANDOM 在玩家選中的台之間跨台洗牌。切到 OFF SHALL 停止播放。

#### Scenario: 切換到單一風格台
- **WHEN** 玩家用選台旋鈕切到某個台
- **THEN** 系統從該台的曲目池抽一首開始播放，LCD 顯示該台名稱、中文名與當前曲目

#### Scenario: RANDOM 跨風格
- **WHEN** 玩家選 RANDOM 台且選中多個台
- **THEN** 連續曲目可跨不同選中台出現（不侷限單一台）

#### Scenario: 切到 OFF 停止
- **WHEN** 玩家切到 OFF
- **THEN** 系統淡出並停止所有播放，狀態顯示 STANDBY

#### Scenario: Lofi 補曲後自動出現
- **WHEN** Lofi像素電台部署了新增曲目的 `tracks.json`
- **THEN** neurons 電台下次載入時即可抽到新曲，neurons 不需重新部署

### Requirement: Transport controls and auto-advance
系統 SHALL 提供上一首、播放/暫停、下一首控制，並在每首曲目播完時自動換下一首。上一首 SHALL 走播放歷史回溯。同一相似組（`tracks.json` 的 `g`）的曲目 SHALL NOT 連續播放（袋中還有其他曲目時）。

#### Scenario: 下一首
- **WHEN** 玩家按下一首
- **THEN** 系統換到下一首曲目並以 crossfade 或微淡入接續

#### Scenario: 自動換曲
- **WHEN** 一首曲目播到結尾
- **THEN** 系統自動換下一首，無需玩家操作；crossfade 開啟時在曲尾約 6 秒開始交叉淡化

#### Scenario: 暫停與恢復
- **WHEN** 玩家在播放中按暫停，稍後再按播放
- **THEN** 音訊在暫停處恢復，狀態於 ON AIR 與 PAUSED 間正確切換

### Requirement: Configurable audio source
系統 SHALL 從可設定的 Lofi像素電台根網址（`VITE_LOFI_RADIO_URL`，未設定時為 `/lofi/`）讀取 `tracks.json`，並以其中每首的相對 `src` 組出音檔網址。音檔與曲目清單 SHALL 只讀，neurons 不保存自己的曲庫副本。

#### Scenario: 由設定決定來源
- **WHEN** 部署時設定 `VITE_LOFI_RADIO_URL=/lofi/`
- **THEN** 播放器讀 `/lofi/tracks.json`，並播放 `/lofi/audio/<station>/<file>.mp3`

#### Scenario: 清單讀取失敗
- **WHEN** `tracks.json` 無法取得
- **THEN** LCD 顯示連線失敗，不播放、不拋出未處理錯誤；玩家再按播放或下一首時重試

### Requirement: No interference with existing subsystems
電台 SHALL 使用獨立的 AudioContext，SHALL NOT 影響既有 MazeGrid 音效、cloud sync、leaderboard、DMN、quiz 等任何既有功能；電台狀態為純本機、不進 cloud sync。

#### Scenario: 與既有音效並存
- **WHEN** 電台正在播放且玩家觸發 maze 音效
- **THEN** 兩者各自以獨立 AudioContext 運作、互不中斷或衝突

### Requirement: Streaming full-track playback
系統 SHALL 以串流方式（`<audio>` 元素，邊下載邊播）播放每首完整曲目，SHALL NOT 把整首解碼進 `AudioBuffer`。同時存在的音訊元素 SHALL 不超過 2 個（目前曲 + crossfade 中的下一首），以維持行動裝置記憶體安全。

#### Scenario: 長時間收聽記憶體不累積
- **WHEN** 玩家連續收聽或切換數十首曲目
- **THEN** 頁面只保有 2 個音訊元素，不累積已解碼的音訊緩衝

#### Scenario: 載入失敗跳過
- **WHEN** 某首曲目載入失敗
- **THEN** 系統跳到下一首；連續 3 首失敗則停止並在 LCD 顯示連線失敗
