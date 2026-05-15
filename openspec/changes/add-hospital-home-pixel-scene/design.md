## Context

二階 home 目前是純文字 UI，缺乏 visual progression。本 change 加入 pixel-art hospital scene，隨 tier 進化 + 顯示 assigned doctors 在對應科室。

**前置 capability**：
- `clinic-level-up`（✓ archived 2026-05-15）— 3-tier 升級邏輯（診所 / 區域醫院 / 醫學中心、聲望 1000 / 5000 門檻）
- `wire-hospital-reputation`（✓ archived 2026-05-15）— subject↔room mapping（內科 → ward、外科系 → surgery、家醫/小兒/皮膚/精神/復健/麻醉 → outpatient）
- `recruitment-gacha` + doctor sprite roster（✓ archived）— doctor sprite assets 已存在於 `packages/theme-pixel-hospital/sprites/doctors/`

**Grill summary**：`~/.claude/scratch/grilled-hospital-home-pixel-scene-2026-05-15.md` (Quick, 7 facets, 9 open uncertainties — 本 design.md 任務之一就是把這 9 個 lock 完)

**Stakeholders**：
- 作者本人（dogfood — 2026 H2 一階 國考準備期間自己玩二階）
- M_2nd track future fork dogfooders

## Goals / Non-Goals

**Goals:**

- 二階 home 視覺化呈現 hospital tier + assigned doctors
- 三 tier visual progression 一目了然（建築規模 + 細節遞增）
- Doctor sprite 出現在「對應科室」位置（不是 random）
- 點 building 觸發 upgrade modal（讓 tier-up condition 一目了然）
- 純 additive — 失敗時可走 `?scene=off` feature flag 退回純 text home
- Mobile + desktop responsive

**Non-Goals:**

- Doctor / patient walk-cycle 動畫
- 晝夜 / 天氣 / 季節 layer
- Patient queue / waiting room sprite
- 可拖動 / 自訂擺位（玩家不能改 doctor position）
- Doctor sprite 點擊互動（MVP 不可點，繼續走 `#/roster`）
- Room slot 點擊互動（沒 room detail view，做了等於要先做整個 view）
- Tier transition cross-fade 動畫（MVP 瞬切，stretch goal）
- 動態 weather / lighting

## Decisions

### D1: Scene asset 策略 — 3 張完整 PNG（不走 overlay layers / room-grid composition）

**Decision**: 3 個獨立 full-art PNG，tier 升級瞬間整張換掉。

**Why**:
- Layered overlay 需要 base + 2 transparent diff layers，prompt 工作量 ≈ 3 張獨立 scene + 對齊驗證
- Room-grid CSS composition 喪失「整體建築」視覺敘事感
- 3 張 PNG asset size 預估 < 100 KB / 張（pixel art + transparent / palette quantize），3 × ~80 KB 不爆 bundle

**Alternatives considered**:
- Base + overlay layers：rejected — alignment overhead 高
- CSS sprite grid composition：rejected — 失去整體建築感

### D2: Scene 尺寸 — 768×384

**Decision**: Scene PNG 解析度 **768×384**（寬 banner-style），不是 384×384 grid。

**Why**:
- Hospital scene 是「橫向建築群」性質，寬比長更自然
- 視覺震撼感 > prompt reuse 度（後者用 prompt template 解決）
- 768 px 在 desktop 不需縮放，mobile (< 768px) 等比縮到 viewport 寬

**Alternatives**:
- 384×384：rejected — 縱橫比失衡，建築群會擠
- 1024×512：rejected — bundle 過大、mobile 縮放比例難看

### D3: Doctor 顯示 — subject-bound slot positions

**Decision**: 每張 tier scene 預先標記 N 個 doctor slot 座標（hard-coded in `theme-pixel-hospital` config），slot 對應科別。

**Slot 數量階梯**：
- Tier 1 (診所)：**2 slot** — ward (內科) ×1、outpatient (家醫/小兒/皮膚等) ×1
- Tier 2 (區域醫院)：**5 slot** — ward ×2、outpatient ×2、surgery (外科/婦產手術/骨科/泌尿/耳鼻喉/眼科) ×1
- Tier 3 (醫學中心)：**8 slot** — ward ×3、outpatient ×3、surgery ×2

