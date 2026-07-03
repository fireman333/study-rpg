# Design — add-neurons-lofi-radio

## Context

曲庫前置工作已在 `music-lab/`（pre-openspec scratch）完成並驗證：137 首自製 lofi track，經去嗡（voicing-cut）+ bass tuning + 自動化 render（`ogg-new/<id>.ogg`，libopus 128k）+ per-track LUFS 正規化 gain map（TP cap −1）。UI 雛形 `music-lab/radio-mockup.html` 已用 Playwright 端到端驗證（gapless loop / crossfade / cache=3 / 跨風格 RANDOM）。

本 change 只做「進 app」：把驗證過的引擎邏輯移植成 React app 內的正式模組，音檔改由 R2 提供。不重新設計播放行為（已 dogfood 過），focus 在架構落地 + 記憶體/成本安全 + 與既有 app 不衝突。

## Goals / Non-Goals

**Goals:**
- 首頁可選、低干擾的 lofi 背景電台，延長唸書 session、強化沉浸感。
- 手機安全（記憶體不炸分頁）、CPU 輕、離線友善（音檔 lazy-fetch）。
- 音檔儲存與播放程式解耦：換儲存位置零程式改動。
- 對既有 app（sync / leaderboard / maze / DMN / quiz）零影響。

**Non-Goals:**
- 不做曲庫生成 / render / gain map（已在 music-lab 完成，非本 change）。
- 不做播放清單編輯 / 使用者上傳 / 收藏歌曲 / 跨裝置同步電台狀態（電台狀態純本機、非 synced）。
- 不做 native 音訊、不引入音訊函式庫（純瀏覽器 Web Audio）。
- 不改任何既有 capability 的 requirement。

## Decisions

### D1 — Web Audio `AudioBufferSourceNode.loop` 而非 `<audio loop>`
gapless 無縫循環的關鍵（見 `music-lab/LOOP-PIPELINE.md`）：`<audio loop>` 有 codec padding gap（每圈接縫「喀」一下）；Web Audio 的 sample-accurate loop 沒有。**替代方案**（`<audio>` element）被否決 —— dogfood 已證實 gap 明顯。代價：需自管 decode（`decodeAudioData`）與 AudioContext 生命週期。

### D2 — 音檔 R2 hosted + `VITE_BGM_BASE_URL` 設定（owner 決定）
137 oggs（~100MB）放 R2 bucket，custom domain + CDN 快取服務；app 經 env 抓。**替代方案**（`public/bgm/` 進 repo）被否決 —— git 永久 +100MB（即使日後移除仍留 history）。引擎讀 `import.meta.env.VITE_BGM_BASE_URL || \`${import.meta.env.BASE_URL}bgm/\``，所以儲存位置是 deploy-time 設定、非程式。dev 用本機 gitignored `public/bgm/`（或指向 music-lab http server）。

### D3 — decode cache 上限 3（記憶體安全）
解碼後 Float32 stereo 48k PCM 每首 avg 16.5MB、最長 binaural 47MB。cache=6 峰值可達 ~280MB → iOS 分頁 crash 風險（比照 neurons PDF canvas 的 iOS crash 教訓）。**決定 cache=3**（current + 少量預抓）→ 峰值 ~50MB typical / ~140MB 最壞（連播 binaural），手機安全。**替代**（cache=6 或無上限）否決。代價：回放剛播過的曲要重 fetch+decode（可接受，radio 多半往前播）。

### D4 — 獨立 AudioContext（不與 MazeGrid SFX 共用）
MazeGrid 已有 module-scoped `audioCtx`（SFX 用）。radio 用**自己的** AudioContext singleton。**替代**（共用一個 ctx）否決 —— 耦合兩個獨立子系統的生命週期、且 SFX 是短音效、radio 是長 loop，混用增加複雜度。瀏覽器 AudioContext 上限約 6，用 2 個安全。

### D5 — 框架無關引擎 singleton + 薄 React widget
播放邏輯放 `lib/radio/`（純 TS，不依賴 React），widget 只做 UI + 呼叫引擎 + 訂閱狀態。**理由**：引擎已在 mockup 以 vanilla JS 驗證，移植成純 TS singleton 最貼近、最好測；React 只負責像素 UI。狀態經簡單 event/subscribe 曝給 widget。

### D6 — 音量正規化在播放端（per-track gain node）
每首播放時掛一個 gain node，值 = `gainmap[id].gain`（LUFS 正規化 + TP cap −1 算好的乘數）。**替代**（render 時 bake loudnorm 進音檔）否決 —— 保留原始 render、gain 可調不必重 render，且 crossfade 也在 gain node 上做（equal-power ramp）。

## Risks / Trade-offs

- **iOS 分頁記憶體 crash** → D3 cache=3 + lazy-fetch 一次一首。上線後若仍有回報，可再降 cache=2 或對 binaural 這種長曲特別限制。
- **R2 公開服務**：`r2.dev` 公開 URL 有 CF 端 rate-limit、非 production 用 → **必須綁 custom domain**（享完整 CDN 快取）。此步需 owner wrangler OAuth。
- **Autoplay 政策**：AudioContext 需 user gesture 才能 resume/播放 → widget 收合彩蛋 + 展開後點播放符合（不嘗試自動播）。
- **env 遺漏**（per-app / per-worktree 陷阱，見 root CLAUDE.md § Known sharp edges）：`VITE_BGM_BASE_URL` 要在 **deploy worktree** 的 `apps/neurons-tw/.env.local` 也放一份，否則 prod 抓不到 R2 → 電台靜默無音。驗證：build 後 grep bundle 是否含 R2 域名。
- **stations.json / gainmap.json 服務**：小 JSON 放 `lib/radio/` 由 Vite bundle（import），不走 public，避免 CF assetDir 問題。

## Migration Plan

1. **程式落地**（storage-agnostic，可先做）：引擎 + widget + 資料 import + OverviewPage 掛載 + env 預設。dev 用本機 `public/bgm/`（gitignored，從 `music-lab/ogg-new/` 複製）驗證。
2. **R2 infra**（需 owner wrangler OAuth）：建/選 bucket → `wrangler r2 object put` 上傳 137 oggs → 綁 custom domain（如 `bgm.med-study-rpg.com`）+ 確認 CDN 快取 header。
3. **設定 + deploy**：`VITE_BGM_BASE_URL` 寫進 dev + deploy worktree 的 `.env.local` → `pnpm deploy:cf` → prod 驗（Chrome MCP：展開電台、點播、確認 fetch R2 200 + 播放）。
4. **Rollback**：電台 OFF-by-default 彩蛋，最壞情況把 widget 掛載那一行拿掉即完全移除、不影響任何既有功能；R2 bucket 保留不刪。

## Open Questions

- R2 custom domain 用哪個子網域 / 既有 bucket 或新建？（infra 階段跟 owner 敲，wrangler 查現況）。
- SET_SECONDS（每首自動換曲間隔，mockup=180s）是否上線即用 180，或先設更長讓整首完整播完幾輪？→ 傾向沿用 180，dogfood 再調（非 blocking）。
