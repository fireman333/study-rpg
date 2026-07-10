## 1. 內容契約：chapterQuizzes（build 時產生）

- [x] 1.1 `HandoutSubject` 加 optional `chapterQuizzes?: { regionId: string; leafIds: string[]; sourceQuestionIds?: string[] }[]`（`packages/content-neurons-tw/src/handout/handout-types.ts` + `apps/neurons-tw/src/lib/handout.ts` 型別同步）
- [x] 1.2 `build-handout.ts` 讀 `dist/concept-recurrence.json` + `dist/concept-tags.json`，加 `existsSync` guard（缺檔 fail、非 silent skip）
- [x] 1.3 授權 8→4 `regionId → chapterId` 對映表（overview 無 quiz）；對 `concept-recurrence.chapters[]` 實際 chapterId 做存在性檢查，未知即 fail
- [x] 1.4 每 region 產 leafIds（`concepts` filter by chapterId + subjectId=解剖學）→ qids（反轉 `concept-tags`），emit 進 `handout.json` 的 `chapterQuizzes`
- [x] 1.5 確認 build step 順序（handout 在 concept-recurrence / concept-tags 之後）；跑 `build:handout` + `copy-content.mjs` 重生 `public/content/neurons-tw/handout.json`，驗 `chapterQuizzes` 存在（4 章：147/171/286/142 qids）

## 2. 版面：側邊導覽 + RWD

- [x] 2.1 `.hdt-scene` flex-column 下加 `.hdt-layout { flex:1; min-height:0; display:flex }`；內含 `.hdt-sidebar { flex:0 0 248px; overflow-y:auto }` + `scrollRef` 容器 `.hdt-scroll { flex:1; min-width:0; overflow-y:auto }`
- [x] 2.2 抽出 `TocList`（sidebar 與 drawer 共用）；移除頂部水平 chip bar（`tocStyle`/`tocChipStyle`）
- [x] 2.3 RWD：`≤1023px` sidebar `display:none` + header「章節」toggle 開左 drawer；`<768px` toggle 改右下 FAB 開底部 sheet
- [x] 2.4 `deriveToc` 的 title 過 `stripLeadingEmoji`；內文章節標題保留 emoji（e2e 驗：8 TOC 標籤已去 emoji、內文 head 仍有 emoji）

## 3. scroll-spy + jump

- [x] 3.1 `IntersectionObserver` root = `scrollRef.current`（非 window）、`rootMargin '-12% 0px -70% 0px'`、`threshold [0,0.1,0.25]`；可見 entry 取最上緣設 active
- [x] 3.2 active TOC 項套 `aria-current="true"`；observer 於 `active.html` / `toc` / `subjectId` 變動時重建（cleanup disconnect）
- [x] 3.3 `jumpTo` 用 `scrollIntoView`（TOC click = smooth）；保留 `.hdt-region { scroll-margin-top }`

## 4. 每章測驗入口

- [x] 4.1 `deriveRegions(html)`：`DOMParser` 一次切 region blocks（`useMemo`，`outerHTML` 保留原標記）；逐塊 render 取代單一 `dangerouslySetInnerHTML`
- [x] 4.2 每塊末尾若 `chapterQuizzes` 有該 regionId → 掛 React「測驗本章」鈕（overview 無 quiz → 不掛；e2e 驗：4 CTA）
- [x] 4.3 複用 CramPage `questionById` 建池路徑；點擊建 `pool: Question[]` → 開 `<QuizModal pool practice creditCramRescue onClose />`（e2e 驗：CTA 開出真題）
- [x] 4.4 fallback：建不出 pool → `navigate('/bank')`（degenerate safety net；主路徑走 pool）

## 5. 一鍵下載 PDF

- [x] 5.1 右上「下載PDF」鈕 → `window.print()`
- [x] 5.2 `@media print`：`.hdt-scene`/`.hdt-layout`/`.hdt-scroll` 還原 `position:static; overflow:visible; height:auto`；隱藏 header/sidebar/drawer/print鈕/測驗鈕/close/progress
- [x] 5.3 print 表格：`table.hdt-tbl` 覆寫回 `display:table`、`thead{display:table-header-group}`；`@page{size:A4; margin:14mm 12mm}`；region/tr/li/p `break-inside:avoid`、region head `break-after:avoid`（print CSS 已就位；實際列印預覽 Safari+Chrome 由 owner 眼驗）

## 6. 閱讀 UX + a11y

- [x] 6.1 進度指示：內部 scroll 位置 `scrollTop/(scrollHeight-clientHeight)`（passive scroll 事件；e2e 驗：50% 位置 → bar 50%）
- [x] 6.2 last-read：`localStorage` key `handout:{subjectId}:scrollTop`，debounce 寫 + subject/render 後還原（e2e 驗：存 20000 → reload 還原 20000；純 device-local）
- [x] 6.3 deep-link：load 讀 `?section=` / `#hash` → 即時 jump（e2e 驗：`?section=hdt-pelvis-perineum` 自動 land + `#hash` 更新）；點 TOC `history.replaceState('#id')`
- [x] 6.4 a11y：open focus close/heading + close 歸還焦點；`Esc` 關；`nav aria-label="章節導覽"`；drawer focus-trap（e2e 驗：drawer 開時 focus 移入）+ backdrop/Esc 關

## 7. 驗證與收尾

- [x] 7.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` 全綠（1126 tests，+6 handout-regions）
- [x] 7.2 dead-code：`tsc --noEmit`（noUnusedLocals）clean，改動無 orphan；`/simplify` 品質過
- [x] 7.3 preview e2e：scroll-spy active（jumpTo 驗）；RWD 三 breakpoint（desktop sidebar / tablet toggle+drawer / mobile FAB+bottom-sheet）；測驗鈕開 QuizModal；deep-link；last-read；drawer focus-trap（print 實際輸出由 owner 眼驗，見 5.3）
- [ ] 7.4 prod SPA 三件套（in-app nav + 直接 URL `/cram/handout` + F5）在 CF Pages 上重跑（post-merge / 對外部署後）
- [x] 7.5 `openspec validate --strict enhance-neurons-anatomy-handout`
