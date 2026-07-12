## Context

考前救急（rescue）與考前講義（handout）是兩套已上線、資料完全獨立的子系統。救急在 rescue dashboard 產出「戰情圖」(war map)——把該科概念依 mastery × yield 標成紅 / 黃 / 灰。講義是 per-subject 的長文教學文件，route `/cram/handout`，內部按 region（`.hdt-region` 錨點）分節。全 11 一階科目的講義已於 2026-07-12 上線（`handout.json` 含全 11 科）。

整合可行的**決定性事實**（Explore agent fresh-grep + 主對話讀碼核對）：

- **Join key 天然對齊**：救急 `plan.familyId` === 講義 `subjectId` === `q.subject`（CJK 科名）；救急 `WarMapConcept.conceptId` === 講義 `chapterQuizzes[].leafIds[]` === bare canonical leafId。
- **leafId 跨科不唯一**（68 個共用）→ resolver 必須 (subjectId, leafId) 兩段，不可用全域 leaf→region map。
- 救急 chip render 在 `RescueScene.tsx:800`，目前不可點 `<span>`（含既有 ‼ mark + 色點 + `title`）；`subjectId = plan?.familyId` 在 component scope（:247）；head-row hint 已在 `:785`；`useNavigate` 尚未 import。
- **RescueScene 掛在 `OverviewPage`（首頁 `/`）的 `rescueOpen` local state（`OverviewPage.tsx:108`），`openRescue(familyId)` 開啟（:415）。** 導航離開首頁會 unmount RescueScene、`rescueOpen` 重置——所以返回救急沒有既有的便宜 1-tap 路徑。
- 講義 `HandoutPage.tsx`：`close = navigate('/cram')`（:97，非首頁）；`readDeepLinkSection()`（:35）讀 `?section=`/`#hash`、尚未讀 `?subject=`；`subjectId` state 預設 null → 首次以 `subjects[0]` derive（:69）；`jumpTo(id)`（:99）= `getElementById` + `scrollIntoView` + `history.replaceState(null,'','#id')`（:104——相對 `#id` 只換 hash、**保留** query string，故 `?subject=` 不被抹掉）；deep-link 是 consume-once（`deepLinkConsumedRef`，:135）。
- `handout.json` 實測 **3.0 MB**；`lib/handout.ts` lazy loader、`import.meta.env.BASE_URL` 前綴。**失敗時 `.catch` 回 null 但不 reset `inflight`（:28）→ retry 拿到 cached-null 卡死直到 reload。**
- 解剖學 chapter-keyed（`memberRegionIds` 長度可 >1）；其餘 10 科 region-keyed（長度恆 1）。

方向、scope、設計經 Fable + Codex 兩輪 review 收斂，owner 拍板：全 band 可點、返回導航進 v1。

## Goals / Non-Goals

**Goals:**

- 救急戰情圖 concept chip（全 band）→ 一鍵 deep-link 到該科講義對應 region，捲動定位。
- **閉合 loop**：從救急進入的講義提供「← 回救急」返回導航，回到該科戰情圖（URL-transient `?rescue=`，零持久化）。
- 唯讀資料方向（救急→講義）、**零新持久化狀態、零 sync**（R2 SV 維持 28、無 Dexie bump、無 `SYNCED_META_KEYS` diff）。
- robust 失敗處理：resolve-null（無 region）與 load-fail（bundle 失敗）分流，皆不 hang。
- 修掉跨科 deep-link 的 consume-once race（首次以正確 subject derive）。

**Non-Goals:**

- ❌ **資料級**雙向（講義「讀過」計入 Movability / per-leaf 讀取狀態 / timed re-test）——任一皆需新持久狀態 → SV29，破 zero-sync invariant。本 change 只做 **nav 級**閉環。
- ❌ 戰情圖 chip 的 pre-render available/unavailable 精準預標（需 eager fetch 3 MB 或另建 manifest，MVP 不做）。
- ❌ 把講義測驗包成 rescue session（run-bound confidence + sync 衝突）。

## Decisions

### D1 — 全 band chip 可點（非只紅色）

