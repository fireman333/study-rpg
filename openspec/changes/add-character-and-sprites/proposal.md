## Why

目前角色 = `見習醫師 Lv.1` 純文字、4 個屬性 bar，沒有視覺存在感；20 個 item 也只有 `name + flavor` 沒 sprite。要做「能穿戴裝備」的養成 RPG 體感，至少需要：

1. **角色 portrait sprite** — 玩家對「我的角色」有視覺認同（Tamagotchi / Pokémon 第一晚都是先看角色 portrait）
2. **20 個 item sprite icons** — 抽到 Aspirin 時 reveal 顯示一張藥丸 sprite 比純文字「RARE / Aspirin」更有 dopamine
3. **裝備 slot tile** — 角色卡上 4 個方格顯示「目前 head / body / weapon / charm 穿什麼」，點 inventory 可切換裝備

不做 paper-doll layering（裝備視覺合成上身）— LLM 生圖無法穩定產 pixel-aligned 多層 sprite，pixel artist 手繪是 M3+ 範疇。

利用既有的 `cdx image` skill（Codex Plus trial OAuth、無 per-image cost、走 gpt-image-2）批次生 21 張 pixel art sprite，由 subagent 自動化。

## What Changes

- **新增 `character-system` capability**：定義 Player 的視覺呈現（character sprite + equip slot rendering）、character name 自訂、equip/unequip 互動
- **新增 sprite assets**：`packages/theme-pixel-medical/sprites/` 下 21 張 PNG（1 character base + 20 items），統一 GBA-era pixel art 風格
- **新增 sprite generation pipeline**：`packages/theme-pixel-medical/scripts/generate-sprites.ts` — 給定 manifest JSON 跑 `cdx image` 批次（reproducibility，不只 ad-hoc subagent run）
- **更新 `THEME_PIXEL_MEDICAL.sprites`**：填入 21 個 sprite key → import path
- **更新 `apps/medexam-tw/src/App.tsx`**：角色卡顯示 character sprite + 4 個 equip slot tile；抽卡 reveal 顯示 item sprite；inventory grid 顯示 item sprite icon；點 inventory item 觸發 equip/unequip
- **更新 `Player.equipment` 互動**：MVP 提供「點 inventory item → 自動裝備到對應 slot；點 equipped slot → unequip」邏輯
- **不 BREAKING**：`Item` / `ThemePack` interface 不動，只是 `theme.sprites` map 從空 `{}` 變成有 21 個 entries

## Capabilities

### New Capabilities
- `character-system`: Player 的視覺呈現（portrait sprite）+ 4 slot 裝備互動（equip/unequip）+ character name 自訂；定義「sprite key 對應 theme.sprites map」與「equipped 顯示規則」

### Modified Capabilities
（無 — `item-catalog` capability 還沒 archive 進 main specs，theme.sprites map 是 ThemePack interface 既有欄位、不算 spec-level breaking）

## Impact

- **Files**: `apps/medexam-tw/src/App.tsx` (重寫角色卡 + inventory UI + equip 互動)、`packages/theme-pixel-medical/sprites/*.png` (21 個新檔，二進位)、`packages/theme-pixel-medical/scripts/generate-sprites.ts` (新 script)、`packages/theme-pixel-medical/src/index.ts` (sprites map 填料)、`packages/theme-pixel-medical/src/items.ts` (確認 artKey 對應 sprite key)
- **APIs**: 無 breaking
- **Dependencies**: 無新增；`cdx image` skill 已是 global 可用
- **Cost**: Codex Plus trial OAuth → gpt-image-2 → 無 per-image cost（trial 期到 2026-06-07）
- **Tests / verify**: 主 thread 重啟 dev server 手動測 — 角色卡顯示 sprite、抽卡 reveal 顯示 item sprite、點 inventory 切換裝備、equip slot tile 反映變化
- **Sprite consistency risk**: subagent 須在前 3 張 smoke 後 pause 等 user review 才繼續剩 18 張（avoid burning 21 calls on bad-vibe outputs）
