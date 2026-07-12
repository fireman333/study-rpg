## Context

neurons-tw 的四個考前 surface 目前分散：`/cram`（考前猜題，`src/routes/CramPage.tsx`）、`/cram/handout`（考前講義，`HandoutPage.tsx`，portal scene）、`/cram/5min`（五分鐘速看，`SpeedReviewPage.tsx`，portal scene）、RescueScene overlay（考前救急，`components/RescueScene.tsx`，入口在 `routes/OverviewPage.tsx` header + `RescuePromoBanner.tsx`）。底層三系統已用 canonical leafId 打通交叉連結（`neurons-unit-correspondence`），但 UI 入口仍碎片化。

現況關鍵 handle（來自 code map）：
- nav：`App.tsx` `SUBTAB_GROUPS.bank`（3 項：`/bank` 題庫、`/cram` 考前猜題、`/cram/handout` 考前講義）+ `BANK_GROUP_PATHS = ['/bank','/cram']`（`startsWith` 判 active）+ `SubTabLayout`。
- CramPage 現況 flat 版面：action row（3 PDF 下載 + 講義/5min 兩個入口 button）→ honesty header → **單選 subject filter-chip row** → 單科 panel（速看 blocks + section-practice CTA + 考古清單 drawer）。
- 救急資料：`useRescuePlans()`（`lib/services/rescue/rescue-store.ts:737`，回 `RescuePlan[]`，global store，多科並存）；`rescueChipByFamily` 目前 **inline useMemo 在 `OverviewPage.tsx:261-274`**；`openRescue(familyId?)`（`OverviewPage.tsx:417`）+ `?rescue=` return-loop（`OverviewPage.tsx:428-436`）；RescueScene 只 mount 在 OverviewPage（`:940`）。
- 四條 deep-link（invariant）：救急chip→講義leaf（`RescueScene.tsx:340-379` `openConceptHandout`）、押題→講義leaf（`CramPage.tsx:244-254`）、速看→講義科目（`CramPage.tsx:208`）、講義topic→押題 reverse（`HandoutPage.tsx:225-296` → `navigate('/cram?subject=&push=')`）。講義「← 回救急」是唯一 BASE_URL full-nav（`HandoutPage.tsx:399-413`，避開 basename trap）。

約束：零 schema / 零 sync（R2 SCHEMA_VERSION 28、無 Dexie bump、無 SYNCED_META_KEYS diff）；RescueScene 維持 overlay、不 route 化；講義 build leaf-anchor gate + region drift check 不動；四條 deep-link target URL 字串維持 byte-identical。

## Goals / Non-Goals

**Goals:**
- 題庫 group subtab 3→2（題庫 + 考前中心 `/cram`），消 label soup。
- `/cram` 重排為 subject-led 考前中心 hub：救急狀態條 → 11 科目卡（各帶講義/猜題 mini）→ 5min 一級卡 → PDF 沉底。
- 救急在 hub 內「狀態條 + 可點進場」（開同一 RescueScene / 同一 global plan）。
- leaf context 小工具列（看講義｜本單元猜題｜對應練題｜救急狀態），把「紅chip→講義→本單元猜題」收成迴路。
- RescuePromoBanner repurpose 成考前中心 hub 導引 banner。
- 全部既有 deep-link 一條不斷。

**Non-Goals:**
- 不做同畫面 mode-switcher（診斷/講義/猜題/練題）作主架構。
- 不把救急戰情圖紅黃灰狀態視覺染進講義（device-local vs 全裝置一致）。
- 不把 leaf 單元卡做成首頁主瀏覽（68+ 卡牆）。
- 5min 不做成可選科/可設定。
- 不改 RescueScene 內部、不 route 化 overlay、不動任何 sync/schema。
- 不改講義 content build / leaf-anchor gate。

## Decisions

