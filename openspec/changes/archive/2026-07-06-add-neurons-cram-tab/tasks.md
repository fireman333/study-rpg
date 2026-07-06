# Tasks — add-neurons-cram-tab

> **前置依賴已滿足**：`add-neurons-concept-tags` 已 ship 到 prod（2026-07-06）。速看內容 = 11 科 committed HTML fragments（`packages/content-neurons-tw/src/cram/fragments/`）；A4 PDF committed 於 `src/cram/pdf/`。
> **設計鎖定**（design D6 完全開放無門檻 · D7 主動 on-ramp evidence-first）。**Phase 1 資料管線經 Codex adversarial review + 修 3 bug（見下）。**

## 1. Cram data + build products

- [x] 1.1 cram typed source 資料模型 `src/cram/cram-types.ts`（速看 block union + 押題 item；**押題帶 sourceQuestionIds、速看 self-contained**）。
- [x] 1.2 `scripts/build-cram.ts` 解析 11 fragments → 速看 blocks（**多 content-node per block**，修 Codex HIGH bug；colspan-aware；`必中考古` heading 保留）。
- [x] 1.3 押題 items 由 `concept-recurrence.json`（eligible、tier、raw sitting-breadth）+ `sourceQuestionIds` 反查 `concept-tags.json`（recent-first、cap 12；微生/免疫 segment alias）。
- [x] 1.4 build 生成獨立 `dist/cram.json`（80 blocks / 493 押題）；lazy-fetch，不進 getContentPack。
- [x] 1.5 validator `scripts/verify-cram.ts`：押題 sourceQuestionIds ∈ questions.json（4809/0 missing）+ **content-loss guard**（blocks==fragment nodes）+ **alias-safety guard**（disjoint + 0 dual-tagged）+ honesty lint（**押題-scoped**）。
- [x] 1.6 PDF = **Option 1**：committed source PDF → `copy-content.mjs` → `public/content/neurons-tw/cram-pdf/`（served under `content` assetDir；**不依賴 iCloud**，CI-safe）。

## 2. UI: subtab + CramPage

- [x] 2.1 App.tsx `bank` group（`/bank` + `/cram`）+ SubTabLayout + 頂 nav GroupNavLink 高亮；`/bank` 預設。
- [x] 2.2 `routes/CramPage.tsx`：醫學一/醫學二分區、accordion 單開、押題-先-速看-巢狀、手機 sticky 快跳、常駐 disclaimer + ⓘ方法論 + 「統計至 115-1」戳。
- [x] 2.3 押題 item：raw counts「23 次考試出現 N 次」+ tier chip（降溫明標）；禁用詞 0。
- [x] 2.4 速看 blocks（kernel/kw/disc/num/skeleton）pixel 主題化 + inline `<b>` + table overflow-x wrap。
- [x] 2.5 押題 **evidence-first drawer**：count chip → raw count + tier + recent-first read-only QuestionReviewCard mini-list；PDF panel 只由明確鈕開。

## 3. cram → game 主動 on-ramp（D7）

- [x] 3.1 押題 drawer 內嵌「▶ 答 1 題看看」→ 既有 `QuizModal` practice mode（concept-filtered pool）。
- [x] 3.2 每科速看 section 底部 ONE「▶ 用本章高頻概念練幾題」CTA（非 per-row）。
- [x] 3.3 wrong→出征：practice mode 既有行為答錯記入錯題本（不影響養成）；未登入可答。
- [x] 3.4 反面清單守則落實（rendered page 0 禁用詞；無強制註冊/藏重點/hype/streak 焦慮）。

## 4. 一鍵下載 PDF + deploy 資源

- [x] 4.1 CramPage 下載鈕 → 直接下載既有 A4 PDF（prod HEAD 200 application/pdf 2.35MB）。
- [x] 4.2 資源全在 `public/content/neurons-tw/`（`content` 已在 assetDirs）→ **無需改 build-cf-pages allowlist**。
- [x] 4.3 deploy workflow 走 `content` assetDir，自動含 cram.json + PDF。

## 5. Verify

- [x] 5.1 content-pack typecheck + `verify:cram` PASS + app typecheck + **826 app tests 全綠**（regression clean）。
- [x] 5.2 preview e2e（dev）：subtab、accordion 單開、押題誠實文案/tier/戳、count chip → evidence drawer + QuestionReviewCard、**「答 1 題看看」開 practice QuizModal**、速看 blocks（7 tables + bold）、section CTA。
- [x] 5.3 SPA（localhost）：直接 URL `/cram` ✓、F5 on `/cram` ✓、`/bank` 直接/F5 ✓。（in-app subtab 動畫 swap 在 backgrounded preview tab 被 rAF throttle，非 bug——見 chrome_mcp_raf_throttle；foreground 正常。）
- [x] 5.4 手機 RWD 390px：無橫向捲、sticky 快跳、7 tables 全在 overflow-x wrapper。
- [ ] 5.5 **prod smoke（deploy 後）**：`fetch()` `cram.json` + PDF 於 prod `/neurons/` base 確認非 index.html catch-all；`/cram` F5 於 prod 不 404。**未做：需先 merge→deploy。**
- [x] 5.6 誠實性 lint：verify:cram 押題-scoped 0 命中；rendered page 0 禁用詞；押題帶版本戳。
