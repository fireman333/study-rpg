## Why

`add-neurons-handout-cloze-collection-and-review` 讓玩家在講義每個考點尾端的字卡列收藏字卡，但作者預挖的片段在講義正文上仍然**看不見**：玩家讀到一句考過的關鍵詞，不會知道那一句已經有做好的字卡。study-rpg-2nd 以 CSS Custom Highlight API 補上這一層（archive `2026-09-29-render-handout-cloze-highlights`）；本 change 把它移植到 neurons 的 HTML 講義：把每張可對位卡的 answer 片段畫成淡色螢光，**正文 DOM 一個字元都不動**；點螢光字 → 小卡預覽（挖空後的樣子）→「收藏」。

拆成獨立 change、並晚收藏複習 1–2 週上線，是為了先量到「沒有重點層時的收藏率」當對照。2nd 的版本建立在 markdown 讀本與 React section 上；neurons 講義是 `dangerouslySetInnerHTML` 的 HTML 片段、一科一個捲動容器，所以對位、重算時機、開關位置都要改寫，差異列在 design.md「與 2nd 的差異」。

## What Changes

- **重點層**：講義開著某一科時，對該科每張可玩卡，在已渲染的 DOM 上建一個 `Range` 蓋住 answer 片段，註冊進 `CSS.highlights`，以 `::highlight()` 上淡色底；已收藏的卡用第二個 highlight 名稱與另一色調。**不插入、不包裹、不改寫任何作者節點**；列印 / PDF 不印螢光。
- **執行期對位**：`anchorId` → 該科講義中第一個 `data-leaf-ids` token 等於 leafId 的 `.hdt-topic`（恰好一個）→ 只在該 topic 的 `ul.hdt-must > li`（作者 bullet）內取自身文字（不含巢狀清單）→ 選出文字**逐字等於**卡片 `bulletText` 的唯一 bullet → 用收藏 capability 給的 `maskSpans` 建 Range → 複核 `range.toString() === exact`。任何一步對不上 → 該卡不畫、記原因計數，沒有退而求其次的路徑。
- **點擊預覽**：委派在講義捲動容器上的 click，以 caret API 取點、比對已註冊 Range、矩形二次確認；命中 → 共用 modal 開出卡面預覽（answer「［　　］」、gloss / hint「（…）」），按「收藏」呼叫收藏 capability 的 `collectClozeCard(cardId, 'highlight-preview')`。連結、按鈕、拖曳選字時不攔截。
- **顯示重點開關**：放在講義 header（`header.hdt-header`，每科都有），預設開；本科有 ≥1 張可對位卡且瀏覽器支援時出現，關掉後開關仍在。狀態跨裝置同步：`meta` key `handoutPrefs:v1:showHighlights`，值 `{on, updatedAt}`，加進 `SYNCED_META_KEYS`，pull 後由新的 backfill post-pass 做顯式 LWW（`updatedAt` 大者勝，平手以 canonical payload 定全序）。R2 bundle **`SCHEMA_VERSION` 29 → 30**。
- **不支援 Custom Highlight API 的瀏覽器**：整層安靜缺席；考點尾端字卡列不受影響。

## Capabilities

### New Capabilities
- `neurons-handout-cloze-highlights`：講義正文上的字卡螢光、執行期對位與跳過規則、點擊預覽、「顯示重點」開關、不支援瀏覽器的退場。

### Modified Capabilities
- `neurons-anatomy-handout`：〈閱讀進度與章節深連結〉（以 `add-neurons-handout-cloze-collection-and-review` archive 後的版本為底）再加一個例外：「顯示重點」偏好由專屬 seam 模組寫入 `meta`。
- `neurons-cloud-sync`：新增 requirement，記錄 `'neurons'` bundle 自 `SCHEMA_VERSION` 30 起攜帶 `handoutPrefs:v1:showHighlights` 與它的 LWW post-pass。

## Impact

- **程式碼**：新模組 `app/lib/handout-cloze/anchor.ts`（純函式對位）、`use-cloze-highlights.ts`（hook：對位、註冊、重算、點擊委派）、`app/lib/handout-prefs.ts`（偏好 seam）、`app/components/ClozeCardPreview.tsx`；`HandoutPage.tsx` 只多呼叫 hook 與渲染開關；`lib/sync/tables.ts`（`SYNCED_META_KEYS`）、`lib/sync/backfill/`（新 LWW post-pass）、`r2/bundles.ts`（30）；CSS token 與 `::highlight()` 規則；HelpMenu 字卡段補一句。
- **相依**：必須在 `add-neurons-handout-cloze-collection-and-review` archive 並上線後才 apply；只使用它的 seam 函式，不碰 `handoutClozeState` 表與其同步。
- **資料**：無 Dexie 升版（`meta` 已存在）；R2 `SCHEMA_VERSION` 30。
- **不影響**：講義 HTML、leaf 深連結落點、「本單元猜題」按鈕、章節測驗 CTA、閱讀進度、列印內容、題目與經濟。
