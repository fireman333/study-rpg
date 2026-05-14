## Why

目前 `character-base.png` 只有一個 male 醫學生 portrait — 預設角色就是固定的他。Player 沒選擇角色性別 / 外觀的入口，identity 沒得自訂。

養成型 RPG 的第一個 dopamine 路徑是「這是我的角色」— Pokémon / Stardew / Animal Crossing 開場都讓玩家選性別 + 外觀。本 change 新增最小可行版本：**可切換 male / female 兩個角色 sprite**，character creation 階段選一次、之後可在角色卡上 toggle。

技術上以**generalizable `characterSpriteKey` field** 設計（不寫死 male/female enum），未來加皮膚色、髮型、衣著變體都接得進來。

## What Changes

- **新增 `character-base-female.png`** sprite（384×384，跟 male 版同 prompt 風格 + female 替換 + 同樣 cozy 書房背景，由 `cdx image` 生成）
- **Player 加 `characterSpriteKey?: string` field**（optional，default `'character-base'`；non-breaking — 既有 player 序列化資料 fall back 到 male）
- **CharCard 加 character toggle 按鈕**（小箭頭 ◀ ▶ 在 sprite 兩側，點擊循環 `character-base` ↔ `character-base-female`）
- **Theme map 加 `'character-base-female'` key** 對應新 sprite
- **Manifest 加 `character-base-female` entry**（reproducible 重生用）
- **不 BREAKING**：`Player.characterSpriteKey === undefined` 自動 resolve 為 `'character-base'`；舊存檔讀回來自動 fall back

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `character-system`: 從「single fixed character sprite」擴展為「switchable character sprite variants」；新增 ≥ 1 female option + extensible variant key

## Impact

- **Files**: `packages/theme-pixel-medical/sprites/character-base-female.png`（新）、`packages/theme-pixel-medical/src/sprites.ts`（加 import + map entry）、`packages/theme-pixel-medical/scripts/sprites.manifest.json`（加 entry）、`packages/core/src/types.ts`（`Player` 加 optional `characterSpriteKey`）、`apps/medexam-tw/src/components/CharCard.tsx`（toggle UI）、`apps/medexam-tw/src/App.tsx`（state handler）、CSS
- **APIs**: 非 breaking — 加 optional field
- **Dependencies**: 無
- **Cost**: 1 codex image gen call，~150s（Codex Plus OAuth, no per-image $）
- **Tests / verify**: Chrome MCP smoke — 確認 toggle ◀ ▶ 切換 sprite + Player.characterSpriteKey persist 進 state；既有沒 characterSpriteKey 的 mock player 仍 render male portrait（backward compat）
