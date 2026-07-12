# Tasks — 考前救急 → 考前講義 deep-link 整合（MVP，含返回導航）

## 1. Resolver（pure helper + test，先做）

- [x] 1.1 新增 pure helper `resolveLeafToRegion(chapterQuizzes, leafId): { regionId: string; isChapter: boolean } | null`（`apps/neurons-tw/src/lib/handout-regions.ts` 或近似）。region-keyed（`memberRegionIds` 長度 1）回 `{ memberRegionIds[0], isChapter:false }`；chapter-keyed（長度 >1）回 `{ memberRegionIds[0], isChapter:true }`（章首，**非** `cq.regionId`）；找不到含該 leaf 的 chapterQuiz → 回 `null`。subject-agnostic（呼叫端先選定 subject 的 chapterQuizzes 才傳入）。
- [x] 1.2 Vitest `handout-regions.test.ts` 四 case：region-keyed 1:1 → memberRegionIds[0] + isChapter false；chapter-keyed 多 region → memberRegionIds[0] 章首 + isChapter true；無解 leaf → null；跨科 scoping（同名 leaf 傳入不同 subject 的 chapterQuizzes 各自解析、不誤跳）。

## 2. Loader robustness（先於 UI 消費）

- [x] 2.1 `apps/neurons-tw/src/lib/handout.ts`：`loadHandout` 的 `.catch` 內 `inflight = null`（reset）後再 `return null`，讓失敗後的重試不被 cached-null promise 卡死（surgical；新增救急端 consumer 依賴 retry 語意）。既有成功路徑不動。

## 3. HandoutPage 端（deep-link 入口 + race 修 + 落點 highlight + 返回鈕）

- [x] 3.1 `HandoutPage.tsx`：`subjectId` state 改用 `useState<string | null>(() => new URLSearchParams(location.search).get('subject'))` 同步 initializer 讀 `?subject=`（race 修：首次以正確 subject derive regions；consume-once `deepLinkConsumedRef` 邏輯不動）。未帶 `?subject=` 時行為與現況一致（fallback subjects[0]）。
- [x] 3.2 `HandoutPage.tsx`：deep-link（`?section=`）解析並 `jumpTo` 落點後，對目標 region 加短暫 highlight class、~2s 後移除（純視覺、零狀態；不用 CSS `:target`）。加對應 CSS。
- [x] 3.3 `HandoutPage.tsx`：當來自救急（以 `?subject=` 存在或 `?from=rescue` 判定 origin）顯示「← 回救急」control → `navigate('/?rescue=' + encodeURIComponent(subjectId))`。非救急來源不顯示（一般講義訪問不變）。
- [x] 3.4 確認 unknown / 無講義 subject（未帶或非法 `?subject=`）不 crash：graceful 落回既有 subjects[0]、deep-link section 找不到就不跳（defensive guard，不新增 UI）。

## 4. OverviewPage 端（返回參數消費）

- [x] 4.1 `apps/neurons-tw/src/routes/OverviewPage.tsx`：mount 時讀 `?rescue=<familyId>` query → `openRescue(familyId)` → `history.replaceState` 清掉該 param（避免 reload / 手動回首頁重觸發）。純既有 `openRescue` + URL param，零持久化、不碰 sync carve-outs。

## 5. RescueScene 端（chip → button + on-click 解析 + 分流 + a11y）

- [x] 5.1 `RescueScene.tsx`：import `useNavigate`；把戰情圖 concept chip（`:800` 一帶，`warSections.map` 內）**全 band** 從 `<span>` 改 `<button type="button">`，保留既有 ‼ mark + 色點 + `title` children；加 `aria-label="開啟講義：<zh>"` + tappable 視覺樣式（紅色較強 affordance）。
- [x] 5.2 On-click handler：in-flight guard（一個解析進行中則忽略後續點擊）→ lazy `loadHandout()`（module-cached，fetch 期間該 chip `aria-busy`）→ 取該 subject（`plan.familyId`）的 `chapterQuizzes` → `resolveLeafToRegion(chapterQuizzes, conceptId)`。**戰情圖 render 時不得 eager fetch handout.json**。
- [x] 5.3 解析成功：`onClose()`（hygiene，設 `rescueOpen=false`）→ `navigate('/cram/handout?subject=' + encodeURIComponent(subjectId) + '&section=' + regionId)`。（安全來自 route unmount，非 callback 順序。）
- [x] 5.4 `resolveLeafToRegion` 回 null（handout 載入正常、無此 region）：戰情圖 inline note「『<zh>』暫無對應講義段落」+ 次要「開啟該科講義」按鈕（navigate `/cram/handout?subject=<subjectId>`、無 `?section=`）。**絕不**導航到誤 region、**絕不** fallback region 0 / subject 0。
- [x] 5.5 `loadHandout()` 回 null（bundle 載入失敗）：可重試的「講義載入失敗」訊息（**不** hang、**不**導向會同樣失敗的 handout top）。與 5.4 的 unresolved-leaf 分流處理。
- [x] 5.6 戰情圖 hint **併進既有 head-row hint line（`RescueScene.tsx:785`）**，補「點概念開講義」語意——**不**新增第二個 hint span。

## 6. Invariant 驗證（零 sync）

- [x] 6.1 Grep 證明零 sync 足跡：RescueScene / HandoutPage / OverviewPage / handout-regions / handout.ts 的 diff **不 import 任何 rescue sync 模組**（`sync/`、`rescue-sync`、`SYNCED_META_KEYS` 等）；R2 `SCHEMA_VERSION` 仍 28；無 Dexie `.version()` bump；`SYNCED_META_KEYS` 零 diff。
- [x] 6.2 確認唯一接觸既有 rescue 路徑 = `openRescue` / `onClose`（既有）+ `localStorage` 只讀 + URL param；未動 `activeRunRef` / blitz-touch defer / matcher / downgrade fence。

## 7. Typecheck + 測試 + 驗證

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean。
- [x] 7.2 `pnpm --filter @study-rpg/neurons-tw test`：新 resolver test + 既有 ~1130 全綠。
- [ ] 7.3 `/simplify`（code-touching）+ dead-code audit。
- [ ] 7.4 `/verify`（Chrome MCP prod-equivalent）：
  - 紅/黃/灰 chip 點擊 → 開正確科正確 region；
  - **返回 loop**：講義「← 回救急」→ 回到該科戰情圖（`?rescue=` 消費後清除）；
  - `?subject=X&section=Y` 直接 URL 可解析捲動；F5 不噴 404 **且落在正確 subject/section**（URL retention）；
  - **deep-link 到非第一科落在正確 region（race 驗證）**；
  - 無解 leaf → inline note + 逃生門、不跳錯科；bundle 載入失敗 → 可重試訊息、不 hang；
  - 跨 chip 快速雙擊不 double-navigate。
  （Post-apply；gated on merge=部署確認。）
