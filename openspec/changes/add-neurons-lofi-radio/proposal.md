# add-neurons-lofi-radio

## Why

Neurons 是一個「教科書級臨床戲劇」定位的長時段唸書 app，玩家會開著它讀書累積能量。一個可選、低干擾的 lofi 背景電台能延長 session、強化「沉浸唸書」氛圍，且已有一套 137 首自製、去嗡、音量正規化的曲庫（在 `music-lab/`）備妥可用。現在把驗證過的電台雛形正式接進 app。

## What Changes

- 在 OverviewPage（`/` 首頁）迷宮下方新增一個**收合式、預設 OFF 的像素電台 widget**（彩蛋定位，不搶唸書主畫面）。
- 新增 **Web Audio 播放引擎**（singleton）：gapless loop（`AudioBufferSourceNode.loop`）、切歌 equal-power crossfade、per-track 音量正規化（gainmap）、decode cache 上限 3（記憶體安全）、8 個風格台 + RANDOM（跨選中風格洗牌）+ OFF、上一首/播放暫停/下一首、每首約 3 分自動換曲。
- 音檔（137 首 opus ogg，~100MB）**hosted on Cloudflare R2**（custom domain + CDN 快取），app 經 `VITE_BGM_BASE_URL` env 抓；音檔**不進 git**（`apps/neurons-tw/public/bgm/` gitignore，僅本機 dev 用）。
- 隨附小型資料檔進 app：`stations.json`（8 台曲目對映）+ `gainmap.json`（per-track gain 乘數）。
- **不改**任何既有 feature（sync / R2 sync bundle / leaderboard / maze / DMN / quiz）。播放引擎用獨立 AudioContext，與 MazeGrid 既有 SFX AudioContext 互不干擾。

## Capabilities

### New Capabilities
- `neurons-lofi-radio`: 首頁可選的 lofi 背景電台 — 播放引擎行為（gapless loop / crossfade / 音量正規化 / 記憶體上限 / 選台語意）、widget 互動與收合彩蛋定位、音檔來源設定（R2 via env）。

### Modified Capabilities
（無 — 不改動任何既有 capability 的 requirement。）

## Impact

- **新增程式**：`apps/neurons-tw/src/lib/radio/`（引擎）、`apps/neurons-tw/src/components/RadioWidget.tsx`（UI）、`apps/neurons-tw/src/routes/OverviewPage.tsx`（掛載一行）。
- **新增資料**：`apps/neurons-tw/src/lib/radio/stations.json` + `gainmap.json`（幾 KB）。
- **設定**：新 env `VITE_BGM_BASE_URL`（per-app `.env.local`，dev + deploy worktree 各一份，比照 § Known sharp edges 的 per-app/per-worktree 規則）。
- **Infra（需 owner wrangler OAuth）**：建/選 R2 bucket、upload 137 oggs、綁 custom domain + CDN 快取。屬本 change task 但需 owner 協助執行 CLI。
- **git**：`.gitignore` 新增 `apps/neurons-tw/public/bgm/`。
- **不影響**：CF Pages build（音檔走 R2 不在 dist）；既有 Dexie schema / R2 sync / leaderboard / D1 皆不動。
- **依賴**：無新 npm 套件（Web Audio 為瀏覽器原生）。
