## Why

考前講義（教學）、考前救急（診斷戰情圖）、考前猜題（速看＋押題）三個備考子系統目前只有「救急 → 講義 region 級 deep-link」與「講義 region → 本區題目」兩條連結，且都停在**粗 region 粒度**；考前猜題完全沒有連到講義。學生無法沿同一個「單元」（canonical leafId）在教學／診斷／猜題／練題之間自由跳。三系統其實共用同一批 leafId（救急 war-map concept、押題 `push[].leafId`、講義 `config.json` region→leafIds[] 全部同字串 vocab），只差把講義的 `hdt-topic` 綁上 leafId、再補齊跨系統的單元級連結，就能形成閉環。

## What Changes

- 講義每個 `<h3 class="hdt-topic">` 取得 `id` + **多值 `data-leaf-ids`** 屬性（多值，因 topic:leaf 非真 1:1）；build 新增「每 canonical leaf 恰一 primary topic anchor」gate（未知／重複／無 anchor 即 loud fail），獨立於既有 region drift check。
- `HandoutPage` deep-link resolver 新增 `?leaf=<leafId>`：scroll 到該 subject 下 `[data-leaf-ids~="leafId"]`；缺 leaf anchor → fallback 該 leaf 的 region；缺 region（跨科洩漏 / disputed / 送分 leaf）→ 明示 unavailable inline note + 逃生門，**絕不 fallback region 0**。resolver 必 `(subject, leaf)` 兩段、禁全域 map（leafId 跨科不唯一，68 共用）。
- 救急紅色 concept chip 的 deep-link 由 **region 級升為 leaf 級**（chip 已帶 leafId）。
- 考前猜題**押題 item** 新增「→ 看講義」leaf 級入口（`?subject=&leaf=`，push 已 leaf-native、免對照表）。
- 考前猜題**速看 block** 新增「→ 開啟本科講義」**科目級**入口（速看天生跨概念鑑別表，刻意不做單元級綁定，避免給學生錯誤精準感／誤導備考）。
- 講義 `hdt-topic`（leaf）底下新增「→ 本單元猜題」入口，連到該 leaf 的押題（既有「測驗本區題目」CTA 保留）→ 三向閉環。
- **零新持久狀態**：純導覽 + read-side resolver。R2 `SCHEMA_VERSION` 維持 28、零 Dexie bump、零 `SYNCED_META_KEYS` diff。

## Capabilities

### New Capabilities

- `neurons-unit-correspondence`: 跨三系統（講義／救急／猜題）的單元級交叉連結契約 —— canonical leafId 作為共用單元 key、`(subject, leaf)` 兩段 resolver 與 unavailable／escape-hatch 規則、押題→講義 leaf 級連結、速看→講義科目級連結、講義→猜題單元連結、零持久狀態邊界。

### Modified Capabilities

- `neurons-anatomy-handout`: 講義 `hdt-topic` 取得 leaf 級 anchor（`data-leaf-ids`）、build 新增 leaf-anchor gate、`HandoutPage` deep-link 新增消費 `?leaf=`（沿用既有 `?subject=` / `?section=`）。解剖學特例（無 config.json、走 legacy `REGION_TO_CHAPTER`）需獨立 input adapter + 驗證。
- `neurons-single-subject-rescue`: 戰情圖紅色 concept chip → 講義 deep-link 的粒度由 region 級改為 leaf 級（保留 unavailable guard 與回救急 return 的 `BASE_URL` full-nav）。

## Impact

- **前端（engine，subject-agnostic）**：`apps/neurons-tw/src/routes/HandoutPage.tsx`（`?leaf=` resolver）、`apps/neurons-tw/src/lib/handout-regions.ts`（`(subject,leaf)` 解析）、`apps/neurons-tw/src/routes/CramPage.tsx`（押題 leaf 連結 + 速看科目連結）、`RescueScene.tsx`（chip 升 leaf 級）。
- **Build**：`packages/content-neurons-tw/scripts/build-handout.ts`（topic `data-leaf-ids` 注入 + leaf-anchor gate）。
- **內容資料（per-subject）**：11 科 `hdt-topic → leafId` 多值對照（~500 topic）。便宜 tagger 名稱比對（topic zh ≈ leaf zh），解剖學 + 病理學（非 1:1 最嚴重）需 Opus 級裁決；所有對照 fact-verify（考選部 answer primary、packet-grep 每條疑義）。
- **不受影響**：R2 `SCHEMA_VERSION`（維持 28）、Dexie schema、`SYNCED_META_KEYS`、既有 region drift check、既有「救急→講義 region」與「講義→本區題目」連結（向後相容擴充，不移除）。
- **回歸風險點**：escape-hatch（藥理 10 / 公衛 8 / 生化 7 等 war-map leaf 落在無 region）須列回歸測試；basename trap（回救急 return 用 `BASE_URL` full-nav，不可退回 `navigate('/?...')`）。
