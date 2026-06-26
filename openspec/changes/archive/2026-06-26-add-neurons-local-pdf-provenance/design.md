## Context

neurons-tw 的 inline 詳解（文字 + 裁圖）對「圖 / 表」題在純文字層永遠不夠漂亮。Owner 想要「教科書級原始排版」= 玩家點題後看陽明國考考古題小組的**原始 PDF 那一頁**。陽明詳解為 CC-BY-NC，app 不能散布 PDF bytes（會破壞 24h takedown 承諾），所以走「玩家自備本機 PDF、app 只讀不散布」。

現況地基（本 session 2026-06-26 驗證）：
- `packages/content-neurons-tw/explanation-figures/manifest.json` = `{questionId: [ {src, provenance:{sourcePdf, page, bbox, ...}}... ]}`，**1128 / 1128** 圖 / 表題全有 `{sourcePdf, page}`。
- 28 個被引用 PDF 在 `~/Desktop/國考/一階國考/陽明國考考古/`（共 44 檔）**全部存在、0 missing**；36 題 figure 跨多頁。
- `Explanation.tsx` 目前只收 explanation 文字欄位，沒有 `id` / `meta`。

本 change 大量決策已在 prior session grill 拍板（見 handoff `~/.claude/scratch/handoff-neurons-local-pdf-provenance-2026-06-26.md` 與 memory `neurons-explanation-pdf-provenance-options.md`），此處記錄不重議。

## Goals / Non-Goals

**Goals:**
- Phase 1：在 Chromium 桌面，玩家可一鍵從本機原始 PDF 看任一已 mapping 題（1128 題）的原檔頁。
- 零受版權 bytes 散布；inline 詳解完全保留為 fallback。
- 單一 codebase、platform-adapter 抽象，讓 Phase 2 Tauri 殼是「換 adapter 實作 + 加 src-tauri/」而非重寫。
- 「題→{檔, 頁}」map 由 manifest 自動烤出、零人工標註、可增量擴充。

**Non-Goals:**
- Phase 1 **不**做 Tauri 殼、不做跨平台桌面、不做簽章 / 散布（Phase 2 gated）。
- **不** map ~3472 純文字題（無 page provenance、文字 reflow 已修好、最不需看原檔）；button 對沒 mapping 的題不顯示。
- **不**改 Dexie schema / R2 bundle / 經濟系統 / 雲端 sync。
- **不**散布、不 host、不下載 PDF pack（那會變轉散布，需陽明授權）。

## Decisions

### D1 — Tauri 桌面殼（非 Electron）｜Phase 2 gated（prior-session 拍板）
Rust 後端 + 系統 webview，體積小、可讀「使用者授權的資料夾」且**路徑持久化**、Win/Mac 都行 —— 正好解掉純瀏覽器 FSA 的兩大限制（僅 Chromium、每 session 重新授權）。**Alternatives:** Electron（肥、無上述優勢）；純 PWA（FSA 限制無法解）。Phase 1 先不做殼。

### D2 — 玩家自備 PDF（不 bundle、不下載 pack）（prior-session 拍板）
App 只連結 / 讀玩家本機檔 → 散布零受版權 bytes → 不需找陽明授權、不破壞 takedown。**Alternatives:** baked binary（轉散布，需授權，破壞 takedown）；first-run 下載 pack（一樣是散布）。

### D3 — Build-time 烤「題→{檔, 頁}」map（不 runtime 推算）
46 個 PDF 檔名極不規則（`106-2醫學(一).pdf` vs `113-2_醫學一總檔.pdf` vs `112-1醫學一 詳解.pdf`），runtime 用 `{year,session,book}→檔名` 推算不可靠。離線 builder 直接吃 manifest 的 `sourcePdf`（已是實體檔名）+ `page`，吞掉檔名複雜度，輸出穩定的 `{questionId:{file,page}}`。跨頁題取 **min page**（36 題；MVP 足夠）。**Alternatives:** runtime regex 推算（脆弱）；人工標註（manifest 已現成，浪費）。

