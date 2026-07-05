## Why

考前最後衝刺（一階國考剩 12 天），dogfood 玩家最需要的是「按部就班覆蓋全部 11 科 + 化解焦慮」的踏實感。現有「今日處方箋」完成後只養成單一吉祥物 NG-0717（rolling 完成天數 → stage 1/3/6/10），缺少「逐科覆蓋」的可見痕跡。曾探索兩個方向並放棄：巡診路線圖（後被否）、與「11 隻完整各科可解鎖神經元」（經 Codex 批判性 review 判為 (a) 與既有 `neuron-variant-gacha` 重複造輪、(b) 引入 `X/11` 分母＝考前壓力條，打穿抗焦慮核心）。本 change 採 Codex 救回的最小版本：把 NG-0717 從單一吉祥物擴充為「分支印記」——玩家逐科完成每日處方，NG-0717 身上就長出該科的樹突芽（dendritic bud / lineage imprint）。給收藏解鎖 + 覆蓋全科的感覺，但刻意不做成 checklist、不與 gacha 打架、不引入任何分母。

## What Changes

- **NG-0717 分支印記（附加 layer，不取代）**：既有 NG-0717 主角成熟（rolling completed-days，stage 1/3/6/10 + keepsake）**完全保留不動**；分支印記是額外一層。
- **觸發**：某日「今日處方箋」兩行都完成後（`dayComplete`），對當天「開發新連結」(`breadthFamilyId`) 那一科寫入/推進一顆 imprint。當天 breadth 線為空（無 family、scope exhausted）則該日不長芽。修補線不指定科目印記，只照舊推進主角成熟（代表弱點收斂）。
- **升溫而非增量**：同一科已有 imprint 時不新增第二顆，只讓它從 `sprout → warm → myelinated` 質性升溫（`touches` 累積）；`myelinated` 為自然到達的里程碑（`touches ≥ 3`），不強求。
- **差異化命名**：對外一律稱「NG-0717 分支印記 / lineage imprints」，**不叫「各科神經元收藏」**。它是時限（考前 sprint）、靠努力（真的完成處方）賺的紀念性 keepsake，與 `neuron-variant-gacha`（開放式、花神經能量抽卡、玩收藏）語意不撞。
- **抗焦慮鐵律照守**：UI 絕不顯示 `3/11`、不顯示空 slot、不顯示「未解鎖科目」；沒長的科不佔位、不灰掉、不暗示缺口；**只渲染已長出的芽**。文案用「長出／留下印記／今天固化／新生分支」，禁用「收集完成／解鎖全部／尚缺／還差 X 科」。可有 bounded backend state，但前端絕不把 boundedness 當任務呈現。
- **渲染**：芽 branching/orbiting 繞著 `DailyPrescriptionCard` 內既有的 NG-0717 mascot，可點開看分支細節（in-card + 可展開）；**不新增 collection 分頁、不做 11 張完整角色卡**。
- **美術省成本**：不做 11 張 bespoke sprite——1 張共用的新生 dentate granule cell 底圖 + 每科 tint + 1–2 pixel accent。主 mascot NG-0717 仍用原 4 stages。
- **Out of scope（列為 next，本 change 不做）**：R2 sync / 跨裝置持久化、11 張 bespoke sprite、獨立 collection 分頁、選科演算法的「最久沒點過優先」偏壓（natural spread 先夠用）、任何分母／完成度 UI。

## Capabilities

### New Capabilities
<!-- 無新 capability；分支印記是既有處方箋能力（已擁有 NG-0717 collectible）的行為擴充。 -->

### Modified Capabilities
- `neurons-daily-prescription`: 新增一條 requirement 描述「NG-0717 分支印記」——完成當日處方後對 breadth 科目寫入/升溫 per-subject imprint（sprout → warm → myelinated），render 繞 NG-0717 mascot、只顯示已長出的芽、絕不外露 `X/11` 分母或缺口；state 存 local-only `meta`（`prescription:v1:ng0717:imprint:<subjectId>`），零 Dexie/R2/`SYNCED_META_KEYS` 改動。既有 NG-0717 rolling-day 成熟 requirement 不變。

## Impact

- **Code**：`apps/neurons-tw/src/lib/services/prescription.ts`（imprint 型別 + write-once 讀寫、在 `recordPrescriptionAnswer` 的 day-complete 路徑觸發）、`apps/neurons-tw/src/components/DailyPrescriptionCard.tsx`（芽渲染繞 NG-0717 + 可展開分支細節）、可能新增小 component（`Ng0717BranchView` / bud sprite）、`packages/theme-pixel-neurons`（1 張共用底圖 + per-subject tint 邏輯）。
- **Data / schema**：無變更。分支印記為 local-only `meta` write-once keys（`prescription:v1:ng0717:imprint:<subjectId>`），沿用既有 prescription 慣例；零 Dexie `.version()` bump、零 R2 `SCHEMA_VERSION` 改動、零 `SYNCED_META_KEYS` 新增。
- **Tests**：Vitest 覆蓋 imprint 觸發（僅在 `dayComplete` 且 `breadthFamilyId` 非空時）、同科不重複只升溫、`touches` 累積與 stage 推導（sprout/warm/myelinated）、write-once LWW 安全、no-denominator（不外露任何 `X/11` 或缺口）。
- **依賴／相容**：與既有 `neuron-variant-gacha` / `neuron-family-mastery` / `connectome-collection` 唯讀不耦合、語意不重疊；不改它們的 requirements。神經科學 mechanism 文字（adult-born dentate granule cell「新學習長出新記憶迴路」）於 design.md 依 PubMed-anchored 證據書寫，且遵循「成人人類 neurogenesis 為 contested → 當情感隱喻、fact-claim 錨定無爭議的顆粒細胞成熟過程」的既有紀律。
