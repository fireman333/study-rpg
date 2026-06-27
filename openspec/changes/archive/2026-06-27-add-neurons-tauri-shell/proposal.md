## Why

「看原始詳解 PDF」目前只能在 Chromium 桌面瀏覽器運作（File System Access API 限定），Safari / Firefox / 行動裝置玩家完全用不到。要讓這個 provenance 功能成為可發佈的離線產品，需要一個跨瀏覽器、可打包的桌面外殼。本 change 是該路線的第一口 spike：把現有 neurons web app 裝進 Tauri 2 桌面視窗、用 Rust 提供唯讀資料夾授權，並把既有 platform adapter 的 desktop 分支接起來——全部只在本機 `cargo tauri dev` 驗證，**不**碰簽章 / CI / 散佈。

## What Changes

- 新增 `apps/neurons-tw/src-tauri/`（Tauri 2 scaffold：`Cargo.toml` / `tauri.conf.json` / `src/main.rs` / `build.rs` / `capabilities/`），把現有 Vite web app 以桌面視窗啟動。
- 新增 root `pnpm` script（`dev:tauri` / `build:tauri`）+ `apps/neurons-tw` 內對應 script，走 `cargo tauri dev` / `cargo tauri build`（本機 only）。
- Vite build 加 `VITE_TARGET` 感知（desktop build 設 `VITE_TARGET=desktop`、`base` 改為相對路徑供 Tauri 載入本地 asset）；web build 行為完全不變。
- 新增 Rust command：玩家挑選自己的 陽明 PDF 資料夾（read-only scope grant），把授權的資料夾根目錄交回前端;後續以該 scope 讀取指定檔案的 bytes。
- 填上 `apps/neurons-tw/src/platform/index.ts` 的 desktop 分支：當 `isDesktop()` 為真時，`getStatus` / `grantFolder` / `openExplanation` / `releaseExplanationUrl` 改走 Tauri 後端，並回傳與 web 路徑**完全相同**的 `OpenResult`（`{ ok, page, url, file }`）契約 — 既有 platform-agnostic 的 `PdfPanelHost` / `PdfDocumentView` viewer 不需任何改動即可重用。
- Bundle PDF.js（沿用已釘死的 `pdfjs-dist 5.4.296` + react-pdf v10）渲染，**不**依賴 WKWebView 內建 PDF viewer 的 `#page`（macOS WKWebView 不可靠）。

**非破壞性**：web build / 既有 prod 部署（`med-study-rpg.com/neurons/`）行為不變;桌面分支只在 `VITE_TARGET==='desktop'` 時啟用。

## Capabilities

### New Capabilities
- `neurons-tauri-shell`: neurons 的桌面外殼 capability — Tauri 2 視窗載入既有 web app、Rust 唯讀資料夾授權、`VITE_TARGET=desktop` 建置目標、desktop 平台對 source PDF 的解析（回傳與 web 同一個 `OpenResult` 契約給平台無關的 PDF viewer 重用）、bundled PDF.js 渲染。

### Modified Capabilities
<!-- 無。現有 provenance viewer 契約（OpenResult {url,page,file}）不變;本 change 只是新增一個滿足該契約的平台後端,不改動既有 spec 行為。 -->

## Impact

- **新增程式碼**：`apps/neurons-tw/src-tauri/`（Rust）;`apps/neurons-tw/src/platform/` 新增 desktop 後端模組（例 `tauriBackend.ts`）並在 `index.ts` 依 `isDesktop()` 分流。
- **建置 / 設定**：`apps/neurons-tw/vite.config.ts`（`VITE_TARGET` / 相對 `base`）、root + app `package.json`（`dev:tauri` / `build:tauri` script）、新增 `.gitignore` 條目（`src-tauri/target/`、`src-tauri/gen/`）。
- **相依**：新增 Rust crate 相依（`tauri` 2.x + `tauri-plugin-dialog` / `tauri-plugin-fs` 視實作而定);前端可能加 `@tauri-apps/api`（+ 對應 plugin JS package）。toolchain 已就緒（`cargo-tauri 2.10.1` / `rust 1.94`）。
- **資料 / 後端**：零影響 — 不動 Dexie schema、不動 R2 / sync / Supabase、不動 questions.json。資料夾授權是 device-bound、絕不進雲端（沿用既有 `folderStore` 隔離原則）。
- **平台限制**：本 spike 僅 macOS 本機 `cargo tauri dev` 驗證;Windows / 簽章 / notarize / CI matrix / 離線 questions.json bundling / `medstudyrpg://` OAuth deep-link 全部 **out of scope**，留待後續 change。
