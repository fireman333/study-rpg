# VIDEO-HARNESS-GUIDE — 從真實 web app 互動做出社群介紹影片

> 自足教學文件：給一個**沒有任何前置 context 的 agent** 照著獨立重現整條 pipeline。
> 實戰來源：2026-07-06 neurons 考前收官影片（`brag-output/composition-preexam/`，真實範例，本文大量引用）。
> 產出規格：9:16 直式 · 1080×1920 · ~50s · 真錄屏 + 字卡 + 配樂 → mp4 →（可選）發 Threads。

---

## 目錄

1. [總覽：何時用這套、整條 pipeline](#1-總覽)
2. [錄影：Playwright recordVideo](#2-錄影playwright-recordvideo)
3. [後製：ffmpeg webm → CFR H.264](#3-後製ffmpeg)
4. [合成：HyperFrames（video 當底、字卡/配樂疊上）](#4-合成hyperframes)
5. [驗收：contact-sheet 逐格檢查](#5-驗收)
6. [發 Threads（含影片）](#6-發-threads含影片)
7. [常見失敗 → 症狀 → 修法（總表）](#7-常見失敗--症狀--修法總表)

---

## 1. 總覽

### 1.1 兩條路線的取捨

| | 真錄屏（本文） | 靜態截圖 + Ken Burns |
|---|---|---|
| 畫面 | 真捲動、真點擊、真動畫、真 PDF 從 app 裡開出來 | 截圖上加 pan/zoom，「假滑動」 |
| 說服力 | 高——觀眾看得出這是活的 app | 低——owner 實測回饋「假滑動」一眼看穿 |
| 成本 | 要 dev server / prod、要 seed 帳號、要錄影 harness | 只要截圖 |
| 什麼時候選 | **賣點本身是互動**（一鍵開 PDF、答題回饋、動畫養成） | 純資訊卡、頁面靜態排版展示 |

**為什麼**：這套 harness 是在 owner 否決了 v1 靜態截圖版（「假滑動不行，要真實網頁互動」）之後長出來的。如果你的 money shot 是「點一下 → 東西開出來」，靜態截圖做不到。

### 1.2 整條 pipeline

```
Playwright recordVideo（真互動 → .webm）
        │  每段錄完立即驗 bbox（§2.2）
        ▼
ffmpeg：trim + 轉 CFR H.264 mp4（§3）
        │  filmstrip 找 trim 點
        ▼
HyperFrames composition（§4）
   video 當底（root 直接子節點）＋字卡 GSAP overlay＋<audio> 配樂
        │  lint → 0 error → snapshot 自驗 → render
        ▼
renders/<name>_<timestamp>.mp4（1080×1920）
        │  抽 12 幀 contact-sheet 逐格驗收（§5）
        ▼
（可選）壓縮 → catbox → raw Graph API 發 Threads（§6）
```

真實範例（可直接打開對照）：

- Composition：`brag-output/composition-preexam/index.html`
- 影片資產：`brag-output/composition-preexam/assets/video/{cram,quiz,maze2}.mp4`（1080×1920 · h264 · 30fps CFR）
- 配樂：`brag-output/composition-preexam/assets/music/klaude-lofi-51s.m4a`
- 原始錄影：`brag-output/recordings-5173/*.webm`（720×1280 · vp8 · Playwright 原檔）
- 成品：`brag-output/composition-preexam/renders/*.mp4`

---

## 2. 錄影：Playwright recordVideo

### 2.1 填滿幾何硬規則（先讀這條再寫 code）

**規則：`viewport` 必須等於 `recordVideo.size`，且 `deviceScaleFactor: 1`。**

```js
const context = await browser.newContext({
  viewport: { width: 720, height: 1280 },   // 9:16
  deviceScaleFactor: 1,                      // 硬規則
  recordVideo: { dir: OUT_DIR, size: { width: 720, height: 1280 } }, // 必須 == viewport
});
```

**為什麼**：Playwright 錄影是把 native frame 貼進 recordVideo.size 的畫布。`deviceScaleFactor: 2` 時 native frame 是 CSS px 的兩倍，配上 `recordVideo.size ≠ viewport` 的組合，實測會把內容**塞在畫布左上角、其餘全灰**（native frame bbox 只有 `540x960+0+0`，畫布卻是 720×1280）。這種壞檔在小張 contact-sheet 上肉眼極易漏看——縮圖裡「內容偏小」和「正常 mobile 版面」長得很像。

**720 寬的另一個理由**：720 < 768 會讓 app 進 mobile 單欄版面（本專案 breakpoint），直式 9:16 剛好填滿、不用手機外框。

### 2.2 每段錄完必驗 bbox（不可跳過）

```bash
# 抽一幀（跳過開頭 boot 空白，抓中段）
ffmpeg -y -ss 8 -i quiz.webm -frames:v 1 /tmp/f.png
# 量非邊框內容的 bounding box
magick /tmp/f.png -fuzz 8% -format '%@' info:
# 期望：接近 720x1280+0+0（全幅）
# 壞檔：540x960+0+0 之類（內容縮左上角 → 回 §2.1 修幾何、重錄）
```

**為什麼**：這是機器判定，不靠肉眼。`%@` 回傳「去掉純色邊框後的內容範圍」，一行指令就把 §2.1 的坑攔在源頭。

### 2.3 referrer-gated 資源：PDF 必須在對的 origin 錄

本專案「看原始詳解 PDF」走 Google Drive，`VITE_GDRIVE_API_KEY` 的 **HTTP referrer 白名單只認 `localhost:5173`**（與 prod 真 origin）。在 5175 或其他 port 錄，Drive API 回 403 `API_KEY_HTTP_REFERRER_BLOCKED`，畫面只會出現「Drive 暫時忙線」fallback——**看起來像 app 正常運作，其實 money shot 是假的**。

→ 要錄到真 PDF，只能在 **5173 dev** 或 **prod 真 origin** 錄。

起 5173 的正確指令：

```bash
cd apps/neurons-tw && pnpm exec vite --port 5173 --strictPort
```

**為什麼不用 `pnpm dev -- --port 5173`**：launch.json / package.json 的 `dev -- --port` 會被 pnpm→vite 的參數轉發吃掉（實測變成 `vite -- --port`，vite 視為無效參數、繼續停在預設 5175）。直接 `pnpm exec vite` 繞過轉發；`--strictPort` 保證搶不到 5173 就直接 fail 而不是靜默換 port。

**驗法**：錄完後看 money shot 幀，畫面必須是真 PDF（react-pdf canvas 排版），不是 fallback 文案。403 時 console 有 `API_KEY_HTTP_REFERRER_BLOCKED`，可加 `page.on('console', ...)` 監聽。

### 2.4 Seeding：跳過 onboarding（否則 overlay 擋整段錄影）

fresh IndexedDB 會觸發 onboarding 導覽 overlay。在 `goto` 後、正式互動前 seed 兩個 meta key 再 reload：

```js
// db: 'neurons-rpg' / object store: 'meta' / keyPath: 'key'
await page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('neurons-rpg');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('meta', 'readwrite');
    const st = tx.objectStore('meta');
    st.put({ key: 'neurons:onboarding:guidedComplete', value: 'true' });
    st.put({ key: 'neurons:onboarding:expeditionSpotlightSeen', value: 'true' });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  };
}));
await page.reload({ waitUntil: 'networkidle' });
```

**為什麼先 goto 再 seed**：要等 app 自己把 db/schema 建好，才能開同名 db 寫 meta；對全新 profile 直接 `indexedDB.open` 指定版本反而會跟 app 的 Dexie 版本鏈打架。

其他 gated 畫面同理：出征需要錯題（`questionHistory` 表，PK `questionId`，`lastResult` 欄）、處方箋收束是 dayComplete-gated——正式錄前先在同一個 context 手動玩出需要的 state，或用 evaluate seed。

### 2.5 Tap 觸點圈圈（觀眾唯一的互動線索）

直式錄屏**沒有游標**，觀眾靠 ripple 圈圈追你點了哪裡。用 `context.addInitScript` 注入（reload 後仍在）：

```js
await context.addInitScript(() => {
  addEventListener('pointerdown', (e) => {
    const r = document.createElement('div');
    r.style.cssText =
      `position:fixed;left:${e.clientX - 24}px;top:${e.clientY - 24}px;` +
      'width:48px;height:48px;border-radius:50%;' +
      'border:4px solid rgba(245,185,66,.95);background:rgba(245,185,66,.25);' +
      'pointer-events:none;z-index:2147483647;' +
      'transition:transform .45s ease-out,opacity .45s ease-out;';
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(2.2)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 500);
  }, true);
});
```

### 2.6 Pacing（錄的時候就是在剪）

- **捲動小步 + 短停**：`mouse.wheel(0, 420)` + `waitForTimeout(650)` 之類，重複 N 次。一次捲到底在影片裡就是一坨模糊。
- **Payoff hold 1.5–2s**：PDF 開出、迷宮亮起等 money shot，點完後 `waitForTimeout(2000)` 不要動——後面字卡要壓在這個 hold 上。
- **Boot 段照錄、後製 trim**：`goto` + `domcontentloaded` + seed + reload + networkidle 這段是空白/半載入畫面，會被錄進 webm 開頭。不用想辦法「錄不到」，§3 用 `-ss` 剪掉即可（prod networkidle boot 特別長，本次實戰 useful 段都在檔案尾）。

### 2.7 多 agent race 硬警告

**多個 recorder 同時寫同一個輸出目錄會互相 clobber**：實測出現 0-byte 檔、錯解析度的檔、descriptive 檔名被另一隻的 `saveAs` 覆蓋。Playwright 的預設檔名 `page@<hash>.webm` 也無法對回是哪一段。

規則：

1. **一隻 agent 一個隔離 scratch dir**（例 `/private/tmp/rec-quiz/`），錄完、驗過 bbox，才 `cp` 到共用目的地。
2. **絕不讓兩隻同時錄**。要平行就平行做別的（寫字卡、抓配樂），錄影序列化。

### 2.8 Deterministic 檔名

```js
const video = page.video();
await context.close();              // 必須先 close，webm 才 flush 完整
await video.saveAs(`${OUT_DIR}/quiz.webm`);
await browser.close();
```

`page.video().saveAs()` 在 `context.close()` **之後**呼叫，拿到可預期的檔名（原地還會留一份 `page@<hash>.webm`，可刪）。

### 2.9 完整可跑範例（record-quiz.mjs）

```js
// node record-quiz.mjs  （需 npm i playwright 或有 cached chromium）
import { chromium } from 'playwright';

const OUT = '/private/tmp/rec-quiz';                 // §2.7：隔離 scratch dir
const APP = 'http://localhost:5173/neurons/';        // §2.3：referrer 白名單 origin

const browser = await chromium.launch({
  headless: false,                                    // headed：動畫/rAF 全速最穩
  args: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const context = await browser.newContext({
  viewport: { width: 720, height: 1280 },             // §2.1 硬規則三件套
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 720, height: 1280 } },
});

// §2.5 tap ripple
await context.addInitScript(() => {
  addEventListener('pointerdown', (e) => {
    const r = document.createElement('div');
    r.style.cssText = `position:fixed;left:${e.clientX - 24}px;top:${e.clientY - 24}px;width:48px;height:48px;border-radius:50%;border:4px solid rgba(245,185,66,.95);background:rgba(245,185,66,.25);pointer-events:none;z-index:2147483647;transition:transform .45s ease-out,opacity .45s ease-out;`;
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(2.2)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 500);
  }, true);
});

const page = await context.newPage();
page.on('console', (m) => { if (m.text().includes('REFERRER_BLOCKED')) console.error('!! GDrive 403 — 錯 origin'); });
await page.goto(APP, { waitUntil: 'domcontentloaded' });

// §2.4 seed onboarding-skip，然後 reload
await page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('neurons-rpg');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key: 'neurons:onboarding:guidedComplete', value: 'true' });
    tx.objectStore('meta').put({ key: 'neurons:onboarding:expeditionSpotlightSeen', value: 'true' });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  };
}));
await page.reload({ waitUntil: 'networkidle' });     // boot 空白段：照錄，後製 trim
await page.waitForTimeout(1500);

// —— 真互動（§2.6 pacing）——
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 420); await page.waitForTimeout(650); }
await page.click('text=看原始詳解 PDF');              // money shot
await page.waitForTimeout(2000);                     // hold 2s

const video = page.video();
await context.close();
await video.saveAs(`${OUT}/quiz.webm`);              // §2.8 deterministic 檔名
await browser.close();
console.log('saved →', `${OUT}/quiz.webm`, '— 記得跑 §2.2 bbox 驗證');
```

---

## 3. 後製：ffmpeg

### 3.1 找 trim 點：filmstrip

```bash
# 每 4 秒抽 1 幀排成長條，一眼看出 useful 段起訖
ffmpeg -y -i quiz.webm -vf "fps=1/4,scale=200:-2,tile=8x2" /tmp/filmstrip.png
```

用 Read 看 `/tmp/filmstrip.png`：開頭幾格是 boot 空白 → trim 起點；money shot 落在第幾格 × 4s → 記下秒數（§4.4 對齊字卡要用）。

### 3.2 webm → CFR H.264（進 HyperFrames 前必轉）

```bash
ffmpeg -y -ss <起點秒> -i quiz.webm -t <長度秒> \
  -vf "scale=1080:1920:flags=lanczos,fps=30,setsar=1" \
  -an -c:v libx264 -pix_fmt yuv420p -crf 19 -movflags +faststart quiz.mp4
```

**為什麼**：Playwright 的 webm 是 vp8、25fps、時間戳不穩；HyperFrames render 是逐幀取樣，餵 VFR/vp8 會出現 seek 不準、幀重複。轉成 **CFR 30fps H.264** 後每個 timeline 秒數都對得上實際幀。`-an` 去掉（空的）音軌，音樂由 composition 的 `<audio>` 統一管。

### 3.3 不要 crop

**已經照 §2.1 填滿錄的影片，不要再 crop**：

- crop 會切掉真內容——實測切到 PDF viewer 的 ✕ 關閉鈕、卡片邊緣。
- app 自身約 2.4% 的設計 padding **不是留白**，是版面的一部分，保留。

720×1280 → 1080×1920 是等比放大（都是 9:16），只需 `scale`，永遠不需要 crop。

---

## 4. 合成：HyperFrames

Scaffold 直接複製真實範例目錄（`brag-output/composition-preexam/`：`index.html` + `hyperframes.json` + `package.json` + `assets/{video,music,img}`），或 `npx hyperframes@0.7.18 init`。以下規則全部有 lint 對應，違反會被 `lint` 抓（所以 lint 修到 0 error 不是形式，是這些坑的守門員）。

### 4.1 `<video>` / `<audio>` 必須是 composition root 的直接子節點

```html
<div id="root" data-composition-id="main" data-start="0" data-duration="51.4"
     data-width="1080" data-height="1920" data-fps="30">

  <!-- ✅ video = root 直接子節點；不可包進 scene wrapper div -->
  <video id="v-cram" class="foot clip" data-start="0"  data-duration="14"
         data-track-index="1" muted playsinline src="assets/video/cram.mp4"></video>
  <video id="v-quiz" class="foot clip" data-start="14" data-duration="20"
         data-track-index="2" muted playsinline src="assets/video/quiz.mp4"></video>

  <!-- 音樂也是 root 直接子節點 -->
  <audio id="bgm" data-start="0" data-duration="51.4" data-track-index="20"
         data-volume="0.3" src="assets/music/klaude-lofi-51s.m4a"></audio>
</div>
```

```css
video.foot { position: absolute; inset: 0; width: 1080px; height: 1920px;
             object-fit: cover; object-position: center top; z-index: 1; }
```

規則拆解：

- **playback 交給 HyperFrames**：絕不手動 `video.play()`、不改 `currentTime`。render 是逐幀 seek，你手動控制會跟 renderer 打架，輸出黑幀或錯幀。
- 每個 `<video>` 帶 `class="clip"` + `data-start` / `data-duration` / `data-track-index` + `muted`（音軌一律走獨立 `<audio>`）。
- `object-fit: cover` full-bleed 鋪滿。

### 4.2 字卡：`.clip` div + GSAP，**clip 本體只動 opacity**

```js
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });

// fade helper：opacity-only + 出場後硬 kill
function fade(sel, start, dur, inD = 0.5, outD = 0.5) {
  tl.fromTo(sel, { opacity: 0 }, { opacity: 1, duration: inD, ease: "power2.out" }, start);
  tl.to(sel, { opacity: 0, duration: outD, ease: "power1.in" }, start + dur - outD);
  tl.set(sel, { opacity: 0 }, start + dur);   // 硬 kill：避免 gsap_exit_missing_hard_kill
}
fade("#c-cram1", 4.6, 4.2);
// transform 動畫放在 clip 的「內部子元素」，不放 clip 本體：
tl.from("#c-cram2 .big", { scale: 0.9, duration: 0.4, ease: "back.out(2)" }, 9.1);

window.__timelines["main"] = tl;   // 必須 paused + 掛上 __timelines
```

三條 lint 對應：

| 規則 | 對應 lint | 為什麼 |
|---|---|---|
| timed `.clip` 本體只動 opacity，不動 y/transform | `gsap_css_transform_conflict` | 框架用 transform 做 clip 定位，你再疊 transform 會互相覆蓋 |
| full-frame overlay 的 CSS 要有 `opacity: 0` 初值 | `gsap_fullscreen_overlay_starts_visible` | 沒初值 → frame 0 整幅被 overlay 蓋住（實測蓋白/蓋暗第一幀） |
| 每個 fade 出場後補 `tl.set(sel,{opacity:0}, end)` | `gsap_exit_missing_hard_kill` | fade-out tween 結束值有機會被後續 seek 復活，硬 set 才保證消失 |

full-frame overlay 範例（hook 壓暗層）：

```css
#hook-dim { position: absolute; inset: 0; z-index: 5; opacity: 0;  /* ← 必須 */
            background: radial-gradient(circle at 50% 44%, rgba(6,9,16,.45), rgba(6,9,16,.82)); }
```

### 4.3 疊層次序（z-index 慣例）

底：`video.foot` z-1 → 靜態 scene z-1~3 → 壓暗層 z-5 → 字卡/badge z-6 → hook 大字 z-7。字卡用深色半透明 panel（`rgba(7,10,18,.92)` + 邊框），任何 footage 上都讀得到。

### 4.4 字卡對齊真互動（money shot 對位法）

字卡的 `data-start` 是 **timeline 秒數**；payoff 發生在 **clip 內部秒數**。兩者用 trim 對上：

```
timeline 秒數 = clip 的 data-start + payoff 在 mp4 內的秒數
實例：quiz.mp4 從 timeline 14s 開始播，PDF 在 mp4 內 15.4s 開出
     → money 字卡 data-start = 14 + 15.4 = 29.4
```

所以 §3.2 的 `-ss`（trim 起點）不是隨便剪——**剪到讓 payoff 落在你要的字卡時刻**。先 filmstrip 找 payoff 在原始 webm 的秒數，再回推 `-ss`。

### 4.5 工作流：lint → snapshot → render

```bash
cd <composition-dir>
npx --yes hyperframes@0.7.18 lint            # 修到 0 error 才往下
npx --yes hyperframes@0.7.18 snapshot --at 2,11,20,31,37,43,48.5
#   → snapshots/frame-XX-at-N.Ns.png + contact-sheet.jpg（自驗每個 beat 的畫面）
npx --yes hyperframes@0.7.18 render          # → renders/<name>_<timestamp>.mp4
```

snapshot 的 `--at` 秒數選每個 beat 的中點 + money shot 時刻。**render 前先 snapshot**——render 幾分鐘，snapshot 幾秒，錯位在 snapshot 就抓到。

---

## 5. 驗收

從 render 成品抽 12 幀 contact-sheet，逐格看：

```bash
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 renders/out.mp4)
ffmpeg -y -i renders/out.mp4 -vf "fps=12/$DUR,scale=270:-2,tile=6x2" /tmp/contact.png
```

用 Read 開 `/tmp/contact.png`，**每一格**驗三件事：

1. **(a) bbox 填滿**——沒有「內容縮左上角、右下灰塊」（§2.1 幾何坑的最終防線；縮圖易漏，可疑就抽單幀跑 §2.2 的 `magick %@`）。
2. **(b) 無 letterbox、無裁切**——上下無黑邊；PDF ✕ 鈕、卡片邊緣完整（§3.3 crop 坑）。
3. **(c) money shot 是真內容**——真 PDF 排版 / 真動畫，不是 loading spinner、不是「Drive 暫時忙線」403 fallback（§2.3 坑：403 畫面乍看像正常 app）。

三項全過才算 done；任何一項掛掉，回對應章節修、重 render、重驗。

---

## 6. 發 Threads（含影片）

> 對外發布是 hard gate：**成品先給 owner 完整預覽、明確 approve 才發**，絕不自行發布。

### 6.1 為什麼不能用 MCP 發影片

`threads_create_post(video_url=...)` 對影片**會失敗**：Meta 的影片是 async container，要輪詢到 `FINISHED` 才能 publish，MCP 沒實作輪詢。→ 影片主貼走 **raw Graph API 三步**；純文字/圖片貼 MCP 照用。

### 6.2 前置：壓縮 + 上 catbox

```bash
# 壓到 ~10MB（Meta 抓遠端影片會 timeout，大檔必掛）
ffmpeg -y -i renders/out.mp4 -c:v libx264 -crf 26 -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 96k /tmp/threads-video.mp4

# 上 catbox（回傳純 URL，直接可餵 Graph API）
curl -F reqtype=fileupload -F fileToUpload=@/tmp/threads-video.mp4 \
  https://catbox.moe/user/api.php
```

### 6.3 Token：讀 env、不要 echo

```bash
set -a; source ~/threads-mcp/threads-mcp-server/.env; set +a
# 用到：$THREADS_PRIMARY_ACCESS_TOKEN / $THREADS_PRIMARY_USER_ID
# 絕不 echo、不寫進 log、不貼回對話
```

### 6.4 三步發影片主貼

```bash
VIDEO_URL="https://files.catbox.moe/xxxxx.mp4"   # §6.2 回傳的 URL
TEXT='第一則貼文全文…'

# ① 建 VIDEO container —— 每個欄位都用 --data-urlencode（中文 text / topic_tag 才不會壞）
CID=$(curl -s -X POST "https://graph.threads.net/v1.0/${THREADS_PRIMARY_USER_ID}/threads" \
  --data-urlencode "media_type=VIDEO" \
  --data-urlencode "video_url=${VIDEO_URL}" \
  --data-urlencode "text=${TEXT}" \
  --data-urlencode "topic_tag=醫師國考" \
  --data-urlencode "access_token=${THREADS_PRIMARY_ACCESS_TOKEN}" | jq -r .id)
echo "container: $CID"

# ② 輪詢 status 到 FINISHED（實測 ~40s）
while :; do
  S=$(curl -s "https://graph.threads.net/v1.0/${CID}?fields=status&access_token=${THREADS_PRIMARY_ACCESS_TOKEN}" | jq -r .status)
  echo "status: $S"
  [ "$S" = "FINISHED" ] && break
  [ "$S" = "ERROR" ] && { echo "container ERROR — 檢查影片大小/URL 可達性"; exit 1; }
  sleep 5
done

# ③ publish
curl -s -X POST "https://graph.threads.net/v1.0/${THREADS_PRIMARY_USER_ID}/threads_publish" \
  --data-urlencode "creation_id=${CID}" \
  --data-urlencode "access_token=${THREADS_PRIMARY_ACCESS_TOKEN}"
# 回傳 {"id":"<post_id>"} — 留著給 §6.5 串 reply
```

`topic_tag` 注意：**接受中文**（「醫師國考」實測 OK）、**只能在建 container 時設**，發布後不能補。

### 6.5 第 2..N 則：MCP reply 串接（附圖）

後續 reply 沒有 async container 問題，直接用 MCP；圖先壓小：

```bash
# PNG → 小 JPG（~150KB；原檔太大 Meta fetch 會 timeout）
sips -s format jpeg -Z 1080 -s formatOptions 82 in.png --out /tmp/post2.jpg
```

然後 `threads_create_post(reply_to=<前一則 post id>, image_url=/tmp/post2.jpg, text=...)`——MCP 會自動把本地圖檔上傳，`image_url` 給**本地絕對路徑**即可。每一則 reply_to 上一則的 id，串成 thread。

---

## 7. 常見失敗 → 症狀 → 修法（總表）

| # | 失敗 | 症狀 | 修法 |
|---|---|---|---|
| 1 | 錄影幾何錯（dSF2 / size≠viewport） | 內容縮在左上角、其餘灰；`magick %@` bbox ≈ 540x960+0+0 | `deviceScaleFactor:1` + `viewport == recordVideo.size`；每段錄完跑 §2.2 驗證 |
| 2 | 錯 origin 錄 PDF | 畫面只有「Drive 暫時忙線」；console `API_KEY_HTTP_REFERRER_BLOCKED` (403) | 只在 `localhost:5173` 或 prod 真 origin 錄（§2.3） |
| 3 | vite 起在 5175 | `pnpm dev -- --port 5173` 後 server 還是 5175 | `pnpm exec vite --port 5173 --strictPort`（繞過 pnpm 參數轉發） |
| 4 | 多 recorder 同目錄 race | 0-byte webm、錯解析度檔、descriptive 檔名被蓋 | 每 recorder 一個隔離 scratch dir，驗證後才 copy；錄影序列化（§2.7） |
| 5 | fresh profile onboarding 擋畫面 | 導覽 overlay 蓋住整段錄影 | seed 兩個 meta key + reload（§2.4） |
| 6 | webm 直接進 HyperFrames | render seek 不準、幀重複/跳幀 | 先轉 CFR 30fps H.264（§3.2） |
| 7 | 後製 crop | PDF ✕ 鈕/卡片邊被切 | 已填滿就只 scale 不 crop；~2.4% app padding 是設計、保留（§3.3） |
| 8 | video 包進 scene wrapper / 手動 play() | render 黑幀、影片不動或錯幀 | `<video>`/`<audio>` 一律 root 直接子節點；playback 交給框架（§4.1） |
| 9 | clip 本體動 transform | lint `gsap_css_transform_conflict` | clip 只動 opacity；transform 放內部子元素（§4.2） |
| 10 | full-frame overlay 無 opacity 初值 | lint `gsap_fullscreen_overlay_starts_visible`；frame 0 整幅被蓋 | CSS 給 `opacity: 0` 初值（§4.2） |
| 11 | fade 後沒硬 kill | lint `gsap_exit_missing_hard_kill`；字卡出場後閃回 | 每個 fade 補 `tl.set(sel,{opacity:0}, end)`（§4.2） |
| 12 | 字卡與 payoff 錯位 | money 字卡出現時 PDF 還沒開 | trim 回推：字卡 data-start = clip data-start + payoff 在 mp4 內秒數（§4.4） |
| 13 | boot 空白進成品 | 影片開頭好幾秒空白/半載入 | 照錄，filmstrip 找起點、`-ss` trim 掉（§2.6 / §3.1） |
| 14 | MCP 發影片 | `threads_create_post(video_url=…)` 失敗 | raw Graph API 三步：container → poll FINISHED → publish（§6.4） |
| 15 | Meta fetch 大檔 timeout | container 卡住或 ERROR | 影片 `-crf 26` 壓 ~10MB 上 catbox；圖 `sips` 壓 ~150KB JPG（§6.2/§6.5） |
| 16 | curl 中文欄位用 `-d` | text/topic_tag 亂碼或 400 | 每個欄位 `--data-urlencode`（§6.4） |
| 17 | 事後想補 topic_tag | API 無此操作 | 只能建 container 時設；發前想好（§6.4） |

---

## 附：本次實戰的參數速查

| 項目 | 值 |
|---|---|
| 錄影 viewport / recordVideo.size | 720×1280 @ dSF1（vp8 webm ~25fps） |
| 成品 clip | 1080×1920 · h264 · 30fps CFR · crf 19 |
| composition | 1080×1920 @ 30fps · 51.4s · HyperFrames 0.7.18 |
| clip 排布 | cram 0–14s · quiz 14–34s · maze 34–40.4s · 靜態處方箋 40.2–46s · CTA 45.8–51.4s |
| money shot 對位 | PDF 在 quiz.mp4 內 15.4s → timeline 29.4s（badge + 字卡同時亮） |
| 配樂 | `<audio>` root 子節點 · data-volume 0.3 · 51s（原曲 loop + fade 預先 ffmpeg 拼好） |
| Threads 影片 | ~10MB (crf 26) → catbox → 三步 API；container FINISHED ~40s |
