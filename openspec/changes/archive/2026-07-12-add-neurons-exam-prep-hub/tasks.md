## 1. Nav 收合（題庫 group 3→2）

- [x] 1.1 `App.tsx` `SUBTAB_GROUPS.bank`：移除 `{to:'/cram/handout', label:'考前講義'}` entry；把 `{to:'/cram', label:'考前猜題'}` 的 label 改為 `考前中心`。`BANK_GROUP_PATHS` 不動（`/cram` prefix 已用 `startsWith` 涵蓋 `/cram/handout`、`/cram/5min`）。
- [x] 1.2 確認 route 表不動：`/cram/handout`、`/cram/5min` 的 outside-AnimatedRoutes 真 mount + placeholder 維持原樣，講義/速看 portal + 所有 deep-link 直接命中不受影響。
- [x] 1.3 驗證題庫 top-nav tab 在 `/cram`、`/cram/handout`、`/cram/5min` 都維持選中；subtab bar 只剩 題庫 + 考前中心 兩顆 pill。（瀏覽器實測 subtab = 題庫+考前中心）

## 2. 共用 rescue-chip selector（DRY 抽取）

- [x] 2.1 把 `OverviewPage.tsx` 的 `rescueChipByFamily` inline useMemo 抽成共用 hook `lib/services/rescue/useRescueChips.ts`（輸入 rescuePlans / questions / conceptTags / questionHistory，輸出 `Map<familyId, {d, score}>`）。
- [x] 2.2 `OverviewPage.tsx` 改 import 共用 hook、刪 inline 版本；清 4 個 orphan import（computeRescueD / computeConceptMastery / computeRescueScore / buildConceptYield）；行為零改變（瀏覽器實測首頁 chip 正常）。

## 3. 考前中心 hub 版面重排（`CramPage.tsx`）

- [x] 3.1 救急狀態條（頂）：`useRescuePlans()` + 共用 selector；每 active plan 顯示 family 名 + `D-x/考試日 · RescueScore N`；無 plan → 「建立考前救急」入口。
- [x] 3.2 11 科目卡 grid（依 `cram.books[]` 分 醫學一/醫學二），每卡 = 科名 + 救急 chip(if active) + 考古/速看 count + 講義(beta) mini；單選展開該科既有 panel（速看 + practice CTA + 考古清單，內容不變）；預設第一科。
- [x] 3.3 5min 一級卡（科目卡群下方）→ `navigate('/cram/5min')`，無 picker/設定。
- [x] 3.4 PDF 3 連結沉底；honesty header / disclaimer / 版本 stamp 保留。
- [x] 3.5 科目卡 grid RWD（`repeat(auto-fill, minmax(130px,1fr))`）；瀏覽器實測 11 卡 grid 正常。

## 4. 救急就地進場（hub 內 mount RescueScene）

- [x] 4.1 CramPage 本地 `openRescue(familyId?)` state + mount `<RescueScene pack initialFamilyId onClose>`（重用 global store → 同一 plan）；狀態條 / 科目卡 / leaf 救急鍵點擊開同一 overlay，不 navigate、不 route 化。
- [x] 4.2 **刻意不加** CramPage `?rescue=` return-loop consumer（MVP 無 producer 產 `/cram?rescue=`；唯一 producer 是講義「← 回救急」= `BASE_URL?rescue=` → 首頁，per `neurons-single-subject-rescue` 既有 SHALL）。**不改** 講義 full-nav（`HandoutPage.tsx:399-413`）——MVP 接受落首頁（design D2/R2；origin-aware return 為 deferred Open Question）。
- [x] 4.3 `/` 與 `/cram` 不同時 mount（AnimatePresence）→ 任一時刻只一個 RescueScene；瀏覽器實測無雙 mount 衝突、無 console error。

## 5. leaf context 小工具列

- [x] 5.1 **cram 押題 item = full toolbar**：看講義（`?subject=&leaf=`）｜練題（既有 practice pool）｜救急狀態（family-level chip，if active plan → 本地 openRescue）。**handout 端沿用既有「本單元猜題」reverse-link 當 gateway**（HandoutPage 未改；迴路「紅chip→講義 topic→本單元猜題→cram push item full toolbar」已閉合，瀏覽器實測 79 條 reverse-link 在）。救急狀態只顯示 family 級 chip、不染 per-leaf 戰情圖進講義。
- [x] 5.2 四個動作 target URL 沿用既有格式（byte-identical），無新 param 格式、無新持久化。

## 6. Banner repurpose

- [x] 6.1 `RescuePromoBanner.tsx` repurpose 成考前中心 hub 導引 banner（🎯 EmojiIcon + 「考前中心：猜題・講義・救急・五分鐘速看」+ 「前往考前中心」→ `navigate('/cram')`）；dismiss key v1→v2；改用 `useNavigate`（去 onOpen prop）。
- [x] 6.2 OverviewPage 用法同步改 `<RescuePromoBanner />`；首頁救急 CTA / FamilyPicker header 考前救急 / `?rescue=` return-loop 全不動（瀏覽器實測 header entry 正常）。

## 7. Deep-link 不回歸驗證（invariant）

- [x] 7.1 client-side nav：`講義(beta) → /cram/handout?subject=解剖學` 落對且 handout 完整 render（8 region / 76 topic / 79 本單元猜題 reverse-link / 92K 內文非空白）。`from=rescue` gate 正確（非 from=rescue 時「回救急」未顯示）。
- [x] 7.2 prod-equivalent：`/cram` 直接 URL + reload render 正常；`/cram/handout?subject=` client-nav 命中；banner `navigate('/cram')` 首頁非 root、無 basename blank。（dev 全綠；prod SPA 三件套留 verify/部署後複驗）

## 8. 設計語言對齊（owner 追加）+ 驗證收尾

- [x] 8.1 hub 所有 UI emoji 走 `<EmojiIcon>`（📖/🎯 mapped→pixel-art 對齊 FamilyPicker/homepage）；救急元素用 canonical rescue palette（#fdf2e0/#d4a04d/#8a5a1f）mirror homepage RescueChip。
- [x] 8.1b **生 3 個 pixel-art emoji asset**（codex `gpt-image-2`，64×64 ≤16色透明，風格對齊 pack）：`23f1.png`(⏱救急)/`270f.png`(✏練題)/`23f3.png`(⏳5min) + 加 3 行 `emoji-icons.ts` manifest（bare codepoint）。瀏覽器實測：hub 的 ⏱/✏/⏳/📖/🎯 全 `<img>` pixel-art；**homepage 的 ⏱ fallback 一併修好**（共用 manifest → `23f1.png`，HTML 內 0 raw ⏱ glyph）。
- [x] 8.2 `pnpm -r typecheck` clean；`pnpm --filter @study-rpg/neurons-tw test` = 1149 綠。
- [x] 8.3 零 schema/零 sync 確認：無 Dexie `.version()` bump、R2 `SCHEMA_VERSION` 維持 28、無 `SYNCED_META_KEYS` diff、HandoutPage / 講義 content build 未動；清了 6 個 orphan style + `.cram-action-*` CSS。
- [ ] 8.4 `/verify`（dead-code audit + `/simplify`）+ prod 部署後 SPA 三件套複驗（archive/部署後）。
