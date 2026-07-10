## Why

「考前猜題」(`/cram`) 現有的解剖學內容（`cram.json` 的 `解剖學` 區塊）與「五分鐘速看版」都是**收斂型小抄** — 全是 discriminator / 關鍵字對照表，預設讀者已經唸過，第一次碰解剖學的人看不懂。缺一份**教學型講義**：第一次唸也看得懂、依解剖分區系統整理、考前一週唸得完的高頻精選。解剖學是一階最大科（700 題、佔醫學一 31%），最值得先補這塊。

## What Changes

- 在 `/cram` 頁面下載排、「五分鐘速看版」按鈕**左側**新增「考前講義(beta)」按鈕（同尺寸，底色改用解剖學綠系，與速看版金色明顯區隔）。
- 新增全螢幕、可捲動的**教學型講義場景**（`/cram/handout`），沿用 `SpeedReviewPage` 的 `createPortal`-to-body + 「真 route 在 `AnimatedRoutes` 外、佔位 route 在內」接線；`✕` 關閉回 `/cram`。
- 首發只做**解剖學一科（beta 試點）**；內容依解剖學官方 4 章 blueprint（神經解剖學 / 頭頸部 / 胸腹骨盆 / 上下肢）分章，每章 = 白話導言 → 必背重點 → 構造/神經/血供表 → 易混考點對照。深度須**比考前猜題小抄更詳盡、更好懂**。
- 新增 `handout.json` 靜態內容契約（`subjects[]` 陣列，預留日後擴充其他 10 科），交付管線比照 `cram.json`（committed source → build script → copy-content → public，CI-safe、無 headless Chromium）。
- 事實骨幹 100% 綁題庫（700 題 + 逐選項 `optionExplanations` + `concept-recurrence` breadth/tier + `cram.json` push），標準解剖知識僅作補白且對題庫交叉驗證；交付前經 Codex 對抗審。
- 押題誠實原則沿用：講義是「歷屆高頻收斂」，不得出現「命中率 / 保證會考 / 今年一定考」等字眼。

## Capabilities

### New Capabilities
- `neurons-anatomy-handout`: 考前講義(beta) 功能 — `/cram` 的入口按鈕、`/cram/handout` 全螢幕教學場景、`handout.json` 靜態內容契約（含 `subjects[]` 多科預留與解剖學 beta 範圍）、內容依官方 4 章 blueprint 分章的教學結構（導言 / 必背 / 構造表 / 易混表）、事實 grounding 與押題誠實約束。

### Modified Capabilities
<!-- 無。入口按鈕與內容契約由新 capability 自帶（比照 neurons-speed-review 自帶入口按鈕），content-pack-contract / neurons-deploy 的既有需求未變 —— handout.json 走既有 content assetDir、既有 copy-content 管線，不改既有契約行為。 -->

## Impact

- **新檔**：`packages/content-neurons-tw/src/handout/` (source fragment(s) + build script)、`apps/neurons-tw/src/lib/handout.ts` (loader)、`apps/neurons-tw/src/routes/HandoutPage.tsx` (場景)、`openspec/specs/neurons-anatomy-handout/spec.md` (archive 後)。
- **改檔**：`apps/neurons-tw/src/routes/CramPage.tsx` (新按鈕)、`apps/neurons-tw/src/App.tsx` (route + 佔位 route)、`apps/neurons-tw/scripts/copy-content.mjs` (複製 handout.json)、`packages/content-neurons-tw/package.json` + content pack `index.ts` (build:handout script / 匯出)。
- **零影響**：Dexie schema、R2 bundle / `SCHEMA_VERSION`、sync engine、CF Pages assetDir allowlist（handout.json 落在既有 `content/neurons-tw/` assetDir）。純前端靜態內容讀取。
- **部署**：`track-neurons` worktree → merge main → CF Pages 自動 build + deploy（對外部署為紅線 gate，須 owner 確認）。
