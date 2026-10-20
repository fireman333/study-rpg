# Tasks — swap-neurons-radio-to-lofi-pixel-radio

## 1. Engine（`apps/neurons-tw/src/lib/radio/engine.ts`）

- [x] 1.1 執行時抓 `<VITE_LOFI_RADIO_URL>tracks.json`，轉成 `{station: Track[]}`；失敗回報 `error` 狀態
- [x] 1.2 A/B 兩個常駐 `<audio>` deck，同 origin 時經 MediaElementSource → gain → master → analyser
- [x] 1.3 播完自動換曲；crossfade 開時曲尾 6 秒交叉淡化
- [x] 1.4 保留公開 API（`getState` / `subscribe` / `setMode` / `next` / `prev` / `togglePlay` / `setVolume` / `toggleCrossfade` / `setStyleSelected` / `getVU`）
- [x] 1.5 同相似組 `g` 不連播；連續 3 首載入失敗就停在錯誤狀態
- [x] 1.6 刪除 `stations.json`、`gainmap.json`

## 2. Widget / 設定

- [x] 2.1 RadioWidget：說明文字改為 6 台 + 曲庫來源；LCD 顯示 `♪ <file>`、載入中 / 連線失敗狀態；RANDOM 選台清單顯示中文台名
- [x] 2.2 `vite-env.d.ts`：`VITE_BGM_BASE_URL` → `VITE_LOFI_RADIO_URL`
- [x] 2.3 `vite.config.ts`：dev server proxy `/lofi` → `https://med-study-rpg.com`
- [x] 2.4 `.github/workflows/deploy-cf-pages.yml`：neurons build env 改成 `VITE_LOFI_RADIO_URL: /lofi/`

## 3. 驗證

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw typecheck` + `test`
- [x] 3.2 dev server 實測：展開 → 選台 → 有聲音、VU 動、下一首 / 上一首 / 暫停 / OFF / RANDOM 跨台、crossfade 開關
- [x] 3.3 console 無錯誤；確認沒有任何請求打到 `radio.med-study-rpg.com`