### D1 — 新增 `neurons-exam-prep-hub` capability，而非全塞進 `neurons-cram-tab`
考前中心 hub 消費並統合四個 surface（cram + handout + speed-review + rescue），語意上是新的 consolidation 層，不只是 cram。故 hub 的外層 composition（救急狀態條、科目卡排序、5min 一級卡、leaf 工具列、hub banner）進新 capability `neurons-exam-prep-hub`；只有「/cram 本身的 subtab 命名 + 科目內容呈現」屬 cram-tab 既有職責，走 MODIFIED。**Alternative**：全部 MODIFIED 進 cram-tab — 否決，會讓 cram-tab spec 混入 rescue/5min/handout 職責、邊界糊掉。

### D2 — 救急「可點進場」= 在 CramPage hub 就地 mount `<RescueScene>`（重用 global store），不 route 化
`useRescuePlans` / RescuePlan store 是 global，OverviewPage 與 CramPage 讀到的是**同一批 plan**（「同一 plan」成立）。hub 救急狀態條點擊 → 本地 `openRescue(familyId)` state → mount 同一個 `RescueScene` overlay（portal to body）疊在 hub 上。`/` 與 `/cram` 不同時 mount（AnimatePresence），無雙重 mount 疑慮。
- **Alternative A**：把 RescueScene 提升到 App level 全域單例 — 否決（要動 OverviewPage 既有 mount + open-state，risk 高、超出 MVP）。
- **Alternative B**：hub 狀態條點擊改 full-nav 回 `/` 開救急 — 否決（離開 hub，違反 owner 選的「可點進場」）。
- **已知取捨（見 Risk R2）**：從 hub 開救急 → 進講義 → 點「← 回救急」，因該按鈕是 load-bearing BASE_URL full-nav 導向 `BASE_URL?rescue=`（＝首頁 `/`），會落在**首頁**的 RescueScene 而非 hub。MVP 接受此不一致、**不動** full-nav（它是防 basename blank-page 的 load-bearing 修正）。origin-aware return 列 Open Question。

### D3 — 抽 `rescueChipByFamily` 計算成共用 selector，供 hub 與首頁共用
現況 inline 在 `OverviewPage.tsx:261-274`（依賴 `buildConceptYield`/`computeConceptMastery`/`computeRescueScore`/`computeRescueD`/`conceptTags`/`questionHistory`）。hub 救急狀態條要一樣的 per-family `{ d, score }`。抽成共用 hook（例 `lib/services/rescue/useRescueChips.ts` 或同層 selector），OverviewPage 改 import、CramPage 新 import。**Alternative**：CramPage 複製一份計算 — 否決（~14 行非 trivial 計算重複、日後易 drift；DRY 抽取屬合理 surgical 重構，零行為改變）。抽取後首頁救急 chip 行為必須不變（verify 涵蓋）。

### D4 — 科目卡 = picker into 既有單科 panel；卡片額外帶「講義 mini」first-class 入口
每張科目卡：科名 + NT-branch accent + 講義(beta) mini（subject-scoped deep-link `/cram/handout?subject=…`，即現 `CramBlockView.onOpenHandout` 的 target；label 去「考前」前綴、single owner = `neurons-anatomy-handout`）+ 猜題/速看 access。點卡 → surface 該科既有 panel（速看 blocks + 考古清單 drawer + section-practice CTA，`neurons-cram-tab` content reqs **不變**）。這把 cram-tab 現有的「單選 filter-chip」picker 換成 card grid picker，但保留全部 content 語意。**Alternative**：卡片內 inline 展開全部內容（accordion 卡牆）— 否決（回到卡牆問題 + 重複講義結構）。

