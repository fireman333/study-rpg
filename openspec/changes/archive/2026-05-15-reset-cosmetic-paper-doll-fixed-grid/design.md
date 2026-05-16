## Context

M5 `add-cosmetic-and-dorm` ship 後 cosmetic system 視覺有結構性 alignment 問題，背後是兩個獨立但耦合的 root cause：

1. **Character-base 不是 paper-doll 友善的 sprite** — 把 bg + 預設配件 baked-in 進同一張 PNG，違反 paper-doll 系統的「base 只畫裸體 + transparent bg」前提
2. **Cosmetic sprite 主物件畫滿 canvas** — codex generation 預設把主物件置中放大，沒有「主物件在特定 anatomy band 內、其他 transparent」的 prompt 約束

之前的 sprite v2 fix（commit `ec53b40`）只縮了 2 張個別 sprite 的尺寸，沒解決 root cause。第三個嘗試 `dorm-cosmetic-css-transforms-2026-05-15.patch` 用 per-category CSS transform 補救 — 是 band-aid。

業界 2D pixel paper-doll 常見有兩種 convention：
- **A. LPC / Mana Seed fixed-grid** — sprite 直接畫在絕對位置，renderer 純 z-stack
- **B. Anchor metadata JSON** — sprite 帶 `{ slot, anchor: {x,y} }`，renderer 讀 JSON 對齊

研究後（agent 報告）採 **A**：對 React + PNG + 純 DOM stack 最直接、未來新 cosmetic = 一個 prompt 就生、無需 metadata schema 演進。Stardew Valley / 90% 2D RPG 走此 pattern。

## Goals / Non-Goals

**Goals:**
- Cosmetic sprite 與 character-base anatomy 視覺對齊，無需 CSS transform
- character-base 真正 paper-doll 友善（transparent bg + 無 baked-in cosmetic items）
- Sprite-generation 規格可重現 — 任何人按 spec 重生都得到 bbox-compliant sprite
- Renderer 簡化（純 z-index stack）
- 既有玩家 IndexedDB save 0 migration（cosmetic ID 全保留）

**Non-Goals:**
- 不變更 `ThemePack` / `Cosmetic` / `EquipSlot` API surface
- 不重整 cosmetic catalog 內容（20 個 item 不增不減、unlock condition 不動）
- 不換 layering 機制（仍是 stacked `<img>`、不引入 canvas/WebGL）
- 不引入 sprite metadata JSON（拒絕 anchor-per-item 方案）
- 不重生 4 個 background cosmetic（full-canvas、無 anchor 問題）
- 不重整 home view CharCard 整體版面（僅可能補 fallback bg wrapper、屬 minimal touch）

## Decisions

### D1. Strict bbox table per category，寫進 cosmetic-system spec

對應 384×384 canvas、直立人物佔中央 60–70%：

| Category | bbox X | bbox Y | Size (W×H) | Anatomy anchor |
|---|---|---|---|---|
| head | 130–254 | 40–160 | 124×120 | 臉部+瀏海+眼鏡/帽 |
| body | 100–280 | 140–300 | 180×160 | 肩→腰，白袍/衣服 |
| accessory | 100–280 | 160–260 | 180×100 | 胸口層級，聽診器/徽章 |
| held | 80–200 | 240–340 | 120×100 | 左手 grip 位置 |
| background | 0–384 | 0–384 | 384×384 | full-canvas, no bbox needed |

**Rationale**: 座標基於現有 character-base 視覺比例估算 + 直立人物 humanoid 標準 anatomy 比例（頭佔 1/4-1/3 縱長、肩在 35-40% Y、左手在 70% Y）。

**Alternative considered**: Loose anchor band（grill facet 3 選項 B） — codex prompt 給「Y 區間 + 主物件不超 X% canvas」，視覺大致對齊。Rejected：grill 階段確認要 strict（避免將來再生時 drift 回 v1 狀態）。

### D2. Character-base v2 必須 transparent bg + 無 baked-in cosmetic items

V2 anatomy spec（codex prompt 用）：
- Canvas: 384×384, **transparent bg**
- Head center: X 192, Y 100（臉佔 Y 40-160 區帶）
- Torso center: X 190, Y 220（肩 Y 140, 腰 Y 300）
- Left hand grip: X 130, Y 290（持物位置）
- Right hand: X 250, Y 290（垂於體側）
- **無 baked-in**：聽診器、書、桌子、植物、燈、書櫃
- **保留**：brown hair / 中性 medical student look / white shirt（蓋白袍 cosmetic 時可見）/ 16-color palette

**Rationale**: paper-doll 系統的硬性前提。Baked-in 配件會跟 cosmetic 重疊（聽診器 cosmetic + baked-in 聽診器 = 兩個）。Baked-in bg 會擋 dorm-default cosmetic。

**Alternative considered**:
- 雙 sprite（home view 用有 bg 版、dorm 用 transparent 版） — Rejected：增加 maintenance + character-system 有「character has one canonical portrait」隱含假設
- 接受現狀不 regen base — Rejected：grill 階段 facet 1 已選 regen v2

### D3. Manifest-driven regeneration，prompt 模板加 bbox constraint

每個 cosmetic 在 `sprites.manifest.json` 的 prompt field 加入 bbox 描述：

```
Place the <object> within pixel bbox X=<a>-<b> Y=<c>-<d> on a 384x384 transparent canvas.
Rest of canvas MUST be fully transparent. 16-color GBA pixel art palette.
```