### D3b — map 是 build 產物（gitignored），SOURCE = builder + manifest（repo hygiene 對齊）
依 repo 既有慣例（chore `8f1bae7`：`apps/neurons-tw/public/content/neurons-tw/` 已 gitignore，public = build 產物、deploy 重生、**絕不手 commit**），map 同樣處理：builder 從 committed `packages/content-neurons-tw/explanation-figures/manifest.json` 產出 `apps/neurons-tw/public/provenance/question-pdf-map.v1.json`，該路徑 **加進 `apps/neurons-tw/.gitignore`**，並把 builder 掛進既有 `prebuild`/`predev` 鏈（與 `copy-content.mjs` 同階段）→ 每次 build / CF Pages deploy 自動重生。**SOURCE of truth = builder 腳本 + manifest**，不 commit `public/` 任何 JSON。runtime lazy-fetch 生成的 map。**Alternatives:** 手 commit map 進 public（破壞 public-is-build-output 慣例，會被 hygiene chore 的 `git rm --cached` 再清掉）；放 content pack 再 copy（多一層、無實益，因 builder 已能在 prebuild 直接寫 public）。

### D4 — 重用 manifest provenance（不新建標註流程）
1128 圖 / 表題的 `{sourcePdf, page}` 已存在於 manifest，builder 純轉換。map 在每次 content rebuild 後可重新產出，與 manifest 同步。

### D5 — Platform adapter 抽象（`src/platform/`）
單一介面 `isDesktop / openExplanation(questionId) / grantFolder() / getStatus()`；`VITE_TARGET` 分流（web vs desktop）。差異集中 `src/platform/* + src-tauri/* + public/pdfjs/*`，其餘 app 程式碼平台無感。Phase 1 只實作 web（FSA）adapter。

### D6 — Web 實作走 File System Access API + 獨立 device-local IndexedDB 存 handle
`showDirectoryPicker({mode:'read'})` → `FileSystemDirectoryHandle` 持久化 → `getFile → createObjectURL` → 開 `blobURL#page=N`。spike 已驗 Chrome 跳頁正確、handle 跨分頁 / 跨 session 持久（每 session 一次 `requestPermission` 手勢）。

**handle 存哪（apply 時修正）**：原案寫「Dexie `meta` store」，但既有 `MetaRow.value` 型別是 `string`，裝不下 handle 物件；改用 typed meta 會 ripple 整個共享 table，加新 Dexie table 又會 `.version()` bump 觸發 dexie-upgrade-fixture lint。**改用獨立的 device-local IndexedDB store（一個自包含小 helper，不屬於 synced Dexie db）**——更 surgical、零 schema bump、且因為根本不在 synced db 內，天生不會進雲端 sync。保證行為（跨 session 持久、裝置綁定、不 sync）與原案完全相同，只是 mechanism 不同。Phase 1 MVP 用瀏覽器原生 PDF viewer 的 `#page`；Phase 2 換 bundled PDF.js（D8）。

### D7 — `LocalPdfButton` 由 caller 放在 `<details>📖 詳解</details>` **之上**（Explanation 保持零改動）
`Explanation` 維持完全 content-agnostic（**無** render-prop、零改動）。各 caller（`QuizModal` / `MockExamRunner` / `QuestionBankPage`）在 `{q.explanation && (...)}` 內、`<details>📖 詳解` collapsible **上方**渲染 `<LocalPdfButton questionId={q.id}/>`。button self-gating（unsupported / unmapped → render null）。

**Placement（2026-06-26 owner 兩輪回饋定案）**：按鈕在 詳解 collapsible **之外、之上**——玩家**不必展開 詳解**就能看到並直接點，許多人就是想直接跳原始詳解。**Alternatives 否決**：(a) 放 Explanation 內最上面（仍要展開 詳解 才看得到，owner 第二輪否決）；(b) 放詳解底部（圖多要捲很久，owner 第一輪否決）；(c) render-prop 注入 Explanation（已 revert — 既然移到 details 外，Explanation 不需任何 prop，更 content-agnostic）。

