## Why

The `neuron-variant-gacha` capability shipped with all 55 variant sprite keys mapped to a 1×1 transparent-PNG placeholder. Its own spec requirement explicitly anticipated the fix: *"A separate follow-up change SHALL replace the placeholders with real assets."* **This is that follow-up.**

The variant collection is the core 養成 payoff of neurons mode. When a player crosses an AP threshold and unlocks a variant slot, `VariantUnlockModal` plays a full reveal animation — but the artwork is currently invisible (1×1 transparent PNG), so the single highest-emotion moment in the game reads as a blank box with a name underneath. Generating these 55 sprites is the largest remaining launch gap (per the 2026-05-30 launch-readiness audit, all gameplay mechanics are complete — this is the visual payoff that's missing).

## What Changes

- Generate **55 GBA-era pixel-art variant sprites** (11 families × 5 career-stage slots), 384×384, 16-color quantized, transparent background, via Gemini MCP parallel calls — mirroring the archived `generate-neurons-sprites` recipe (per `image_gen_routing.md`: medium-complexity collectibles → Gemini-first).
- **Within-family coherence**: each family's 5 slots read as ONE neuron archetype *evolving* (slot 1 newcomer / 初代 → slot 5 legendary apex / 傳奇) — consistent neuron-type silhouette + escalating grandeur / accessories, drawing each per-slot persona name + flavour blurb verbatim from `NEURON_VARIANT_CATALOG` (`packages/content-neurons-tw/src/variants.ts`). NOT 5 unrelated creatures.
- **Across-family NT-branch color coding**: DA gold (藥理學 / 公共衛生學), 5HT red (寄生蟲學 / 組織學), GABA blue (生物化學 / 病理學 / 免疫學), Glu green (解剖學 / 生理學 / 胚胎學 / 微生物學) — same palette as the 11 family icons.
- Save to `packages/theme-pixel-neurons/sprites/variants/<familyId>-<slotIndex>.png` (Chinese filename segment mirrors the `sprites/subjects/<subjectId>.png` precedent).
- Refactor `packages/theme-pixel-neurons/src/sprites.ts`: add an `import.meta.glob('../sprites/variants/*.png', …)` block, map glob results to `variant:<familyId>:<slotIndex>` keys, and **replace the 55 `TRANSPARENT_PIXEL` entries** with the real URLs. Keep the `variant:default` terminal fallback + all other sprite categories (items / cosmetics / skill placeholders / core) on the placeholder.
- Extend `packages/theme-pixel-neurons/SPRITE_GENERATION.md` with the 55 prompts + per-sprite regen procedure.

**不做**：

- 不生其他 placeholder 類別（items 20 / cosmetics 20 / skill 36）— neurons-tw 沒有暴露對應頁面，留各自 consumer 未來再生。
- 不改 DMN fate-card art（已是 real pixel art）。
- 不補 `VariantUnlockToast` 元件 — spec 第 347 行要求 toast 但實作只有 modal，這是**既有 gap**，與本 change 無關，另案處理。
- 不改 gacha 機制 / 權重表 / catalog 文字 / spriteKey 命名。

## Capabilities

### New Capabilities

- 無

### Modified Capabilities

- `neuron-variant-gacha`: the requirement **"Theme pack SHALL register 55 placeholder variant sprite keys plus terminal default"** is MODIFIED — the 55 `variant:<familyId>:<slotIndex>` keys SHALL now resolve to **real pixel-art PNG files** (not the 1×1 transparent placeholder). The `variant:default` terminal fallback MAY remain the transparent placeholder. This is precisely the follow-up the original requirement text anticipated.

## Impact

- **Code**:
  - `packages/theme-pixel-neurons/sprites/variants/<55 files>.png`（新；each ~20–40 KB after 16-color quantize）
  - `packages/theme-pixel-neurons/src/sprites.ts`（modified：variant section 改用 `import.meta.glob`；其他 sections 不動）
  - `packages/theme-pixel-neurons/SPRITE_GENERATION.md`（extended：+55 prompts + regen procedure）
- **APIs**: 無
- **Dependencies**: 無 npm 新增（Gemini MCP + ImageMagick 皆既有工具）
- **Data**: 無 Dexie / R2 / event schema 變動（spriteKeys in catalog + `neuronVariants` rows 不變）
- **Backwards compat**: 純 asset 替換；任何 consumer（`VariantUnlockModal` / `FamilyPicker` / connectome `FamilyNode`）已透過 `SPRITE_MAP['variant:X:N']` 拿 URL 都會自然升級。已存在的 Dexie variant rows 的 `spriteKey` 字串不變，只是解析到的 URL 從 placeholder 變 real。
- **Bundle delta**: 55 sprites × ~30 KB ≈ ~1.6 MB raw；Vite 用 hashed URLs + `<img>` lazy load，不進 main bundle，只在 render variant 時請求。
- **Spec touched**: `neuron-variant-gacha`（1 requirement MODIFIED）
