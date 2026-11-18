# Handoff — 考前講義 ↔ 考前救急/考前猜題 各單元 ~1:1 對應（NEXT feature）

> 寫給 clear 後 `/spec resume` 接手。**尚未動工**。本 session 已 ship 4 件事到 prod（見文末「已上線」）。
> Owner 指定 workflow：**各科各派一個 Fable agent 做結構探索 → 可與 Codex 討論 → 平行派 Opus agent 實作 → 最後 Codex 逐科審核**。
> Owner 說「有問題 grill 我」→ resume 後**先跑 `/grill quick`**（plan-phase hard rule：大 scope planning 型訊號），把 §3 開放問題問清楚再 `/opsx:propose`。

## 1. Feature intent（owner 原話 + 解讀）

Owner 要考前講義的內容，和考前救急、考前猜題的各科「各單元」做**接近一對一的對應**，雙向：
- **A**：點考前救急 or 考前猜題的「單元」→ 對應到考前講義該單元的內容。
- **B**：考前講義對應內容底下 → 有辦法去「該單元」的題目。

解讀：這是三個子系統（講義 / 救急 / 猜題）的**單元級交叉連結**，讓學生在「診斷（救急）/ 猜題重點（猜題）/ 教學（講義）/ 練題」之間沿同一個單元自由跳。

## 2. 關鍵事實：一部分「已經做好」，真正的 gap 在別處

**這個 session 剛 ship 的東西已經覆蓋了 A/B 的一大半**——resume 後**先確認現況、不要重造**：

- **救急 → 講義（A 的救急側）已存在**：`add-neurons-handout-rescue-deeplink`（本 session）已讓救急戰情圖的 concept chip（= leafId）deep-link 到講義對應 region。source `RescueScene.tsx` 的 `openConceptHandout` → `resolveLeafToRegion(chapterQuizzes, leafId)` → `/cram/handout?subject=X&section=<regionId>&from=rescue`。**救急單元 = leaf，已能跳講義 region。**
- **講義 → 該單元題目（B）已存在**：講義每個 region 底下有「📝 測驗本區／本章」CTA，開該 region 的 questions（`HandoutPage.tsx` `openChapterQuiz` → `chapterQuizzes[].sourceQuestionIds`）。**講義 region → 其題目，已通。**
- **講義入口**：已是「題庫」tab 第 3 subtab（App.tsx `/cram/handout`）。

→ **真正的 NEW gap**：
1. **考前猜題（cram, `/cram`）→ 講義 的對應（A 的猜題側）完全沒有**。cram 是獨立結構（`cram.json`：`books` → 速看 blocks〔kernel/kw/disc/num/skeleton, 86 blocks〕+ 押題 items〔493, tier 常青必掃/穩定考點…〕）。cram「單元」目前**沒有** deep-link 到講義。
2. **「~1:1」的結構對齊本身**：三系統**單元粒度不同**（見 §3），owner 要它們「接近一對一」——這需要**決定 canonical 單元 + 各科結構探索**，不是純加連結。

## 3. 核心設計張力（grill + 結構探索要解決的）

三個系統的「單元」在不同粒度：

| 系統 | 「單元」是什麼 | 粒度（以生理學為例） | 既有 join key |
|---|---|---|---|
| **考前講義** | `hdt-region`（config 定義，一 region = 一組 leafIds） | 粗，~12 regions | `regionId` ↔ `leafIds[]`（`<科>.config.json`） |
| **考前救急** | war-map concept = **單一 leafId** | 細，~71 leaves | `conceptId` = leafId |
| **考前猜題** | 速看 block + 押題 item（concept-tier） | 中，~概念級 | 押題綁 concept；速看 block 綁 ? |

**共用 canonical key = leafId**（`concept-recurrence.json` canonical leaves；`concept-tags.json` = qid→leafId[]）。region ↔ leaf 是 **1:多**（一 region 含多 leaf）。所以「1:1」在 region↔leaf 之間**天生不成立**——這是最大的設計問題：

- **選項 A**：canonical 單元 = **講義 region**。救急/猜題的細粒度單元往上 roll 到 region（多對一）。實作最輕（region 已是講義主結構、救急 chip 已 roll 到 region）。但「1:1」變「多對一」，可能不符 owner 心裡的「單元」。
- **選項 B**：canonical 單元 = **leaf**。講義要細分到 leaf 級錨點（每 leaf 一個可跳的 sub-anchor），救急/猜題天生 leaf 級。最貼近「1:1」，但講義要加 leaf 級 `id` 錨點（結構工程量大、每科不同）。
- **選項 C**：per-subject 混合——有些科 region≈concept（1:1 天然成立，如免疫），有些科 region≫leaf（需細分）。**這正是「各科各派 Fable 做結構探索」的理由**：每科先量出 region:leaf 的實際比例 + 猜題單元怎麼對，再決定該科走 A/B/C。

→ **grill 要先問 owner**：「單元」在你心裡是 region 級還是 concept/leaf 級？「接近一對一」能接受「多對一 roll-up」嗎？（§4 更多問題）

## 4. Open questions for grill（resume 後先問）

