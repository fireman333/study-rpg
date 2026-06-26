# Tasks — neurons 本機 PDF 原檔功能 (Phase 1 commit + Phase 2 gate)

> Coordination guards (inbox 2026-06-26): `apps/neurons-tw/public/content/**` 是 gitignored build 產物 — 我新增的 `public/provenance/**` 同樣 gitignore、絕不手 commit。commit 時 **explicit per-file `git add`**，絕不掃進別 session 的 `eliminate-cross-device-r2-412-storm/tasks.md`、`sync/` 檔、或 untracked public webp。`Explanation.tsx` 是共享檔（table-images 圖片渲染已 merge）→ apply 前先讀現況、additive 疊。

## 0. Pre-flight — 讀共享檔現況

- [x] 0.1 讀現行 `apps/neurons-tw/src/components/Explanation.tsx`（table-images 版）+ caller（`QuizModal` / `MockExamRunner` / `QuestionBankPage`）。接縫：Explanation 收 `question` Pick + `textStyle`；additive 加 optional `renderProvenanceAction`、append 在 body+tail 後、保留 no-action/no-tail 的 early-return。
- [x] 0.2 manifest 路徑確認 `packages/content-neurons-tw/explanation-figures/manifest.json`（builder 讀）。⚠️**修正**：Dexie `meta` table `MetaRow.value` 型別是 `string`，**裝不下 FileSystemDirectoryHandle 物件** → 改用獨立 device-local IndexedDB store（非 synced Dexie db、零 schema bump），見 §2.2。

## 1. Provenance map builder（地基，先做最划算）

- [x] 1.1 `apps/neurons-tw/scripts/build-provenance-map.mjs`：讀 manifest → 產 `{version,sourceHash,count,entries:{questionId:{file,page}}}`，跨頁取 **min page**，stable key order + manifest sha256（**deterministic，無 wall-clock builtAt** → 不 churn）。`file` = manifest `sourcePdf` 原字串。印 mapped/skipped/total。
- [x] 1.2 builder 掛進 `package.json` `prebuild`/`predev`（接在 `copy-content.mjs` 後）+ 加 `build:provenance-map` script；`apps/neurons-tw/.gitignore` 加 `public/provenance/`（D3b）。
- [x] 1.3 驗證：`mapped 1128 / skipped 0 / total 1128`、每筆 `file` 為 `*.pdf`、0 筆缺 file/page、36 題 multi-page→min、output `git check-ignore` 確認 ignored。

## 2. Platform adapter（web FSA 實作）

- [x] 2.1 `src/platform/index.ts` adapter：`isDesktop()`（讀 `VITE_TARGET`）/ `isLocalPdfSupported()` / `getStatus()` / `grantFolder()` / `openExplanation()` / `hasProvenance()`；`types.ts`（ProvenanceEntry/MapFile/PlatformStatus/OpenResult）+ `fsa-permissions.d.ts`（WICG queryPermission/requestPermission/showDirectoryPicker/entries 補型別）。
- [x] 2.2 web FSA 實作：`grantFolder()` = `showDirectoryPicker({mode:'read'})` → handle 存 **獨立 device-local IndexedDB**（`folderStore.ts`，非 synced Dexie、零 schema bump）；`getStatus()` 偵測 FSA + queryPermission（不 prompt）。picker 取消 → 不改 state。
- [x] 2.3 NFC 檔名匹配（D9）：`provenance.ts` `findByNfcName` 列舉資料夾實體檔名 + 兩邊 `.normalize('NFC')` 比對（不用 `getFileHandle(exactName)` 直查）。
- [x] 2.4 開檔跳頁：`provenance.ts` lazy-fetch + cache map → lookup → `getFile()→createObjectURL`→`window.open(blob#page=N)`；找不到檔 → `{ok:false,reason:'file-not-found',message}`、error → `{reason:'error'}`（No Silent Errors，不 throw）。

## 3. UI wiring

