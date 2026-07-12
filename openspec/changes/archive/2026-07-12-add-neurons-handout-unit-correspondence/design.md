## Context

三個備考子系統共用 canonical leafId：救急 war-map concept = leafId、押題 `push[].leafId`、講義 `config.json` region→leafIds[]。既有連結只到 region 粒度（救急→講義 region、講義→本區題目），且猜題零連結。本設計由 **11 科 Fable 結構探索**（read-only 實測）+ **Codex fusion 對審**收斂鎖定：

- 每科每個 region 都是 fan-out（3~22 leaf/region），**零天然 1:1 region** → 「1:1」只能在 leaf 級成立。
- 每科既有 `hdt-topic` 數 ≈ leaf 數 ±15%（生理 71:71、胚胎 12:12、病理 90:65、解剖 76:87）→ leaf 級 sub-anchor 層**已存在於 HTML**，只差綁 leafId。
- 押題全 11 科 100% leaf-native + 100% coverage → 押題→leaf join 免對照表。
- 速看 block 全 11 科零 join key（跨概念鑑別表）→ 無法誠實做單元級綁定。
- build drift check（`build-handout.ts:94`）只掃 `<section class="hdt-region" id>`，不碰 topic → 加 topic 屬性不觸發既有 drift。

## Goals / Non-Goals

**Goals:**
- 三系統沿同一 leafId 單元級互跳（救急↔講義↔猜題）。
- 講義 region 保持不動（roll-up 容器），單元對應用 leaf 級 sub-anchor 達成。
- Engine 為 subject-agnostic 單次實作；per-subject 只提供 topic→leaf 對照資料。
- 零新持久狀態（R2 SV 28、零 Dexie、零 SYNCED_META_KEYS diff）。

**Non-Goals:**
- **不重切講義 region**（全 11 科探索一致：無結構問題可修、重切只增維護面與 fact-gate 成本）。
- **不做速看 block 的單元級綁定**（天生跨概念，強綁會誤導備考）。
- 不改動 R2/Dexie schema、不加 leaderboard/成就等游戲化 hook。
- 不改「救急→講義 region」「講義→本區題目」既有連結語意（只向後相容擴充）。

## Decisions

### D1 — canonical 單元粒度 = per-subject C-hybrid（region 容器 + leaf sub-anchor）
選 leaf 級 sub-anchor 掛在既有 `hdt-topic` 上，region 保留當 roll-up 容器。
- **Alternatives**：(A) 統一 region 級 roll-up — 不是 1:1，不符 owner「接近一對一」；(B) 重切 region 到 leaf 級 — 全科探索一致反對（複製既有 leaf 層、region 失去教學分組價值、觸發逐條 fact-verify）。
- **Why**：sub-anchor 層已存在（topic≈leaf），CP 值最高；owner 拍板「傾向可重切但交探索定案」，探索結論為不重切。

### D2 — topic→leaf 用**多值** `data-leaf-ids`（非單值），co-located 在 source HTML
每個 `hdt-topic` 加 `id` + `data-leaf-ids="leafA leafB"`（space-separated，CSS `~=` selector 可選）。
- **Alternatives**：(A) 單值 `data-leaf` — Codex 否決：topic:leaf 非真 1:1（解剖 76:87、病理 90:65），單值會靜默漏 leaf / 錯併；(B) sidecar `<科>.topic-leaf.json` — 多一個 drift 面、與內容分離不利 fact-verify。
- **Why**：內容 HTML 是真實來源，對照 co-locate 最利 fact-verify + review。

### D3 — build 新增 leaf-anchor gate（獨立於 region drift check）
gate 對「錯綁 / 結構矛盾」loud-fail，對「未綁滿」loud-report（非 fail）：
- **Fail**：`data-leaf-ids` token 非該科 canonical leaf（改名/typo 漂移）；同一 leaf 有 >1 primary anchor。
- **Report（非 fail）**：印每科 leaf-anchor coverage（anchored primary / region-bearing leaves）——有 region 但無 primary anchor 的 leaf 由 resolver 優雅降級到 region 級（見 D4），不 block ship，但 coverage 數字 loud 印出、不 silent。
- **Why**：fuzzy 名稱比對在改名/重名後會靜默漂移（Codex 風險旗標）→ 錯綁必 fail；但強制 100% anchor 覆蓋會卡在長尾（owner 要「接近一對一」非嚴格）→ 未綁滿優雅降級 + 印 coverage 才是 No-Silent-Errors 的正解。primary 概念解決多值下「跳哪個 anchor」的歧義。