Character-base 兩張 prompt 加：
```
384x384 transparent background (alpha=0 outside character silhouette).
NO baked-in accessories (no stethoscope, no book, no notebook).
NO baked-in furniture (no desk, no shelf, no lamp, no plants).
Character only — head, torso, arms, hands, legs.
Anatomy: head center X=192 Y=100, torso center X=190 Y=220, left hand grip X=130 Y=290.
```

**Rationale**: `character-system` 既有 "Reproducible sprite generation" requirement 已強制 manifest-driven。本 change 只是把 prompt 規格收緊，不變更 generate-sprites pipeline。

### D4. 「先全跑 + Chrome MCP smoke、不 ok 才 fix」strategy

Apply 階段 batch 跑 18 張 sprite regeneration（2 base + 16 cosmetic），完成後 Chrome MCP dorm equip smoke。違規 sprite 列 retry list 個別重生。

**Rationale**: grill facet 4 已選此 strategy。第一輪預期 1–3 張 bbox violation（基於 v1 經驗）。100% retry-until-honor 成本 ~1.5–2 hr 不值，「先全跑」+ post-hoc fix 比較 efficient。

**Acceptance threshold（不需 retry 的視覺差）**:
- bbox 外溢 ≤ 5 pixel
- 16-color palette drift ≤ 1 颜色（subtle hue shift OK）

**Alternative considered**: Per-sprite verify-before-next — Rejected：序列依賴讓總 wall time 拉長 30-50%。

### D5. Home view CharCard fallback bg — defer to apply

V2 char-base transparent 後 home view 視覺會「光禿」。是否補 fallback bg（CSS gradient / 或 reuse dorm-default sprite as bg）是 apply 階段的視覺 judgment call，不在本 change 的 spec 寫死。

**Rationale**: 真實的視覺降級程度只有 v2 sprite 跑出來才看得到。寫死在 spec 反而限制 apply 階段彈性。tasks.md 會列「v2 char-base 跑完後人工視覺檢查 home view，決定要不要補 fallback bg wrapper」。

### D6. Spec scope — 強化既有 requirement 而非開新 capability

本 change 不開新 capability。三個既有 capability 改 delta：
- `cosmetic-system`: MODIFIED 「Cosmetic sprite alignment」+ ADDED 「Cosmetic sprite bbox compliance table」
- `theme-pack-contract`: MODIFIED 「Cosmetic-capable theme packs」（加 bbox compliance 條款）
- `character-system`: MODIFIED 「Theme pack ships at least one alternate character variant」+「Visual parity between variants」（加 transparent bg + no baked-in cosmetic items）

**Rationale**: 沒有引入新概念（paper-doll、grid、anchor 都是 implementation pattern，不是 capability）。把 bbox 規格綁進既有 sprite spec 比開新 capability 更貼近 OpenSpec 「capability = 對外可觀察行為」哲學。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Codex 不 honor bbox（v1 經驗 1–2 張破） | 「先全跑 + smoke、不 ok 才 fix」strategy；apply 階段預留 30–45 min retry budget |
| v2 char-base 視覺太光禿、home view 不好看 | Apply 階段 task 7 人工視覺檢查 + 可選補 fallback bg wrapper |
| Manifest prompt 寫死 bbox 後未來 character 比例改變（例如改成 chibi 風） | bbox table 在 spec 內，未來如真改風格屬於另一個 change，重寫 bbox + regen 全套 |
| 16-color palette drift（codex 偶爾飄色） | Acceptance threshold 容許 ≤ 1 hue shift；明顯飄色才 retry |
| 玩家 IndexedDB save 跟新 sprite ID 對不上 | 不會發生 — cosmetic ID 全保留、只是 PNG bytes 變；silent swap |

## Migration Plan

**Apply step（high-level，詳細 tasks.md 列）**:

1. Backup v1 sprites: `cp -r packages/theme-pixel-medical/sprites packages/theme-pixel-medical/sprites.v1-backup`（rollback safety）
2. Update `sprites.manifest.json` — character-base 兩張 + 16 cosmetic prompts 加 bbox / transparent / no-baked-in 約束
3. Regen 2 base + 16 cosmetic（batch via `generate-sprites.ts`，~60-80 min wall）
4. Visual inspect + Chrome MCP smoke（home / dorm / each category equip）
5. Retry bbox-violation sprite 個別（預期 1-3 張）
6. Visual judgment: home CharCard 是否需要 fallback bg wrapper（D5）
7. Delete `dorm-cosmetic-css-transforms-2026-05-15.patch`（scratch，本來就沒 apply）
8. Commit + archive

**Rollback strategy**: 任何階段失敗 → `rm -rf packages/theme-pixel-medical/sprites && mv packages/theme-pixel-medical/sprites.v1-backup packages/theme-pixel-medical/sprites`。Spec deltas 還沒 sync 進 main specs 前 rollback 是純 file-level。

## Open Questions

- **bbox 座標精確值** — 表內座標基於現有 char-base 估算，v2 transparent 版 anatomy 可能微偏。Apply 階段第一張 v2 char-base 跑出來後可能需 amend ±5-10 px。屬於 normal iteration、不阻塞 propose
- **Home CharCard fallback bg 風格** — D5 已 defer 到 apply。若補，候選方案：CSS linear-gradient（cheap）/ reuse 既有 dorm-default sprite（consistency）/ 新生一張 home-room-bg sprite（最高品質、多生 1 張）
- **未來 character-base variants（女、其他職業）** — 既有 character-system spec 已要求 male + female 兩變體；本 change 只 regen 這兩張。未來如加第三變體屬於另一個 change
