## Why

M3 規劃發 `@study-rpg/core` 到 npm，其他人 fork 接 TOEFL / 律師考 / 學測。`Question` / `Subject` / `ContentPack` 等 interface 是下游 fork 必須遵守的 contract。

目前定義在 `packages/core/src/types.ts` 第 21-43 + 196-220 行，code 已穩定但 **沒 spec 守住**：未來改一個 field 名稱（例如 `Question.stem` → `Question.text`）會 break 所有 fork、卻不會有 PR review 攔。

本 change 把現有 `Question` / `Subject` / `ContentPack` / `ContentPackMeta` interface lock 成 spec contract。**Code 不動**，只是把 fork-friendly 的不變式固定下來。

## What Changes

新增 capability `content-pack-contract`，6 條 requirement：
1. `Question` interface field 列表 + 語意
2. `Subject` interface field 列表
3. `ContentPack` shape（`{ meta, subjects, questions }`）
4. `ContentPackMeta` 必填欄位（id / displayName / locale / credits）
5. Attribution 強制（credits 陣列至少 1 個 entry）
6. Build-time invariants（dist/ 三檔 + getContentPack 公開 API）

不動 code。

## Capabilities

### New Capabilities
- `content-pack-contract`: ContentPack / Question / Subject interface contract for forks

## Impact

- **Files**: spec only — `openspec/specs/content-pack-contract/spec.md` 新增
- **APIs**: 無
- **Dependencies**: 無
- **Tests / verify**: `openspec validate lock-content-pack-contract`
- **Risk**: 0 — code 不變