Chip render 是單一 `warSections.map(sec => sec.items.map(...))` 路徑；「只紅色可點」反而要**多加** band 條件。灰色 = 從未 encode 的死角，正是講義唯一能救的 case——紅色 only 反著砍。紅色仍給較強視覺 affordance。owner 2026-07-12 確認全 band。

### D2 — 解析放救急端 + 複用既有 `?section=`（不加 `?leaf=`）

Chip on-click 才 lazy `loadHandout()`（module-cached）→ pure resolver `resolveLeafToRegion(chapterQuizzes, leafId)` → 成功才 `navigate('/cram/handout?subject=X&section=<regionId>')`。複用 HandoutPage 既有 `?section=` 讀取，HandoutPage 新增 diff 縮到「同步解析 `?subject=`」+ 落點 highlight + 返回鈕。

- **Alternative（HandoutPage 端解析 `?leaf=`）**：捨棄——(a) 多出 `?leaf=` 參數 + HandoutPage 端 resolver + unavailable UI 三個 surface；(b) 失敗案例會把學生導航到別處才看到「沒有頁面」，最需要幫助的概念被丟死路。解析留救急端 → 失敗留原地。
- **不 eager fetch 做 pre-render gating**：`handout.json` 3 MB，為 chip disabled 態在 render 拉 3 MB 是明確 perf regression（違反 `lib/handout.ts` lazy 設計）。on-click lazy load 是使用者本就要付的成本。trade-off：chip 無法**預先**標 available/unavailable（可接受，unavailable 是少數）。

### D3 — 解剖 chapter-keyed 跳 `memberRegionIds[0]`（章首），不是 `cq.regionId`

`cq.regionId` 是「測驗 CTA 所在 region」，很可能在章**末**；跳它落章尾。跳 `memberRegionIds[0]` = 章首。resolver 回 `{ regionId, isChapter }`，`isChapter = memberRegionIds.length > 1` 供內部選跳點。**不做**「對應本區/對應本章」的**可見 chip label**——解析在 click 後才發生，chip render 時（aria-label / 可見文字皆在 render 時定）尚不知道 isChapter，pre-click 無從顯示；此區別純內部用於選 jump target，MVP 不對外標示（Fable + Codex 同指此 label pre-click 不可實作）。

### D4 — HandoutPage `?subject=` 用 `useState` 同步 initializer（race 修，必做）

deep-link consume-once（`deepLinkConsumedRef`），`subjectId` 預設 null → 首次 render `active = subjects[0]`。若用 useEffect 解析 `?subject=`，時序 = 以 subjects[0] derive → restore effect 消費 deep-link、在錯 subject DOM 找不到 → fallback → 之後才 setSubjectId 但 ref 已消費 → 永不跳。症狀：deep-link 到非第一科 silently 落在解剖學上次讀到的地方。**修法**：`useState<string | null>(() => new URLSearchParams(location.search).get('subject'))`——同步讀、首次即正確 subject、consume-once 邏輯不動。因 `jumpTo` 的 `replaceState('#id')` 保留 query，deep-link URL 在 F5 下可穩定重現（可選 polish：consume 後清 query 以免手動換科後 F5 snapback，P4，不擋）。

### D5 — overlay→route 轉場：安全來自 route unmount，非 callback 順序

導航到 `/cram/handout` 會 unmount `OverviewPage`（`/`）→ 連帶 unmount RescueScene overlay。所以**兩個 full-screen portal 不會疊**是因為 route 換掉了 host、**不是**因為「onClose 先於 navigate 被 React batch」（Codex 指正原措辭）。實作仍在導航前呼叫 `onClose()`（設 `rescueOpen=false`）作為 hygiene——避免之後回到 `/` 殘留 stale overlay 狀態——但驗收準則以「導航後只有一個 dialog、focus 落在講義關閉鍵、無殘留 overlay」陳述，不依賴 batch 語意。

### D6 — 落點 2 秒 highlight（進 MVP）

deep-link 落長文中段，第一問是「我到了嗎」。加 class + 短延遲移除（~5 行、零狀態）。**不用 CSS `:target`**——`replaceState` 下不更新 `:target`。