- [x] 3.1 `LocalPdfButton.tsx`：self-gating（`isLocalPdfSupported() && hasProvenance` 才 render，否則 null）；點擊 → `openExplanation`（含未授權→`grantFolder` 流程）；file-not-found / permission-denied / error → inline note；no-folder（玩家取消）→ 不嘮叨。
- [x] 3.2 `Explanation.tsx` **維持零改動**（content-agnostic，無 render-prop）。〔owner placement 回饋後 revert：按鈕移到 details 外，Explanation 不需 prop — D7〕
- [x] 3.3 三個 caller（`QuizModal` / `MockExamRunner` / `QuestionBankPage`）在 `{q.explanation && ...}` 內、`<details>📖 詳解` collapsible **上方**渲染 `<LocalPdfButton questionId={q.id}/>`；**不必展開詳解即可見**；button 自身 gate 支援平台 + mapped，否則 render null（優雅降級）。

## 4. Tests + verify

- [x] 4.1 unit tests `local-pdf-provenance.test.ts`（11）：NFC 匹配（NFD↔NFC + CJK + no-match）、`lookupEntry`、`loadProvenanceMap`（fetch once+cache / !ok→null / throw→null）、優雅降級（無 FSA→unsupported / 支援但 unmapped→unmapped）、folderStore save/load/clear round-trip。builder coverage 經 §1.3 run-assertion（1128/0/1128，deterministic build script 自檢）。
- [x] 4.2 `pnpm --filter @study-rpg/neurons-tw typecheck` clean + vitest **694 全綠**（+18）+ `lint:dexie-fixtures` OK（無 schema bump）。
- [x] 4.3 `/verify`（Chrome MCP smoke，owner 本機陽明 PDF 端到端）：FSA 偵測 ✓、map fetch v1/1128 ✓、mapped 題（106-2 生化 Q74）出現按鈕 ✓、unmapped 題（104-1 公衛 Q83）無按鈕 ✓、console 乾淨 ✓、**owner 授權資料夾 → 開 `106-2醫學(一).pdf` 跳到正確頁 ✓**。**兩個 live 修正**：(1) **off-by-one** — manifest `provenance.page` 是 0-based（`extract_figures.py` `doc[c["page"]]`），`#page=N` 是 1-based → builder 改 emit `page+1`（root cause 由 code 確認非猜；owner 驗證跳對頁）。(2) **placement**（owner UX 回饋）— action 從詳解底部移到**最上面**（緊接 summary、圖之前），一展開即可一鍵點到（D7 placement note）。

## 5. Spec + ship（Phase 1）

- [x] 5.1 `openspec validate add-neurons-local-pdf-provenance --strict` 通過。
- [x] 5.2 Codex 諮詢（產品決策：增量 ship 1128 vs 全覆蓋 4600 才上）→ verdict **SHIP-NOW**（1128 = 最高價值覆蓋、self-hide 低風險、map 可增量、全覆蓋機會成本高）。採納其建議加一行覆蓋說明（題庫 intro）+ 按鈕 title tooltip。
- [ ] 5.3 commit：**explicit per-file `git add`** 只加本 change 的檔（platform/ + LocalPdfButton + builder + .gitignore + 3 caller + 題庫 intro 文案 + openspec change），跑 `git diff --cached --name-status` 確認不含別 session 的 `tasks.md` / `remove-reading-loop-orphan-spec/` / public 產物（Explanation.tsx 已 revert net-zero）→ merge=deploy gate（owner 確認）→ CF Pages 重生 map + 上線 → prod smoke。

## 6. Phase 2 — Tauri 可下載產品（GATE，本 change 不實作）

- [x] 6.1 **GATE（OQ1）resolved for now**：Phase 1 FSA 踐石 ship（owner + Codex 一致）。**Phase 2 Tauri 可下載產品＝deferred**——不在本 change 實作，待 owner 試用 Phase 1 一段時間後決定是否投（吞 Apple $99/yr + notarize / Windows SmartScreen / GH Actions matrix）；屆時開**獨立 OpenSpec change**（Tauri 殼 + `src-tauri/` Rust fs adapter + bundled PDF.js D8 + 簽章 / CI matrix）。本 change 在 Phase 1 收尾 archive。
