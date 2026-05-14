## Why

M3 規劃發 npm 後，下游可只 fork content + 接既有 theme，也可以全新 theme（modern flat / manga / dark-mode 等）。`ThemePack` 是 fork contract 的另一半，同樣得 lock。

`packages/core/src/types.ts` 第 222-244 行已定義 `ThemePack` / `ThemePackMeta` / `FontDef` 等 interface，但 **沒 spec 守住**：

- `theme.sprites` 必須包含哪些 key（character-base + slot placeholders + 每個 `Item.artKey` 對應 entry）— 已在 `character-system` spec 提一次但隨 character-system 改動會搬移
- `theme.itemCatalog` 跟 `content` 怎麼配對（domain-specific naming）— 已在 `item-catalog` spec 但沒明確 cross-reference
- `cssVars` / `fonts` / `designMd` 在 theme 切換時的 contract

本 change 把 ThemePack-as-interface 的 contract 抽到獨立 capability，跟內容 (`item-catalog`) / 視覺 (`character-system`) 解耦。**Code 不動**。

## What Changes

新增 capability `theme-pack-contract`，6 條 requirement：
1. `ThemePack` 根層 shape
2. `ThemePackMeta` 必填欄位 + `style` enum
3. `sprites` map 必含 key 列表（per-engine-cap，character + slots + artKey 覆蓋）
4. `cssVars` 規範（必須以 `--` 開頭、值是 CSS 合法 token）
5. `designMd` 嵌入規則（full DESIGN.md 字串、build 時 inline）
6. Theme/content cross-reference（`theme.itemCatalog[].slot` 必須在 `EquipSlot` enum 內，artKey 必須對應 sprites map）

不動 code。

## Capabilities

### New Capabilities
- `theme-pack-contract`: ThemePack interface contract for forks

## Impact

- **Files**: spec only — `openspec/specs/theme-pack-contract/spec.md` 新增
- **APIs**: 無
- **Dependencies**: 無
- **Tests / verify**: `openspec validate`；典型 fork (medexam-tw 自家) 須能對照通過
- **Risk**: 0 — code 不變