1. **canonical 單元粒度**：region 級（粗、輕）vs leaf/concept 級（細、貼「1:1」、工程大）？可接受各科不同嗎？
2. **雙向的猜題側**：考前猜題的哪個 UI 元素當「單元」入口？速看 block？押題 item？兩者都要？點了是跳講義 region 頂還是 leaf 錨點？
3. **講義 → 猜題**：B 已有「該單元題目」（測驗本區）。owner 是否**也**要「講義 → 該單元的猜題速看/押題」（不只題目）？
4. **1:1 不成立的單元怎麼辦**：leaf 落在無 region 的 disputed/送分（就像救急 deeplink 的 unavailable case）→ 沿用現有 inline note + 逃生門？
5. **結構重整範圍**：可以動講義的 region 切分（讓它更貼救急/猜題單元）嗎，還是講義結構凍結、只加連結？
6. **零 sync 邊界**：這 feature 應維持零新持久狀態（純導覽 + read-side resolver，like 本 session 的 deeplink）。有需要記「使用者在單元間怎麼跳」的持久狀態嗎？（預設**否** → 維持 R2 SV 28、零 Dexie。）

## 5. Owner 指定 workflow（resume 後照跑）

1. **各科各派一個 Fable agent 做結構探索**（read-only）：量該科 region 清單 vs leaf 清單 vs 猜題單元，算 region:leaf 比例、找 1:1 天然成立 vs 需細分的 region、產出該科的「單元對應表」草案 + 建議走 §3 的 A/B/C 哪個。**11 科 = 11 Fable agent（燒錢 gate-A：先報價再跑）。**
2. **可與 Codex 討論**：結構探索的收斂 / 跨科一致性 / canonical 單元決策，開 fusion 討論。
3. **平行派 Opus agent 實作**：每科一個 Opus agent 依其單元對應表實作（可能含講義 leaf 錨點、cram→講義 deep-link、講義→猜題 link）。**worktree isolation 若平行改同檔要注意**（multi_agent_git_safety）。
4. **最後 Codex 逐科審核**：每科一個 Codex adversarial review（fact + 結構正確性 + 連結不斷）。

→ 這是 4-phase workflow，適合用 `Workflow` tool 編排（owner 已 opt-in「派平行 agents」）。但**先 grill + `/opsx:propose` 定 scope**，再進 Workflow。

## 6. 不可破壞的 invariants（本 session 剛 ship 的，別回歸）

- **救急→講義 deeplink**（`resolveLeafToRegion` in `apps/neurons-tw/src/lib/handout-regions.ts`；`RescueScene.tsx openConceptHandout`；`OverviewPage.tsx` `?rescue=` 消費）——這 feature 會擴充它，別破壞。
- **回救急 return 用 `BASE_URL` full-nav**（basename trap，見 memory [[neurons-router-basename-root-query-trap]]）——任何新的「跳回 root+query」導覽都要用 `import.meta.env.BASE_URL` full-nav，別用 `navigate('/?...')`（prod 空白頁）。
- **零 sync**：R2 `SCHEMA_VERSION` = 28、零 Dexie bump、零 `SYNCED_META_KEYS` diff（除非 §4 Q6 決定要持久狀態）。
- **講義 build**：非測驗 region 用 `NON_QUIZ_REGION_IDS` 豁免；region-keyed drift check 會 throw（見 memory [[neurons-subject-handouts-pipeline]]）。若細分 region 加 leaf 錨點，注意不要觸發 config↔HTML drift。
- **fact rigor**：任何動到講義內容 → 考選部 answer primary + packet-grep 每條 Codex finding（embryology trap，見 [[neurons-subject-handouts-pipeline]] CRITICAL fact-gate）。

## 7. Key handles（resume 直接用）

- 講義 region↔leaf：`packages/content-neurons-tw/src/handout/<科>.config.json`（`{regionId,title,leafIds[],targetDepth}`）。
- 救急 war-map：`apps/neurons-tw/src/lib/services/rescue/rescue-session.ts` `buildWarMap`；chip in `RescueScene.tsx:~800`。
- 猜題 cram：`packages/content-neurons-tw/dist/cram.json`（`books`→速看 blocks + 押題 items）；UI `apps/neurons-tw/src/routes/CramPage.tsx`；lib `apps/neurons-tw/src/lib/cram.ts`。
- 講義 resolver + 測驗本區：`apps/neurons-tw/src/routes/HandoutPage.tsx`（`openChapterQuiz`, `chapterQuizzes[].sourceQuestionIds`）。
- concept-tags（qid↔leaf）：`apps/neurons-tw/public/content/neurons-tw/concept-tags.json`；loader `apps/neurons-tw/src/lib/concept-tags.ts`。

## 8. 本 session 已上線（prod, med-study-rpg.com/neurons/）

全部 merge 到 main + CF Pages 部署綠 + prod 實測：
1. `add-neurons-handout-rescue-deeplink`（救急 chip → 講義 deep-link + 回救急 return，含 basename hotfix）— archive `2026-07-12-add-neurons-handout-rescue-deeplink`。
2. `reorder-handout-subjects-by-exam-paper`（講義科目考卷序）— archive 同日。
3. `add-neurons-handout-strategy-maps`（全 11 科一週攻略地圖 + HelpMenu 考前講義 section + 救急↔講義整合文案）— archive 同日。
- Git：track-neurons 與 origin 同步、main fully pushed；working tree 只剩 3 個無關 untracked。
- OpenSpec：唯一 in-progress = `eliminate-cross-device-r2-412-storm`（parked Phase-2 tracker，無關）。
- 非阻塞 follow-up：`?section=` deep-link 慢速圖多首載偶爾 scroll drift（pre-existing；便宜修 = 落點後延遲 re-jump 一次）。
