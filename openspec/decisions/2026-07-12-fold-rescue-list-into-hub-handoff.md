# Handoff — 把救急計畫清單折進考前中心 hub（✅ 已 SHIPPED to prod 2026-07-12）

> ## ✅ SHIPPED — 本 handoff 已完成，僅存查
> `fold-rescue-list-into-exam-prep-hub` **上線 prod 2026-07-12**（main merge `7b2ae6ba`、track-neurons archive commit `55cb481b`、archive `openspec/changes/archive/2026-07-12-fold-rescue-list-into-exam-prep-hub`、CF Pages deploy 綠、prod SPA 三件套 + zero console error 全過）。
> 完整 shipped 狀態 + DON'T-revert invariants（`startInSetup` 唯一 conscious crossing、`closeRescue` 必 reset flag、`'list'` phase 別當 dead-code 砍、header→hub nav、per-card chip + `?rescue=` return-loop 不變）見 memory [[neurons-fold-rescue-list-into-hub-shipped]]。
> 建置流程：`/spec resume` → `/opsx:propose` → **Fable 對抗式審查 GO-with-fixes**（抓 M1：hub spec banner requirement 仍斷言 header entry unchanged = archive 後自相矛盾，已修）→ apply → verify（typecheck + 1149 tests + dev/prod 瀏覽器實測）→ archive → commit → owner-approved merge+deploy → prod smoke。
>
> ---
> 以下為原始（pre-ship）決策紀錄，保留供查。

> 寫給 `/clear` 後 `/spec resume` 接手。**Fable 已諮詢、owner 已批准走 Fable 的 MVP 方案；尚未 propose / 動工。**
> Resume 後：可直接 `/opsx:propose fold-rescue-list-into-exam-prep-hub`（純 UI/IA、零 schema，scope 已由 Fable 定清楚，**這次不需再 grill**——分歧已解、方案已收斂）。

## 1. Feature intent（owner 原話）
「可不可以把考前救急計畫的清單頁面直接拿掉（包含新增刪除計劃那些功能），合併放到考前中心最上方區塊？」

## 2. 關鍵事實更正（Fable 查 code 更正我的 brief）
**「刪除計畫」根本不在清單頁**——放棄計畫按鈕 + 兩段式確認在**各科戰情圖**（`RescueScene.tsx` ~939–956, `confirmAbandon`，含 `startupSyncPending` gate）。清單頁（RescueScene `'list'` phase）只有：計畫卡（科名 + D-x + RescueScore + 今日佇列→）+「＋ 新增計畫」+ sync 說明文字。而這跟剛 ship 的 hub 救急條 chip **幾乎 1:1 重複**。→ 要消除的重複是真的，但「刪除不用搬」（本來就不在清單頁）。

## 3. Fable Verdict：部分 GO + 推薦方案（＝ owner 批准的方向）
消除「list 作為入口目的地」正確，但**不砍 `'list'` phase 程式碼、不把破壞性操作放 hub 常駐冷靜區**。作法＝把 list 降級 fallback-only，hub 狀態條升格唯一 list surface。

| 面向 | 定案 |
|---|---|
| **清單去哪** | hub 救急狀態條＝唯一清單。有計畫時尾端加低調「＋」chip（`activeCount < 5` 才顯示 → `openRescue()` 進 setup，沿用既有「預選無計畫科」邏輯）；空狀態維持現有「建立考前救急」CTA |
| **`'list'` phase** | **不砍**，降級 fallback-only（計畫 vanish 安全網 + untouched-setup redirect），留著加註解。砍了會讓跨裝置 abandon UX 從「留在 scene 看其他計畫」退化成「被踢出」 |
| **首頁 entry** | **導去 /cram hub**（header entry 本就是「總覽/管理」語意＝hub 職責；per-family 卡片 chip 仍直開該科、深入路徑不變）。首頁 spec 再 MODIFIED 一次，**只改行為措辭**（「開 list overlay」→「導航考前中心」），不動「唯一 top-level 救急入口」主張 |
| **add / delete 位置** | add = strip「＋」chip → setup；**delete 完全不動**（留戰情圖 + 既有兩段確認）。**不要** per-chip「⋯」管理選單、不要把破壞性操作放 hub 冷靜區 |
| **cap 警告** | 軟提示(≥2)/硬上限文案**留 setup phase 內**，strip 不放警告（守考前冷靜） |

## 4. RescueScene 邊界（重要）
- **MVP = 零 RescueScene 內部改動**：純入口改向（首頁 entry 導 hub）+ strip 加一顆「＋」chip。三條 load-bearing 邏輯（vanish-fallback / 新增落新科 / untouched-setup redirect）原封不動 →「hub 只加入口」invariant（見 [[neurons-exam-prep-hub-shipped]]）無傷。
- **可選 polish（建議獨立 task 或第一版不做）**：從 hub 開單科時 `backFromPlan` 改 `onClose`（關 overlay 直接露出背後 strip = 等效回清單），需加小 prop（如 `exitToHost`）——這是**有意識跨越「不動 RescueScene 內部」邊界**，要在 proposal 明寫、不可順手做。

## 5. 風險 / tension（Fable 列）
1. MVP 不碰 RescueScene 內部 → invariant 無傷；只有 `exitToHost` polish 跨線（conscious，proposal 明寫）。
2. 首頁 spec 剛 MODIFIED 又要再改（delta 極小、只行為措辭）。
3. 手感：首頁 entry 從原地 overlay 變跨頁導航，多一次轉場（可接受）。
4. `'list'` 變「主要入口不可達但仍存在」——留著＋註解 fallback-only，別當 dead code 砍。
5. **零 schema / 零 sync 維持**（R2 SCHEMA_VERSION 停 28、零 Dexie、零 SYNCED_META_KEYS）。

## 6. Resume 後建議流程
1. `/spec resume` → 讀本檔（+ [[neurons-exam-prep-hub-shipped]] memory 的 DON'T-revert 清單）。
2. `/opsx:propose fold-rescue-list-into-exam-prep-hub` —— capability = MODIFIED `neurons-exam-prep-hub`（strip 加「＋」chip + 升格唯一 list）+ MODIFIED `neurons-homepage`（header entry 導 hub）。delta 描述上表。
3. apply → verify（含 client-side nav + 有 active plan 時 strip「＋」+ 首頁 entry 導向）→ archive → commit → merge=部署 gate 停等 owner。

## 7. 已 ship（prod, med-study-rpg.com/neurons/）
- `add-neurons-exam-prep-hub`（考前中心 hub）**SHIPPED 2026-07-12**，main merge `f95c196a`、archive `2026-07-12-add-neurons-exam-prep-hub`、CF Pages deploy green、prod smoke 全過。詳見 memory [[neurons-exam-prep-hub-shipped]]（含 DON'T-revert invariant + 3 個新 pixel-art emoji asset 23f1/270f/23f3）。
- Git：track-neurons 與 origin 同步（0/0）、main 同步、已部署。OpenSpec：無 in-progress change（本 feature 尚未 propose）。另 main worktree 有別人 in-progress 的 `add-cloudflare-auth-migration`（untracked、與本 track 無關、勿碰）。
