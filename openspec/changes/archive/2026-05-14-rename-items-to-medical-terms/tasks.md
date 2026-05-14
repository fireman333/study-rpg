## Tasks

### Subagent: extract candidate terms（this turn）

- [x] **T1**: 寫 `packages/theme-pixel-medical/scripts/extract-pharma-terms.ts` — 從 `apps/medexam-tw/public/content/medexam-tw/questions.json` 提取候選醫學名詞，輸出 `packages/theme-pixel-medical/src/items.terms.json`
- [x] **T2**: Subagent 依 design.md §"Extraction algorithm" 跑萃取
- [x] **T3**: Subagent 對 20 個 item slot 各提 2–3 個候選名 + flavor 草稿，回傳給主 thread

### Main thread: review + apply

- [x] **T4**: 主 thread 看完候選表，挑選最終 20 個（或要 subagent 再 iterate）
- [x] **T5**: Apply rename — rewrite `packages/theme-pixel-medical/src/items.ts`：
  - `id`: `item:<kebab-medical-term>-<rarity>`
  - `name`: 醫學名詞
  - `flavor`: WLK Stardew-RPG voice，≤ 25 字
  - 保留 `slot`、`rarity`、`effects`、`artKey` 不動
  - 新增 optional `sourceQuestionIds?: string[]`
- [x] **T6**: 更新 `packages/core/src/types.ts` 的 `Item` interface — 加 `sourceQuestionIds?: string[]` field（向後相容、optional）
- [x] **T7**: 跑 `pnpm -r typecheck` 全綠
- [x] **T8**: 重跑 `node_modules/.../tsx scripts/loot-smoke.mjs` 確認分佈不變
- [x] **T9**: Dev server (`pnpm --filter @study-rpg/medexam-tw dev`) 手動測「手動測試一次抽卡」按鈕，confirm UI 顯示新名稱 + flavor
- [x] **T10**: Update `packages/theme-pixel-medical/CHANGELOG.md`（新增）紀錄 item naming change

### Archive prep（pre-`/opsx:archive`）

- [x] **T11**: 跑 `openspec validate --change rename-items-to-medical-terms`
- [x] **T12**: `/opsx:verify` confirms completeness + correctness + coherence
- [x] **T13**: `/opsx:archive rename-items-to-medical-terms` — sync delta 到 `openspec/specs/item-catalog/spec.md`
- [x] **T14**: auto-git commit
