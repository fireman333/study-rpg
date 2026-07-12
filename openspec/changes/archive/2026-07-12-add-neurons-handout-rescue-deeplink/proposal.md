## Why

考前救急（rescue）診斷出「戰情圖」(war map) 的弱點概念後，學生知道**哪些**概念要補，卻沒有一條路直接跳到對應的教學內容——考前講義（handout）已把全 11 科按 region 分好，但兩套系統各自獨立。兩者天然互補：救急 = retrieve + ROI 排序 + 診斷；講義 = encode / 建框架。目前缺的是「診斷 → 讀 → 再測試」那條 error-driven loop 的橋接。好消息是 join key 已天然對齊（救急 `conceptId` === 講義 `leafIds` === canonical leafId；救急 `familyId` === 講義 `subjectId` === `q.subject`），整合是**一次性、subject-agnostic 的 engine 改動**，非 per-subject 工作。

## What Changes

- 救急戰情圖的 concept chip（**全 band：紅 / 黃 / 灰**）從純顯示 `<span>` 變成可點 `<button>`，點擊 → deep-link 到該科講義對應 region 並捲動定位。
- Deep-link 的 leaf→region 解析放在**救急端**（on-click lazy `loadHandout()` + pure resolver），成功才導航（帶既有 `?section=<regionId>` query）；**禁止**戰情圖開場 eager fetch 3 MB 的 `handout.json`。
- **閉合 loop 的返回導航**：從救急 chip 進入的講義提供「← 回救急」affordance → `navigate('/?rescue=<subjectId>')`；`OverviewPage` 讀 `?rescue=<familyId>` 於 mount 時自動開該科戰情圖並清掉該 param。**URL-transient、零持久化**（不 bump schema）。這讓「救急 → 讀 → 回救急再測試」真正成環，而非單向死路。
- 講義端（`HandoutPage`）新增 `?subject=<subjectId>` 入口，用 `useState` **同步 initializer** 讀取，確保 deep-link 到**非第一科**時首次 render 就以正確 subject derive region（修掉一個 consume-once deep-link + `subjectId` 預設 null 造成的 silent-mis-land race）。落點加短暫視覺 highlight（零狀態）。
- **兩種 null 分流**：(a) `resolveLeafToRegion` 回 null（概念來自 送分 / disputed-only leaf、無 recurrence region，但 handout 本身載入正常）→ 戰情圖 inline note「暫無對應講義段落」+ 次要「開啟該科講義」逃生門；(b) `loadHandout()` 回 null（bundle 載入失敗）→ 可重試的「講義載入失敗」訊息（**不** hang、**不**導向同樣會失敗的講義 top）。順手在 `loadHandout` 失敗時 reset module-level `inflight`，讓重試不被 cached-null 卡死。
- 資料方向仍為救急 → 講義的唯讀 deep-link：**無任何資料 / 學習狀態回傳**（返回導航只是 URL-transient nav，不記「讀過」）。**零新持久化狀態、零 sync**：R2 `SCHEMA_VERSION` 維持 28，不 bump Dexie，不動 `SYNCED_META_KEYS`。
- 可發現性 + a11y：tappable chip 樣式、戰情圖 hint（**併進既有 head-row hint，不疊第二個 span**）、`aria-label`、fetch 中 `aria-busy`、跨 chip 快速雙擊 guard（一個解析 in-flight 時忽略後續點擊）。

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-single-subject-rescue`：戰情圖 concept chip 成為 actionable deep-link（全 band 可點、on-click lazy leaf→region 解析、resolve-null 走 inline note + 逃生門、load-fail 走可重試訊息、雙擊 guard、a11y、零新狀態、無 eager fetch、不觸及 rescue sync carve-outs）；並提供 URL-transient `?rescue=` 返回導航閉合 loop。
- `neurons-anatomy-handout`：`閱讀進度與章節深連結` requirement 擴充 `?subject=<subjectId>` 同步選科入口（跨科 deep-link 落在正確 region）+ deep-link 落點短暫 highlight；仍限 device-local，不觸及 Dexie / R2 / sync。

## Impact

- **改動檔（一次性 subject-agnostic engine change）**：
  - 新 pure helper（`apps/neurons-tw/src/lib/handout-regions.ts` 或近似）：`resolveLeafToRegion(chapterQuizzes, leafId)` + vitest。
  - `apps/neurons-tw/src/components/RescueScene.tsx`：import `useNavigate`；全 band chip → button（保留既有 ‼ mark + 色點 + title children）；on-click lazy `loadHandout` + resolver + navigate / inline-note / 雙擊 guard；hint 併入既有 head-row line + a11y。
  - `apps/neurons-tw/src/routes/HandoutPage.tsx`：`?subject=` 同步 initializer；落點 highlight；「← 回救急」affordance（僅當來自救急，`navigate('/?rescue=<subjectId>')`）。
  - `apps/neurons-tw/src/routes/OverviewPage.tsx`：mount 時讀 `?rescue=<familyId>` → `openRescue(familyId)` + 清 param（URL-transient）。
  - `apps/neurons-tw/src/lib/handout.ts`：`loadHandout` 失敗時 reset `inflight`（讓重試可行；surgical，因新增救急端 consumer 依賴其 retry 語意）。
- **無** schema / wire-format 改動：R2 `SCHEMA_VERSION` 維持 28、無 Dexie `.version()` bump、無 `SYNCED_META_KEYS` diff。整合純 read + client-side nav（含返回 nav）。
- **不碰** multi-subject-rescue sync carve-outs（per-family key / conf-ovr 3-seg matcher / SV28 downgrade fence / `activeRunRef` frozen-run / `startupSyncPending` gate + module-level blitz/touch defer / `onRecoveryPull`）——唯一接觸既有路徑 = `openRescue` / `onClose`（既有）+ localStorage 只讀 + URL param。
- **V1.1 明確排除（仍留 owner 之後另立 change）**：雙向資料流（講義「讀過」計入 Movability / per-leaf 讀取狀態 / timed re-test）——任一皆需新持久狀態 → SV29，破 zero-sync invariant。本 change 只做 nav-level 閉環，不做 data-level 閉環。