### D7 — resolver 是 pure function + unit test

`resolveLeafToRegion(chapterQuizzes, leafId): { regionId, isChapter } | null` 放 `handout-regions.ts`。純函式、subject-agnostic（呼叫端先選定 subject 的 chapterQuizzes 才傳入 → 天然隔離跨科 collision）。vitest 四 case：region-keyed 1:1 / chapter-keyed 多 region（回 memberRegionIds[0] + isChapter true）/ 無解 null / 跨科 scoping。

### D8 — 閉合 loop 的返回導航（`?rescue=`，URL-transient，零持久化）

「救急 → 讀 → 回救急再測試」的 error-driven loop 要真正成環，需一條回程。ground truth：✕ 走 `/cram`、救急掛首頁 `rescueOpen` local state、導航會 reset 它 → 無既有便宜回程。**方案**：從救急進入的講義（以 `?subject=` 存在或加 `?from=rescue` 判定 origin）顯示「← 回救急」→ `navigate('/?rescue=<subjectId>')`；`OverviewPage` mount 時讀 `?rescue=<familyId>` → `openRescue(familyId)` + `replaceState` 清 param（避免重整重觸發）。戰情圖 data 由既有持久化 plan（`useRescuePlans`）還原。**全程零持久化**（URL param + 既有 local state + 既有 `openRescue`），不碰 sync carve-outs。

- **Alternative（不做、留 V1.1）**：owner 原可選；但 cohesion 是本次 review 的明訂 bar，且回程是 nav-only（~10-15 行、2 檔、零 sync）→ 值得進 v1。owner 2026-07-12 拍板進 v1。

### D9 — 兩種 null 分流 + loader retry 修復

`resolveLeafToRegion` 回 null（handout 載入正常但概念無 region）與 `loadHandout()` 回 null（bundle 載入失敗）是**不同** UX：前者 → inline note +「開啟該科講義」逃生門（handout 載得起，只是無此 region）；後者 → 可重試的「講義載入失敗」訊息（**不**導向同樣會失敗的 handout top、**不** hang）。順手在 `loadHandout` 的 `.catch` reset `inflight = null`（surgical），否則 cached-null 讓重試永遠拿到 null 直到 reload。跨 chip 快速雙擊加 in-flight guard（一個解析進行中忽略後續點擊），`aria-busy` 之外的實際互斥。

## Risks / Trade-offs

- **[Consume-once deep-link race]** → D4 同步 initializer；acceptance 明列「deep-link 到非第一科必須落在正確 region」，Chrome MCP 實測涵蓋。
- **[3 MB handout.json 首載延遲 / 失敗]** → on-click 才 load；fetch 中 chip `aria-busy`；失敗 reset inflight + 可重試訊息（D9），不 hang。
- **[誤觸 multi-subject-rescue sync carve-outs]** → 純 read + nav，接觸點 = 既有 `openRescue`/`onClose` + localStorage 只讀 + URL param；acceptance grep 驗證「不 import rescue/sync 模組、SV 維持 28、`SYNCED_META_KEYS` 零 diff」。
- **[可發現性：button 視覺同 span]** → tappable 樣式 + hint（併入既有 :785 head-row line，不疊第二 span）+ `aria-busy` + `aria-label`。
- **[兩個 full-screen portal 疊層]** → route unmount 保證（D5）；smoke 目視確認 body-style 不互踩、focus 落講義關閉鍵。
- **[返回導航誤觸發]** → `?rescue=` 消費後即 `replaceState` 清除，避免 F5 / 手動回首頁重複開 overlay。

## Migration Plan

- 純 client-side engine change，無 schema / wire-format 遷移、無 backfill、無 R2 / D1 動作。
- 部署 = merge track-neurons → main 觸發 CF Pages（`med-study-rpg.com/neurons/`）——**owner 確認的紅線 gate**，本 change 不自行部署。
- Rollback = revert 該 commit（純前端、無持久狀態，零殘留）。

## Open Questions

- 無阻塞性未決項。V1.1 候選（data 級雙向：講義「讀過」計入 Movability，需 SV29）留待 owner 之後另立 change。
