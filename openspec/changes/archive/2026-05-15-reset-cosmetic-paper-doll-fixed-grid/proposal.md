## Why

Cosmetic system 上線後（M5 archive `add-cosmetic-and-dorm`）視覺品質有結構性問題，已超出 sprite v2 個別修補能解決的範圍：

1. **character-base 把 bg + 聽診器 + 書 baked-in 進同一張 PNG** — dorm-default 背景永遠看不見、玩家 equip 聽診器/書時會與 baked-in 物件疊兩個
2. **AI 生的 cosmetic PNG 把主物件畫滿 384×384 canvas** — 跟 character-base 解剖位置不對齊，靠 per-category CSS `transform` band-aid（`dorm-cosmetic-css-transforms-2026-05-15.patch`）勉強對齊但脆弱
3. **既有 spec `cosmetic-system` 的對齊 requirement 寬鬆**（「≤ 10 px tolerance, 視覺 QA」）— 缺乏 normative bbox 規格，未來生 sprite 重蹈覆轍

走 **LPC / Mana Seed fixed-grid convention**（業界標準 paper-doll pattern）：每個 cosmetic PNG 重畫成「主物件已在 384×384 canvas 正確絕對位置、其他全透明」，character-base 重畫成 transparent bg + 移除 baked-in 配件，renderer 維持純 z-stack `<img>` 零 transform。

## What Changes

- **Regen `character-base` + `character-base-female`** — transparent bg, 移除 baked-in 聽診器/書/桌/植物/燈/書櫃，保留醫學生視覺識別
- **Regen 16 個 anchor-required cosmetic** (`head/body/accessory/held` × 4) 用 strict bbox per category — codex prompt 鎖死像素座標
- **新增 normative bbox table** — sprite 必須對應 anatomy band（head 130-254×40-160、body 100-280×140-300、accessory 100-280×160-260、held 80-200×240-340）
- **強化 cosmetic sprite alignment requirement** — 從「視覺 QA ≤ 10 px tolerance」改成「bbox compliance 為 normative spec violation」
- **強化 character-base transparency requirement** — 明訂 character-base sprite 必須 transparent bg + 不含 baked-in cosmetic items
- 4 個 background cosmetic **不動**（full-canvas，無 anchor 問題）
- **BREAKING（視覺層）**：home view CharCard 不再有 baked-in scene 視覺。需透過 dorm-default bg 或 fallback wrapper 提供背景；既存玩家 IndexedDB save 不受影響（character-base 不在 save schema）

## Capabilities

### New Capabilities

無 — 本 change 純粹強化既有 capability 規格與重生 asset。

### Modified Capabilities

- `cosmetic-system`: 強化「Cosmetic sprite alignment with character-base」requirement，加入 normative bbox table；alignment 從視覺 QA 升級為 spec violation
- `theme-pack-contract`: 「Cosmetic-capable theme packs MAY expose cosmetic sprite keys」requirement 補入 bbox compliance 條款
- `character-system`: 「Theme pack ships at least one alternate character variant」+「Visual parity between variants」requirement 補入 transparent bg + no baked-in cosmetic items 條款

## Impact

**Affected code**:
- `packages/theme-pixel-medical/sprites/character-base.png` + `character-base-female.png`（regen）
- `packages/theme-pixel-medical/sprites/cosmetic-{head,body,accessory,held}-*.png` × 16（regen）
- `packages/theme-pixel-medical/scripts/sprites.manifest.json`（更新 prompts 加入 bbox constraints）
- `apps/medexam-tw/src/components/CharCard.tsx` 或 styles.css（可能需要 fallback bg wrapper，視 v2 char-base 視覺效果決定）
- `dorm-cosmetic-css-transforms-2026-05-15.patch`（scratch，本 change 確認不 apply 並刪除）

**Affected APIs**: 無 — `ThemePack`、`Cosmetic`、sprite key naming 全部不變

**Affected dependencies**: 無新增

**Affected systems**:
- Home view CharCard 視覺降級（baked-in scene 不見）— 視 apply 時 v2 視覺再決定是否補 fallback
- Dorm view 視覺升級（dorm-default bg 可見、cosmetic 對齊正確）
- IndexedDB save schema 不變、既有玩家 cosmetic equip state 不受影響

**Risk**:
- Codex regen 不一定每張都 honor bbox — 走「先全跑 + Chrome MCP smoke、不 ok 才 fix」strategy（grill facet 4 已鎖）
- v2 char-base 視覺如果太「光禿」可能需要 home CharCard 補 fallback bg — 屬於 apply 時的 visual judgment，不阻塞 propose

**Backup**:
- Apply 第一個 task = `cp -r packages/theme-pixel-medical/sprites sprites.v1-backup/`（rollback safety）
- 失敗可一鍵 revert，不影響 git history