**Render rule**：
- Roster 內 assigned doctor 該 slot 顯示對應 sprite (`<DoctorSprite>`)
- 該 slot 無 assigned doctor → 空（不顯示 placeholder）
- 同一 slot 多名 doctor → MVP **只顯示第一個** (assignment order)
- Doctor sprite 大小：96×96 px（小於建築、但可辨識）

**Subject↔slot mapping table**（reuse `wire-hospital-reputation`）：
```ts
const SUBJECT_TO_ROOM: Record<string, 'ward' | 'outpatient' | 'surgery'> = {
  '內科': 'ward',
  '外科': 'surgery',
  '骨科': 'surgery',
  '婦產科': 'surgery',
  '耳鼻喉科': 'surgery',
  '眼科': 'surgery',
  '泌尿科': 'surgery',
  '家醫科': 'outpatient',
  '小兒科': 'outpatient',
  '皮膚科': 'outpatient',
  '精神科': 'outpatient',
  '復健科': 'outpatient',
  '神經內科': 'ward',
  '麻醉科': 'outpatient'
}
```

**Why subject-bound (not roster order / random)**:
- 視覺直覺：「內科醫師在內科診間」符合 mental model
- Deterministic：dogfood debug 友善
- Reuses existing reputation affinity table（不另外維護）

### D4: Layout — Scene 在 status text 上方（擴充式）

**Decision**: Scene 加在 home top bar 之下、現有 status text (「醫院：診所 / 營收 / 聲望」) 之上。現有 text 不動。

**Why**:
- 純 additive — feature flag `?scene=off` 可直接 hide Scene、回到原 home
- 失去 scene visibility 也不破壞既有 mechanic
- 文字資訊仍是 single source of truth（screen reader / 視障 friendly）

**Mobile vs desktop**:
- Desktop / tablet (≥ 768px)：Scene 置中、max-width 700 px、padding 16px
- Mobile (< 768px)：Scene 等比縮放鋪滿寬度、max-height 320 px 避免占滿初屏
- Scene 高度固定 240–320 px（避免 layout shift）

### D5: Interactivity — 點 building 觸發 UpgradeModal

**Decision**: Scene 上有可點 building hit area，click → 觸發 `<UpgradeModal>`（顯示當前 tier / 下一 tier 解鎖條件 / 升級進度 bar / 升級 button）。

**Hit area**:
- 簡單版：整張 Scene 都可點（hit area = whole `<HospitalScene>` container）
- 進階版：只 building polygon 可點（hit-test via fixed coords per tier scene）
- **MVP 採整張可點** — 簡單、deterministic、mobile touch friendly

**UpgradeModal 內容**:
- 當前 tier name (e.g. "區域醫院")
- 下一 tier name + 解鎖條件 (e.g. "醫學中心 — 聲望達 5,000")
- Progress bar（當前聲望 / 解鎖門檻）
- "升級" button：聲望達標時 active，未達 disabled + tooltip 顯示差距
- "關閉" button
- Tier 3（已到頂）時：button 區隱藏、顯示「已達最高 tier」message

**Why 點 building**:
- Tier-up 是目前 home 隱形的 mechanic（玩家不主動點哪裡會跳出升級資訊）
- Building click 是直覺手勢，符合「點建築看建築狀態」mental model

**Why not 點 doctor / room**:
- Doctor click → roster highlight 需 cross-route state，scope 暴增
- Room click → 沒 room detail view，做了等於要先做整個 view

### D6: Tier visual narrative — 視角均一、規模 + 細節遞增

**Decision**: 3 張 scene 都是同一視角（top-down 3/4 isometric），但 building 數量 + 細節遞增。

**Tier 1 (診所)**:
- 1 棟小建築（單層）
- 招牌「○○診所」+ 簡單前庭 + 1 棵樹
- 入口：自動門 / 階梯
- Doctor slot 2 個（ward × 1、outpatient × 1）

**Tier 2 (區域醫院)**:
- 2-3 棟連接建築（2-3 層樓）
- 大型招牌 + 救護車入口 + 樹木 / 灌木 / 路燈裝飾
- 玻璃帷幕 / 多窗戶
- Doctor slot 5 個（ward × 2、outpatient × 2、surgery × 1）