### D5 — leaf context 小工具列純架在既有 query-param deep-link 上，零 schema，浮在**落點側**
**Apply 揭露的精化**：full toolbar 放 **cram 押題 item**（看講義 `?subject=&leaf=`｜練題 既有 practice pool｜救急狀態 = family-level chip，經共用 selector / 本地 `openRescue`）。**handout 端不補全 toolbar**——沿用既有「本單元猜題」reverse-link（`?subject=&push=`）當 gateway 進 cram 押題 item 的 full toolbar，迴路「紅chip→講義 topic→本單元猜題→cram push item(full toolbar)」已閉合。理由：在 handout portal scene 塞 QuizModal + 把 `?rescue=` 導首頁 = 高風險低價值，且會動到 fragile 的 imperative reverse-link 注入（已 ship deep-link 命脈）。**HandoutPage 因此不改**。無新 persistent state、無新 param 格式。**不動 RescueScene 戰情圖 chip 的 handler**。**救急狀態只顯示 family 級 chip，永不把 per-leaf 紅黃灰 band 染進講義內文**（救急 device-local vs 講義全裝置一致，per Fable 8 點收斂之「反戰情圖狀態染進講義」）。

### D6 — nav 3→2 的最小改動
- `App.tsx` `SUBTAB_GROUPS.bank`：移除 `{/cram/handout, 考前講義}` entry + 把 `{/cram, 考前猜題}` label 改為 `考前中心`。
- `BANK_GROUP_PATHS` **不動**（`/cram` prefix 已用 `startsWith` 涵蓋 `/cram/handout`、`/cram/5min`）。
- route 表（`/cram/handout`、`/cram/5min` 的 outside-AnimatedRoutes 真 mount + placeholder）**不動** — 講義/速看仍走原 portal，deep-link 仍可直接命中。

### D7 — RescuePromoBanner repurpose = implementation-only，spec 由新 hub capability 輕描述
banner 無既有 spec requirement，改文案 + 導向到 hub 屬實作改動。新 hub spec 加一條輕 requirement 給它 spec home（存在 + 指向 hub + 不再重複救急入口）。首頁救急 CTA / FamilyPicker header 入口 / `?rescue=` return-loop 全不動。

## Risks / Trade-offs

- **R1 — 抽 `rescueChipByFamily` 動到 OverviewPage 既有 working code** → Mitigation：純 extraction、零行為改變；verify 場景涵蓋「首頁 11 科卡救急 chip 仍正確 render」。
- **R2 — hub 開救急 → 講義 →「回救急」落首頁而非 hub**（D2 取捨）→ Mitigation：MVP 接受；不動 load-bearing BASE_URL full-nav；列 Open Question 供 follow-up。
- **R3 — 四條 deep-link target URL 若被重排誤改字串 → 交叉對應斷**（回歸剛 ship 的 unit-correspondence）→ Mitigation：不碰 deep-link 呼叫點的 URL 字串；verify **必含 client-side nav 場景**（四條全跑 + F5 + 直接 URL），不只驗直接 URL。
- **R4 — CramPage 就地 mount RescueScene 造成雙 portal / 狀態衝突** → Mitigation：global store 共用、`/` 與 `/cram` 不同時 mount；verify 確認任一時刻只一個 RescueScene 可見、救急 answering QuizModal 正常。
- **R5 — 科目卡 grid RWD（11 卡）在手機擠壓** → Mitigation：沿用既有 pixel 卡片 RWD pattern；verify 跑 390px 無橫向 scroll。

## Migration Plan

- 純 client-side UI 改動，走既有 CF Pages pipeline（`deploy-cf-pages.yml` on main push）。
- 零 schema / 零 sync → **rollback = revert commit**（無 DB migration、無 R2 SV bump，trivially reversible）。舊 client 與新 client 無資料格式交集問題。

## Open Questions

- **回救急 origin-aware return**（R2）：MVP 落首頁；是否要讓從 hub 開的救急、講義「回救急」回到 hub context（需傳 route origin + CramPage 端 `?rescue=` return-loop）？→ follow-up 決定，非 MVP。
- **科目卡確切內容**：卡片是否也顯示該科救急 chip（active plan 時）？講義 mini + 猜題 mini 的視覺層級？→ apply 階段定。
- **leaf 工具列精確觸發點 + 手機呈現**：掛在 topic / 押題 item / 紅chip 的哪個互動、桌機 inline vs 手機 sheet？→ apply 階段定。
- **per-surface pixel accent 系統**（Fable 建議：講義綠/5min金/救急紅升格正式 accent）→ 非 MVP，defer。
