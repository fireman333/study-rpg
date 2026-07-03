# Tasks — add-neurons-lofi-radio

## 1. 資料落地（從 music-lab 帶進 app）

- [x] 1.1 複製 `music-lab/_radio-stations.json` → `apps/neurons-tw/src/lib/radio/stations.json`（8 台曲目對映）
- [x] 1.2 複製 `music-lab/_gainmap.json` → `apps/neurons-tw/src/lib/radio/gainmap.json`（per-track gain 乘數；精簡成只留 `{gain}` 或保留全欄皆可）
- [x] 1.3 `.gitignore` 新增 `apps/neurons-tw/public/bgm/`（音檔不進 git）
- [x] 1.4 dev 用：複製 `music-lab/ogg-new/*.ogg` → `apps/neurons-tw/public/bgm/`（gitignored，僅本機播放驗證）

## 2. Audio engine singleton（`apps/neurons-tw/src/lib/radio/`）

- [x] 2.1 `engine.ts` — 移植 mockup 邏輯：AudioContext singleton、`decodeAudioData` + cache（上限 3、淘汰最舊）、gapless `AudioBufferSourceNode.loop`
- [x] 2.2 crossfade + per-track gain node（equal-power ramp；gain 值取自 gainmap）、音量主控
- [x] 2.3 選台語意：9 台（RANDOM 跨風格洗牌 / 7 風格 / pop-borrow / OFF）、bag/shuffle、播放歷史（prev 回溯）
- [x] 2.4 transport：play/pause（AudioContext suspend/resume）、next、prev、SET_SECONDS 自動換曲
- [x] 2.5 音檔來源：`VITE_BGM_BASE_URL || ${BASE_URL}bgm/` 組 fetch URL
- [x] 2.6 對外 API + 狀態訂閱（供 widget）：`getState()` / `subscribe()` / `setMode` / `next` / `prev` / `togglePlay` / `setVolume` / `setStyles`（RANDOM 選中集合）/ `toggleCrossfade`
- [x] 2.7 `vite-env.d.ts` 加 `VITE_BGM_BASE_URL` 型別

## 3. UI widget（`apps/neurons-tw/src/components/RadioWidget.tsx`）

- [x] 3.1 像素收音機 port 成 React：選台旋鈕 / LCD（台名 + 曲目 + 狀態）/ VU 表（analyser）/ transport / 音量滑桿 / crossfade toggle / RANDOM 風格 chips
- [x] 3.2 收合式外殼、預設收合 + OFF；CSS 對齊 neurons app 的 CSS variable / 像素風（不照抄 mockup 的獨立色票）
- [x] 3.3 訂閱引擎狀態驅動 render；VU 用 requestAnimationFrame 讀 analyser
- [x] 3.4 掛載進 `routes/OverviewPage.tsx` 迷宮下方（頁尾）

## 4. 驗證（dev，本機 public/bgm）

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean
- [x] 4.2 `pnpm dev` + Chrome MCP：展開電台 → 選台 → 播放 → next/prev/pause → 切 OFF；確認無 console error、gapless、crossfade、VU 動
- [x] 4.3 記憶體 sanity：連切多首確認 decode cache 不超過 3（DEV log 或 performance 觀察）
- [x] 4.4 確認不影響既有 maze 音效 / 首頁其他功能

## 5. R2 infra（需 owner wrangler OAuth 協助執行）

- [x] 5.1 `wrangler` 查現況：既有 R2 buckets / custom domain（決定用既有或新建 public bucket）
- [x] 5.2 upload 137 oggs：`wrangler r2 object put`（或 batch script）到 bgm bucket
- [ ] 5.3 綁 custom domain（如 `bgm.med-study-rpg.com`）+ 確認 CDN 快取 header（Class B 讀取可 cache）
- [x] 5.4 `VITE_BGM_BASE_URL` 寫進 **dev worktree** `apps/neurons-tw/.env.local`
- [x] 5.5 `VITE_BGM_BASE_URL` 寫進 **deploy worktree** `~/coding-scratch/study-rpg/apps/neurons-tw/.env.local`（per-app + per-worktree 陷阱）

## 6. Deploy + prod 驗證

- [ ] 6.1 `pnpm deploy:cf`（build neurons + wrangler deploy）
- [ ] 6.2 build 後 grep bundle 確認含 R2 域名字串（env baked）
- [ ] 6.3 prod Chrome MCP：`med-study-rpg.com/neurons/` 展開電台 → 播放 → 確認 fetch R2 200（Performance API 看 cross-origin GET）+ 實際出聲 + CDN cache header
- [ ] 6.4 `gh run list --branch main --limit 5` 確認 deploy workflow 綠

## 7. 收尾

- [ ] 7.1 `/verify`（web app end-to-end）
- [ ] 7.2 `/opsx:verify` → `/opsx:archive`
- [ ] 7.3 commit（explicit per-file `git add`，不碰其他 session 的 `eliminate-cross-device-r2-412-storm/tasks.md`）