**Tier 3 (醫學中心)**:
- 4-5 棟建築（4-5 層樓）+ 連接走廊
- 直升機停機坪 + 大型 emergency entrance
- 多層樓 + campus 圍欄 + 路燈 + 候診長椅 + 急救車
- 旗桿 / 醫院 logo / 大型 LED 招牌
- Doctor slot 8 個（ward × 3、outpatient × 3、surgery × 2）

**Style constraints**（all 3 tiers）:
- GBA-era pixel art (16-color quantize、no anti-alias、palette-limited)
- Top-down 3/4 isometric perspective
- Transparent background
- Color palette 沿用既有 `theme-pixel-hospital` (warm earth tones + clinical white/blue accent)

### D7: Asset generation pipeline

**Decision**: 走 `~/.claude/imports/codex_image_gen.md` 配方，parallel batch 3 tier scene。

**Prompt template**（每 tier 套用 + 替換 `<tier-specific>`）:
```
Generate a 768×384 transparent PNG, GBA-era pixel art style, 16-color quantized,
top-down 3/4 isometric perspective. Subject: <tier-specific>.
Color palette: warm earth tones + clinical white/blue accent. No text, no UI elements,
no people. Building(s) only. Save the result to /tmp/hospital-tier<N>-<name>.png. $imagegen
```

**Tier-specific 替換**:
- Tier 1: "a small single-story Taiwan medical clinic with simple front yard, one tree, and clinic sign"
- Tier 2: "a medium-sized 2-3 story Taiwan regional hospital with ambulance entrance, multiple connected buildings, trees and street lights"
- Tier 3: "a large 4-5 story Taiwan medical center campus with helipad, emergency entrance, multiple buildings, hospital flag, fencing, and street furniture"

**Wall time 預估**:
- Single batch (one at a time): 60-90 min
- Parallel batch via codex CLI background: 30-40 min
- 若任何 tier 失敗 → 個別 re-run，不重做整批

**Asset storage**: `packages/theme-pixel-hospital/sprites/scenes/hospital-tier{1,2,3}-{clinic,regional,medical-center}.png`

**Doctor sprite 不重新生**：reuse 既有 `packages/theme-pixel-hospital/sprites/doctors/*.png`（M_2nd `add-doctor-sprite-roster` 已生）

### D8: Theme contract 擴充

**Decision**: `THEME_PIXEL_HOSPITAL` 加 2 個新 field。

```ts
export const THEME_PIXEL_HOSPITAL = {
  // ...existing fields
  scenes: {
    tier1: '/sprites/scenes/hospital-tier1-clinic.png',
    tier2: '/sprites/scenes/hospital-tier2-regional.png',
    tier3: '/sprites/scenes/hospital-tier3-medical-center.png'
  },
  doctorSlotPositions: {
    tier1: [
      { room: 'ward', x: 256, y: 200 },
      { room: 'outpatient', x: 480, y: 200 }
    ],
    tier2: [
      { room: 'ward', x: 180, y: 180 },
      { room: 'ward', x: 260, y: 180 },
      { room: 'outpatient', x: 440, y: 180 },
      { room: 'outpatient', x: 520, y: 180 },
      { room: 'surgery', x: 600, y: 220 }
    ],
    tier3: [
      // 8 slots, positions tuned post-generation
      // ward × 3, outpatient × 3, surgery × 2
    ]
  }
}
```

**Tier 3 slot positions**：先佔位、asset 生成後依實際 building 位置 fine-tune（design.md commit 後不阻塞）。

**Why expose in theme contract**:
- 符合 `theme-pack-contract` capability「content / theme 與 engine 解耦」原則
- Fork 開發者改 hospital 風格時（例：scifi clinic / 中世紀宮廷醫療館）也能改 slot 座標 + scene assets

### D9: Feature flag — `?scene=off` emergency退路

**Decision**: 加 URL query param `?scene=off`，讀到時 `<HospitalScene>` 直接 return null。

**Why**:
- Asset 生成失敗 / loading 太慢 / palette 醜爆 → 玩家自己加 `?scene=off` 立即降級
- Dogfood 階段方便 A/B 對比
- 不需要全 user setting / DB state

