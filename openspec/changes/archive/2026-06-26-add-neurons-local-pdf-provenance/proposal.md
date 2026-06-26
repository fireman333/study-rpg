## Why

詳解文字的「跑版」散文部分已用 build-time rejoin 修好並上線（change `fix-neurons-explanation-linewrap`，main `64c1c13`，2026-06-26 prod-verified），但**表格 / 圖在純文字層本質上修不漂亮**。Owner 想要一個「教科書級原始排版」的權威詳解來源 = 讓玩家點題後直接看陽明國考考古題小組的**原始 PDF** 那一頁。

關鍵約束：陽明詳解是 CC-BY-NC 受版權內容，app **不能散布任何 PDF bytes**（baked binary 會破壞既有的 24h takedown 承諾）。解法 = **玩家自備 PDF**（自己從陽明網站下載），app 只連結 / 讀他本機授權資料夾的檔 → 散布零份受版權 bytes → 不需另尋陽明授權。inline 詳解保留不動（手機 / 非 Chrome 使用者靠它）；本機 PDF 是**加值入口，不是取代**。

地基已驗證可行：`packages/content-neurons-tw/explanation-figures/manifest.json` 的 **1128 / 1128** 圖 / 表題（正是最想看原檔的那批）已全有 `provenance.{sourcePdf, page}`，「題→{檔, 頁}」對照表可直接從 manifest 烤出、**零人工標註**；被引用的 28 個來源 PDF 在 owner 本機 `~/Desktop/國考/一階國考/陽明國考考古/` **全部存在、0 missing**。

## What Changes

採**分期**結構（owner 已選：FSA 踐石先行、Tauri 閘 gate）。本 change **commit Phase 1**、為 Phase 2 開一個 owner-gated 決策點：

- **Commit（Phase 1，低風險，純 web / Chromium 桌面）**：
  - 離線 builder 從 `explanation-figures/manifest.json` 產 `apps/neurons-tw/public/provenance/question-pdf-map.v1.json`（`{questionId: {file, page}}`，lazy-fetch），跨頁題取 min page。
  - 新 platform adapter `src/platform/`：暴露 `isDesktop / openExplanation(questionId) / grantFolder() / getStatus()`。web 實作走 **File System Access API**（`showDirectoryPicker({mode:'read'})` → `FileSystemDirectoryHandle` 存 Dexie `meta` store → `getFileHandle → getFile → createObjectURL` → 開 `blobURL#page=N`，瀏覽器原生 viewer 跳頁）。spike 已在 Chrome 驗過跳頁正確 + handle 跨 session 持久（每 session 一次 `requestPermission` 手勢）。
  - `Explanation.tsx` 加 optional `questionId` + `renderProvenanceAction` render-prop（向後相容，不傳維持現狀）；caller 傳 `<LocalPdfButton questionId={q.id}/>`。**不支援平台（Safari / 手機 / 未授權資料夾）→ button 不顯示，優雅退回現有 inline 詳解 + 裁圖。**
  - macOS NFC/NFD CJK 檔名匹配：列舉資料夾實體檔名 + 兩邊 `.normalize('NFC')` 再比對。

- **Decide（Phase 2，GATE，decision-gated）**：Tauri 桌面殼 = 確認要做「可下載、離線、同儕一起玩」的產品才啟動。`VITE_TARGET=desktop` 分流；差異集中 `src/platform/* + src-tauri/* + public/pdfjs/*`；Tauri Rust fs 取代 FSA（Win/Mac 都行、路徑持久化）+ bundle **PDF.js** 自渲染指定頁（不信 OS webview 內建 viewer；macOS WKWebView 的 `#page` 不可靠）。簽章現實（Apple Developer $99/yr + notarize / Windows SmartScreen / GH Actions matrix）寫進 design.md Open Question。**Phase 2 真要做時可能拆獨立 change**；本 change 不實作 Tauri 殼。

## Capabilities

### New Capabilities
- `neurons-explanation-pdf-provenance`: 在支援平台上，玩家可由題目開啟其**本機自備**的原始詳解 PDF 並跳至該題所在頁；不支援平台 / 無 mapping 的題優雅退回 inline 詳解；app 散布零份受版權 PDF bytes。涵蓋「題→{檔, 頁}」provenance map、platform adapter 契約（web FSA 實作）、與 `Explanation.tsx` 的可選 provenance action 入口。Tauri desktop 後端為 Phase 2 gated，本 capability 先以 mechanism-agnostic + web-FSA 實作落地。

### Modified Capabilities
<!-- none — Explanation.tsx 的 render-prop 是向後相容新增，不改 neurons-explanation-figures / neurons-explanation-tables 既有 requirement 語意 -->

## Impact

- **新增**：`scripts/`（或 content pack）離線 provenance-map builder · `apps/neurons-tw/public/provenance/question-pdf-map.v1.json` · `apps/neurons-tw/src/platform/`（adapter + web FSA 實作 + Dexie meta handle 存取）· `LocalPdfButton` 元件。
- **改**：`apps/neurons-tw/src/.../Explanation.tsx` 加 optional `questionId` + `renderProvenanceAction` render-prop（caller 端 quiz / 詳解 surface 傳入）。
- **零** Dexie schema bump / R2 bundle / SYNCED_META_KEYS / 經濟系統改動。folder handle 存 Dexie `meta` table 屬既有 key-value 用法（**非** `.version()` schema 變更 → 不觸發 dexie upgrade-fixture lint；apply 時確認）。FSA handle **不**進雲端 sync（本機裝置綁定）。
- **平台限制**：FSA 僅 Chromium 桌面；Safari / 手機 / Firefox 退回 inline。這是 Phase 1 已知邊界，Phase 2 Tauri 才解跨平台 + 持久化。
- **來源 PDF 不入 repo / 不上 CF Pages**（單檔上限 25MB；46 檔共 1.0GB，掃描檔最大 96MB）；本機方案不需 host。
