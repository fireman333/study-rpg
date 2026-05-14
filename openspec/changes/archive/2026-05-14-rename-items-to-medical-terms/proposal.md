## Why

目前 `packages/theme-pixel-medical/src/items.ts` 的 20 個 starter item 用泛用名（聽診器 / 白袍 / 學長手寫筆記 / 希波克拉底護身符 等），跟「實際正在玩的題庫內容」沒語意連結 — 玩家看到 item 不會聯想到藥理學知識點。把 item 名稱改成從**真實藥理考古題抽取的醫學專有名詞**（藥名、receptor、機制、副作用、drug class）後，每次抽卡同時是「啊這個藥前天剛背過」的 spaced-repetition recall，遊戲化迴圈閉合更緊。

題庫已有 418 題藥理（`packages/content-medexam-tw/dist/questions.json`，由 build script 從 106-1 ~ 114-2 考古題抽出），完全可機器化提取。

## What Changes

- 新增 **content-derived item naming** 規則：starter item catalog 的 `name` 與 `flavor` 從 content pack（藥理考古題庫）的高頻 / 高重要性醫學名詞抽取
- 新增 `packages/theme-pixel-medical/scripts/extract-pharma-terms.ts`：subagent 用此 script 從 questions.json 抽 ~30–40 個候選醫學名詞，按 rarity tier 分桶
- **MODIFIED**: `packages/theme-pixel-medical/src/items.ts` 全部 20 個 item 的 `name` + `flavor` 重寫；`id` 改為 `item:<kebab-medical-term>-<rarity>` 格式；`artKey` 保留指向 sprite slot 不動（sprite 沒換）
- 新增 `packages/theme-pixel-medical/src/items.terms.json`：抽取出的候選名詞 + 來源題號（reproducibility / debug 用）
- **不** breaking：`Item` type schema 不動；玩家既有存檔的 `ItemInstance.itemId` 引用會在 M2 加 migration helper（MVP 階段 IndexedDB 還沒部署實際資料，目前無 user data loss 風險）

## Capabilities

### New Capabilities
- `item-catalog`: theme pack 提供給 engine 的 starter item 列表規格 — 命名來源、rarity 分佈、slot 覆蓋、attribution 規則

### Modified Capabilities
（無 — 目前 `openspec/specs/` 是空的，本 change 是第一個 capability）

## Impact

- **Files**: `packages/theme-pixel-medical/src/items.ts`（rewrite name + flavor），新增 `scripts/extract-pharma-terms.ts` + `src/items.terms.json`
- **APIs**: 無 breaking — `ThemePack.itemCatalog` interface 不變
- **Dependencies**: 無新增（用 Node 內建 `node:fs` + 既有 yaml package）
- **Tests / verify**: 抽卡 10k smoke test (`scripts/loot-smoke.mjs`) 需 re-run 確認 distribution 不受 name change 影響（rarity 分佈該完全一致）
- **UX**: 玩家看到的 item 名稱變得醫學 — 例「Aspirin」「β-blocker」「Cytochrome P450」取代「鉛筆」「白袍」「希波克拉底護身符」