**Implementation**:
```tsx
const params = new URLSearchParams(location.search)
const sceneEnabled = params.get('scene') !== 'off'
if (!sceneEnabled) return null
```

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Codex 生成的 scene 風格跟既有 doctor sprite 不一致 | Prompt template 強制「16-color quantize, GBA pixel art, warm earth tones + clinical white/blue」；asset 驗收標準 = scene 跟 doctor sprite 並置看起來「同一個風格」 |
| Asset bundle size 爆（3 × 100 KB+ 不算多但仍 +0.3 MB） | 16-color quantize + palette-limited，typical pixel art 80–120 KB；接受；若爆 200 KB 改 64-color → 32-color → 16-color |
| Doctor slot 座標 hard-code 後若 scene 重生 visual mismatch | Slot positions 跟 scene asset 綁定發 patch；scene 重生 → slot 座標重新 tune |
| Tier 3 slot 8 個有點擠 / 視覺爆炸 | Tier 3 slot 數可從 8 降到 6（dogfood 後決定）；spec 寫 "6-8 slot" 給彈性 |
| Mobile (< 480px) doctor sprite 96×96 縮放後太小 | Mobile 顯示簡化版（hide doctor sprite、僅顯示 building）；feature flag `?scene=building-only` |
| Tier upgrade 瞬切 visual jarring | MVP 接受 jarring（升級是大事件，瞬切反而有 "ding!" 感）；後續加 200ms cross-fade 是 trivial enhancement |
| Codex Plus quota 用完 / 過期（trial 2026-06-07 結束） | Asset 生成階段優先做完，scene PNG commit 進 repo（vendored），之後不依賴 codex |
| 跟一階 in-progress `add-cosmetic-and-dorm` 共用 sprite-layer 邏輯 | 兩個 change 用同樣的 `position: absolute` overlay 技法，但 scope 不衝突；本 change implementation 不依賴 cosmetic 的進度 |
| Scene asset alt text accessibility | `<img>` 加 alt="Hospital scene: <tier name>"；screen reader 仍能讀到 status text；本 change accessibility 不退步 |

## Migration Plan

純 additive feature、無 migration 需求：

1. **Phase 1 — Asset generation**：codex 生 3 tier scene PNG，視覺驗收（並置 doctor sprite 對比）
2. **Phase 2 — Theme config**：擴充 `theme-pixel-hospital` 加 `scenes` + `doctorSlotPositions`
3. **Phase 3 — Component**：`<HospitalScene>` + `<UpgradeModal>`（後者若不存在）
4. **Phase 4 — Integration**：`HomePage.tsx` 加入 `<HospitalScene>`
5. **Phase 5 — Responsive verify**：Chrome MCP 跑 desktop / mobile / hash route navigation
6. **Rollback strategy**：純前端、純 additive — bug 出現直接 revert PR，或 ship `?scene=off` 給 user

## Open Questions

全部已 lock 進 Decisions（grill 留的 9 open uncertainty 100% closed）：
- ~~Scene 尺寸~~ → D2 鎖 768×384
- ~~Tier 1 slot 數量~~ → D3 鎖 2 / 5 / 8
- ~~多名同科 doctor 處理~~ → D3 鎖「只顯示第一個」
- ~~Tier upgrade 動畫~~ → D6 / D5 鎖瞬切（cross-fade stretch）
- ~~Building click hit area~~ → D5 鎖「整張 Scene」
- ~~Mobile 縮放策略~~ → D4 鎖等比縮放 + max-height 320 + 後續可加 `?scene=building-only`
- ~~Mapping table reuse 程度~~ → D3 100% reuse + 補 14 科完整 mapping
- ~~3 個 OOS lock~~ → Non-Goals 已明確鎖（動畫 / 晝夜 / patient queue）
- ~~Feature flag 退路~~ → D9 鎖 `?scene=off`

**Apply 階段 dogfood-driven 微調項**（不阻塞 spec lock）：
- Tier 3 slot 座標 fine-tune（asset 生成後依實際 building 位置）
- 96×96 doctor sprite 大小是否需要 tier-specific 調整（tier 3 場景大、可能需 80×80 才不爆）
- UpgradeModal 視覺風格細節（顏色、字體）
