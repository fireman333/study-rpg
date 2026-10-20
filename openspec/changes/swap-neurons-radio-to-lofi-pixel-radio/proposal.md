# swap-neurons-radio-to-lofi-pixel-radio

## Why

首頁 lofi 電台原本的曲庫是 137 首短循環 ogg（8 個風格台、單曲 loop、3 分鐘換一首）。Lofi像素電台（med-study-rpg.com/lofi/）已經有 6 台、596 首 ACE-Step 完整曲（每首約 3.5 分鐘、已 loudnorm −16 LUFS / −1.5 dBTP），並且會持續補曲。把 neurons 電台的內容換成 Lofi像素電台的曲庫，兩個網站共用同一份音檔與清單，neurons 不必再維護自己的曲庫。

## What Changes

- **保留 UI 本身**：RadioWidget 像素收音機外觀、旋鈕選台、LCD、VU、transport、RANDOM 選台清單、crossfade 開關、收合 / 預設 OFF 彩蛋定位都不變。
- **換掉內容**：移除 8 個舊風格台（jazzhop / boombap / lofigirl / lofihouse / musicbox / rain-piano / binaural / pop-borrow）與 137 首 ogg 曲目清單；改成 Lofi像素電台的 6 台（library / rainywindow / morningcoffee / latenight / citynight / sunday）。
- **曲目清單改為執行時讀取** `<VITE_LOFI_RADIO_URL>tracks.json`（Lofi 站部署時產生），Lofi 補曲後 neurons 自動拿到，不用改 code。
- **播放引擎改為串流整首播**：完整曲每首解碼後約 70 MB，舊的「整首 decode 進 AudioBuffer + 單曲 loop」在手機上有記憶體風險，也不適合有前奏 / 結尾的完整曲。改用兩個 `<audio>` 元素（A/B deck）經 `MediaElementAudioSourceNode` 接進獨立 AudioContext：整首播完自動接下一首；crossfade 開時在曲尾 6 秒交叉淡化。
- **移除** `stations.json`、`gainmap.json`（曲目已在 Lofi 端統一響度，不需要 per-track gain）與 `apps/neurons-tw/public/bgm/` 本機曲庫。
- **env**：`VITE_BGM_BASE_URL` → `VITE_LOFI_RADIO_URL`（Lofi 站根目錄，預設 `/lofi/`，正式站同網域）。CI 的 deploy workflow 跟著改。本機 dev 用 Vite proxy 把 `/lofi` 轉到 `https://med-study-rpg.com`。

## Capabilities

### Modified Capabilities
- `neurons-lofi-radio`: 曲庫來源、選台清單、播放方式（串流整首、取代 gapless loop）、音量正規化責任移到 Lofi 端、記憶體上限改為串流。

## Impact

- **改程式**：`apps/neurons-tw/src/lib/radio/engine.ts`（重寫播放層，公開 API 不變）、`apps/neurons-tw/src/components/RadioWidget.tsx`（說明文字、LCD 曲名、載入狀態）、`apps/neurons-tw/src/vite-env.d.ts`、`apps/neurons-tw/vite.config.ts`（dev proxy）。
- **刪資料**：`apps/neurons-tw/src/lib/radio/stations.json`、`gainmap.json`。
- **CI**：`.github/workflows/deploy-cf-pages.yml` neurons build step 的 env。
- **依賴**：Lofi像素電台 `/lofi/tracks.json` 與 `/lofi/audio/<station>/<file>.mp3`（Lofi 專案 repo，不在本 repo）。neurons 只讀、不寫。
- **舊 R2**（`radio.med-study-rpg.com`）不再被讀；是否刪除由 owner 另行決定，本 change 不動。
- **不影響**：MazeGrid SFX、cloud sync、leaderboard、DMN、quiz。
