# Design — swap-neurons-radio-to-lofi-pixel-radio

## Context

- neurons-tw 部署在 `med-study-rpg.com/neurons/`，Lofi像素電台在 `med-study-rpg.com/lofi/`（同一個 origin，經 router Worker 分流）。
- Lofi 的 `tracks.json` 格式：`{ "<station>": [{ "src": "audio/<station>/<station>_NNN.mp3", "dur": 204.0, "g"?: <similarity group> }] }`，`src` 相對於 `/lofi/`。音檔由 Pages Function 從 R2 回傳，支援 Range、`cache-control: immutable`。
- Lofi 站本身是「假直播」（依時間戳排程，大家聽同一首）。neurons 電台維持自己的互動語意（選台、上一首 / 下一首、RANDOM 跨台），不跟 Lofi 的直播時間軸同步。

## Decisions

1. **串流 `<audio>` 取代 `AudioBufferSourceNode`。** 完整曲 decode 後 ~70 MB/首，cache 3 首 ≈ 210 MB，iOS 分頁容易被殺。`<audio>` 邊下邊播、記憶體小。代價：不再有 sample-accurate gapless loop；完整曲本來就不該 loop，所以沒損失。
2. **兩個常駐 `<audio>`（A/B deck）。** `MediaElementAudioSourceNode` 每個元素只能建一次，所以元素常駐、換 `src`。每個 deck：element → source → GainNode → master → analyser → destination。交叉淡化 = 兩個 deck 的 gain ramp。
3. **一律走 Web Audio，來源須同 origin。** 正式站 `/lofi/` 與 dev（Vite proxy）都同 origin，MediaElementSource 能讀到資料，VU 照舊走 analyser。不做「跨 origin 改用 `element.volume` 直接播」的備援：iOS 上 `element.volume` 唯讀、備援本來就無效，而且會讓 fade / 音量 / VU 各多一套分支。若日後真要指向別的網域，改讓 Lofi 的 audio function 回 `Access-Control-Allow-Origin`（元素已設 `crossOrigin='anonymous'`）。
4. **自動換曲 = 播完才換。** 移除 `SET_SECONDS = 180`。crossfade 關：`ended` 時接下一首（微淡入）。crossfade 開：`timeupdate` 偵測剩 6 秒時提前開始下一首並交叉淡化。
5. **不做 per-track gain。** Lofi 端已 loudnorm −16 LUFS / −1.5 dBTP，neurons 端 gain = 1。
6. **曲目清單執行時抓，失敗才報錯。** widget 展開時（或第一次選台時）fetch `tracks.json`（`cache: 'no-cache'`，Lofi 端是 `max-age=0, must-revalidate`，etag 命中很便宜），結果留在記憶體。抓取失敗 → LCD 顯示「電台連線失敗」，模式維持、按下一首重試。
7. **台的顯示名稱寫在 neurons 端**（與 Lofi `site/js/scenes.js` 的 name / zh 一致）。`tracks.json` 出現未知台時以大寫 key 顯示，不會壞。
8. **相似曲分組 `g`**：RANDOM / 單台洗牌時，同一 `g` 不連續出現（抽到與上一首同 `g` 時跟袋中下一首換位）。不做 Lofi 站那套均勻分散排程——neurons 是隨機袋，避免連播就夠。
9. **iOS 自動播放**：widget 展開時先預抓 `tracks.json`（約 50 KB），之後選台 / 播放都在使用者點擊的同步呼叫鏈裡呼叫 `element.play()` 與 `ctx.resume()`。若點擊時清單還沒到，先在點擊當下 `resume()` AudioContext，清單到了再播（桌面瀏覽器可行；iOS 可能需要再按一次 ►）。

## Risks / Trade-offs

- **跨專案依賴**：Lofi 站改 `tracks.json` 格式或路徑會打壞 neurons 電台。緩解：engine 只依賴 `src` 欄位，`dur` / `g` 可有可無；Lofi repo 的 `deploy/make_tracks.py` docstring 已說明格式。
- **pages.dev preview** 沒有 `/lofi/`，preview 上電台會顯示連線失敗；正式站正常。若要在 preview 上試聽，需先讓 Lofi 端回 CORS header，再把 `VITE_LOFI_RADIO_URL` 設成 `https://med-study-rpg.com/lofi/`。