### D4 — resolver 兩段 `(subject, leaf)`、缺 region 明示 unavailable
`?leaf=` 先在 active subject 內找 `[data-leaf-ids~="leaf"]`；缺 anchor → 該 leaf 的 region；缺 region → unavailable inline note + 逃生門。**絕不 fallback region 0**。
- **Why**：leafId 跨科不唯一（68 共用）→ 全域 map 會跳錯科；跨科洩漏 leaf（藥理 10 / 公衛 8 等）在本科無 region，沿用既有 rescue deep-link 的 unavailable pattern。

### D5 — 速看科目級、押題 leaf 級（不對稱是刻意的）
押題→講義走 leaf 級精準跳；速看→講義只到科目級「開啟本科講義」。
- **Why**：押題 leaf-native；速看是跨概念鑑別表，Fable×11 + Codex 一致「硬綁單元比不綁更糟」。owner 拍板科目級。

### D6 — Phase 3 分工：1 suba-agnostic engine + per-subject 對照資料
engine（req 1-6 引擎面）由 1 隻 Opus 一次寫；11 科 topic→leaf 對照由便宜 tagger 名稱比對產出，**解剖 + 病理**（非 1:1 最嚴重）+ 所有多值/疑義條目需 Opus 級裁決 + fact-verify。解剖走 legacy `REGION_TO_CHAPTER`、無 config.json → 獨立 input adapter。
- **Why**：共識高度一致 → engine 無需逐科；per-subject 只是資料，用便宜 model 產草案 + fact-gate 複核。

## Risks / Trade-offs

- **便宜 tagger 高信心 ≠ 正確** → 每個多值/疑義 mapping 必經 fact-verify（考選部 answer primary、packet-grep），解剖/病理走 Opus 裁決。
- **中文標題 fuzzy match 漂移** → D3 build gate 把漏綁/錯綁變 loud fail；leaf-anchor gate 進 CI/`verify:handout`。
- **多值 anchor 跳位歧義** → D3 的 primary 概念決定 scroll 落點。
- **解剖 legacy 路徑套錯 10 科 config 形狀** → D6 獨立 adapter + 獨立驗證。
- **basename trap 回歸** → 回救急 return 續用 `BASE_URL` full-nav，不可退回 `navigate('/?...')`（memory neurons-router-basename-root-query-trap）。
- **既有 region drift check 誤觸** → topic 屬性不進 `hdt-region` 掃描；leaf-anchor gate 為獨立 pass。

## Migration Plan

1. Engine 改動（HTML topic 屬性由 build 注入、resolver、chip 升級、cram 連結）於 `track-neurons` worktree 開發。
2. Per-subject 對照資料逐科產出 + fact-verify；build gate 綠才算該科完成。
3. `pnpm run build:neurons-content` + `verify:handout` + typecheck + vitest 全綠 + Chrome MCP prod-equivalent smoke（SPA 三件套 + leaf deep-link 落點 + unavailable/escape）。
4. **Rollback**：純導覽 + 向後相容擴充 → 逐 requirement 可獨立 revert；資料錯綁可回退對照檔單條。無 schema migration 需 rollback。
5. Merge=部署（owner gate）：merge `track-neurons` → main 觸發 CF Pages，push 前 owner 確認。

## Open Questions

- 講義→猜題入口在 topic 底下的具體 UI 落點（inline chip vs region 尾 CTA）→ 交 apply 階段依既有「測驗本區」樣式對齊，非阻塞。
- 速看科目級入口跳講義頂 vs 該 block heading 最相關 region → 預設跳科目頂（誠實），apply 可依 heading 提供 best-effort region hint。