### D8 — Phase 2 bundle PDF.js 自渲染（不信 OS webview 內建 viewer）
macOS WKWebView 的 `#page` fragment 不可靠（Win WebView2 才穩）；bundled PDF.js 兩 OS 一致且可捲到 bbox 區域。Phase 1（瀏覽器）可暫用原生 viewer，Phase 2（Tauri）必 bundle PDF.js。

### D9 — macOS NFC/NFD CJK 檔名匹配
檔名是中文；macOS 檔系統常存 NFD、map JSON 多為 NFC → `getFileHandle(exactName)` 可能 miss。做法：**列舉資料夾實體檔名 + 兩邊 `.normalize('NFC')` 再比對**，不用 `getFileHandle` 直查。

## Risks / Trade-offs

- **FSA 僅 Chromium 桌面** → Safari / Firefox / 手機看不到按鈕。**Mitigation:** `getStatus()` 偵測能力 → 不支援就不顯示，退回 inline（D7）；Phase 2 Tauri 解跨平台。
- **macOS NFC/NFD 檔名 miss** → 按鈕找不到檔。**Mitigation:** D9 normalize 雙邊；找不到時 button 顯示「找不到對應 PDF（確認資料夾 / 檔名）」而非靜默失敗（No Silent Errors）。
- **玩家下載的 PDF 檔名與 manifest `sourcePdf` 不符**（陽明改檔名 / 玩家自行改名） → mapping miss。**Mitigation:** 按實體檔名 NFC 比對；提供「重新選資料夾」+ 預期檔名清單提示；map 帶 `v1` 版本可日後加 fuzzy / 別名表。
- **map 與 manifest 漂移**（content rebuild 後沒重跑 builder）。**Mitigation:** builder 列入 content build 流程或加 CI 檢查；map 帶 `builtAt` / 來源 manifest hash。
- **WKWebView `#page` 不可靠**（Phase 1 若在桌面 webview 跑）。**Mitigation:** Phase 1 鎖定瀏覽器情境；桌面渲染留給 Phase 2 PDF.js（D8）。
- **Phase 2 散布成本高**（Apple Developer $99/yr + notarize；Windows SmartScreen；GH Actions matrix，Win 不能在 Mac 交叉編譯）。**Mitigation:** 列為 gated 決策（OQ1），Phase 1 先用半天 FSA 踐石驗 UX，再決定是否投 3–4 週。

## Migration Plan

- **Phase 1 deploy**：純加法（新 builder + map JSON + `src/platform/` + `LocalPdfButton` + Explanation optional prop）。零 Dexie / R2 / sync 改動 → 走既有 CF Pages pipeline（`pnpm deploy:cf`）正常上線。**Rollback** = caller 不傳 `renderProvenanceAction`（按鈕消失），或移除 builder 產物；無資料風險。
- **GATE（Phase 1 → Phase 2）**：FSA 踐石上線 + owner 試用後，決定是否投 Tauri「可下載產品」。
- **Phase 2**（若 GO）：可能拆**獨立 OpenSpec change**（Tauri 殼 + Rust fs adapter + bundled PDF.js + 簽章 / notarize / CI matrix）。本 change 不含。

## Open Questions

1. **OQ1（GATE）— 是否投 Phase 2 Tauri 可下載產品？** 取決於 owner 試用 Phase 1 踐石後對 UX 的判斷 + 是否願意吞簽章 / notarize / CI 成本。**Phase 1 上線前不決。**
2. **OQ2 — 玩家如何取得「正確的 PDF 集」+ 資料夾結構期待？** 全部 44 檔放單一平資料夾？分年子資料夾？需在 grant 流程給明確指引 + 預期檔名清單。Phase 1 apply 時定。
3. ~~**OQ3 — map 放哪？**~~ **RESOLVED（D3b，inbox repo-hygiene 對齊）**：builder 在 `prebuild`/`predev` 從 manifest 產出 `public/provenance/question-pdf-map.v1.json`，該路徑 gitignore、deploy 重生，不手 commit。
4. **OQ4 — Phase 1b 是否提前 bundle PDF.js？** MVP 先用瀏覽器原生 viewer 最省；若原生 `#page` / 捲動到 bbox 體驗不足，可在 Phase 1b 提前引入 PDF.js（與 Phase 2 共用）。視踐石體驗定。
