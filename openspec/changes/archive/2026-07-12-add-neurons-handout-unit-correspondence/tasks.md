## 1. Engine — leaf-anchor 契約與 build gate（subject-agnostic，1 Opus）

- [x] 1.1 `build-handout.ts`：解析每個 `<h3 class="hdt-topic">`，注入 `id` + 多值 `data-leaf-ids`（來源為 §3 per-subject 對照）；region 結構完全不動
- [x] 1.2 `build-handout.ts`：新增 leaf-anchor gate（獨立 pass）——未知 leaf token / 重複 primary → loud fail；印每科 coverage（anchored primary / region-bearing leaves）；非 quiz region 豁免；不改既有 region drift check
- [x] 1.3 解剖學特例：無 config.json、走 legacy `REGION_TO_CHAPTER`，建立獨立 input adapter 取得其 canonical leaf 集合供 gate 驗證，不套 10 科 config 形狀

## 2. Engine — resolver 與跨系統連結（subject-agnostic，1 Opus）

- [x] 2.1 `handout-regions.ts`：`(subject, leaf)` 兩段 leaf resolver —— leaf primary anchor（DOM `[data-leaf-ids~="leaf"]`）→ region fallback（`resolveLeafToRegion`）→ null；禁全域 map
- [x] 2.2 `HandoutPage.tsx`：消費 `?leaf=`（沿用 `?subject=` 同步首 render）；leaf 有 anchor 捲 primary anchor + highlight；無 anchor 退 region；無 region → inline「暫無對應講義段落」+「開啟該科講義」逃生門，絕不 region 0；`?leaf=` 對 `?section=` 有 precedence
- [x] 2.3 `RescueScene.tsx`：紅/黃/灰 chip 導覽由 `?section=<regionId>` 改為 `?subject=&leaf=<leafId>`；保留 rescue 側 mapped/unmapped 偵測（unmapped → inline note 不導航）、lazy load、bundle-fail retry、double-activation guard、`BASE_URL` full-nav return（basename trap）
- [x] 2.4 `CramPage.tsx`：押題 item 加「看講義」→ `?subject=&leaf=<leafId>`（push 已 leaf-native）
- [x] 2.5 `CramPage.tsx`：速看 block 加「開啟本科講義」→ `?subject=`（科目級，無 leaf/section）
- [x] 2.6 講義 topic 底下加「本單元猜題」→ 連該 leaf 的押題（有對應才顯示，無則不渲染死連結）；保留既有「測驗本區／本章」CTA

## 3. Per-subject 資料 — topic→leafId 多值對照（11 科）

- [x] 3.1 便宜 tagger（Haiku/Fable）名稱比對產草案：9 科 config-based（胚胎/組織/生理/生化/微生/免疫/寄生/公衛）—— topic zh ≈ leaf zh，多值輸出
- [x] 3.2 Opus 級裁決非 1:1 最嚴重兩科：解剖學（76 topic / 87 leaf，legacy 路徑）+ 病理學（90 topic / 65 leaf）
- [x] 3.3 藥理學（67 leaf、escape-hatch 最多 10）tagger 草案 + Opus 複核 escape-hatch 映射
- [x] 3.4 fact-verify 每條多值/疑義 mapping：考選部 answer primary、packet-grep（tagger 高信心 ≠ fact-gate；embryology/寄生/生化 有 Codex 誤判官方答案前例）
- [x] 3.5 每科跑 `pnpm run build:neurons-content`，leaf-anchor gate 綠 + coverage 印出，逐科收斂

## 4. 測試與回歸

- [x] 4.1 Vitest：`(subject, leaf)` resolver 單元測試——anchor / region-fallback / unavailable 三路徑 + 跨科同名 leaf 不誤解析
- [x] 4.2 Vitest：escape-hatch 回歸——藥理 10 / 公衛 8 / 生化 7 等 war-map leaf 落無 region → unavailable path（不 region 0、不 crash）
- [x] 4.3 Vitest / build assert：leaf-anchor gate 對未知 token + 重複 primary 會 fail
- [x] 4.4 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` 全綠

## 5. Phase 4 — Codex 審核（owner 批准聚焦，非 11 逐科）

- [x] 5.1 Codex 對照 fact-check（Review B）：3 難科（解剖/病理/藥理）topic→leaf 綁定 mis-binding 偵測 + 全 25 個 ambiguous primary 覆核 → 0 mis-binding、25 全 acceptable。結構（多值/primary 一致）+ 連結不斷已由 build gate + 1149 vitest 機械驗過
- [x] 5.2 Codex 審 engine（Review A）：resolver 降級 cascade、零 sync 足跡、basename trap、解剖 legacy adapter、id 碰撞 → 3 bug（subject-scoped anchor query / 多值 reverse-link per-leaf / re-scroll cancel）全修 + 測試鎖定

## 6. verify + 上線 gate

- [x] 6.1 `/verify`：dead-code audit + `/simplify` + Chrome MCP prod-equivalent SPA 三件套（in-app nav + 直接 URL + F5）+ leaf deep-link 落點 + unavailable/escape 實測
- [x] 6.2 停在 merge=部署 gate 等 owner 確認（merge `track-neurons` → main 觸發 CF Pages）
