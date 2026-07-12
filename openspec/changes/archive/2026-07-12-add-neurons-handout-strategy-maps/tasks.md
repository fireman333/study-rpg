# Tasks — 考前講義一週攻略地圖（10 科）+ HelpMenu 說明

## 1. Build 豁免（先做，否則 build fail）

- [x] 1.1 `build-region-quizzes.ts`：加 `NON_QUIZ_REGION_IDS = new Set(['hdt-overview'])`，drift check line 56-57 對其放行（`&& !NON_QUIZ_REGION_IDS.has(rid)`）。

## 2. 生成 + 組裝 10 張攻略地圖

- [x] 2.1 平行 Workflow（一科一 agent，grounded 在該科真實 region 清單 + 解剖學範本）產生 10 個 `hdt-overview` region。10/10 完成、0 error。
- [x] 2.2 逐科人工複審：格式（單 section#hdt-overview + h2 + p，450–650 字）、嵌入醫學錨點正確性、無虛構數字（scan：0 fabricated stat）。
- [x] 2.3 各 prepend 到 `packages/content-neurons-tw/src/handout/<科>.html` 開頭（10 科；idempotent guard）。
- [x] 2.4 修正 honesty lint 命中（胚胎學「年年必考」→「年年都考」）；全 10 科過 banned-word 掃描。

## 3. HelpMenu 說明

- [x] 3.1 `HelpMenu.tsx`：新增「📖 考前講義」section（feature + 一週攻略地圖 + 測驗本區 + 考卷順序），註冊到「題目與複習」category。
- [x] 3.2 把 救急↔講義整合寫進「考前救急」section（戰情圖概念可點開講義）+ 新 section（← 回救急 閉環、診斷→補讀→再測）。

## 4. Build + 驗證

- [x] 4.1 `pnpm run build:neurons-content`：PASS，handout.json 11 科、章測驗數不變。
- [x] 4.2 `pnpm --filter @study-rpg/content-neurons-tw exec tsx scripts/verify-handout.ts`：PASS（7 violation fixtures + happy path）。
- [x] 4.3 typecheck（content pack + app）clean。
- [x] 4.4 Dev smoke（Chrome MCP）：攻略地圖 render 為各科第一 region（微生物學驗證）；HelpMenu 考前講義 section + 整合文案在 DOM。
- [ ] 4.5 Prod smoke（post-deploy）：攻略地圖在 prod 各科開頭 render；HelpMenu 考前講義 section 可展開。（gated on merge=部署確認）
