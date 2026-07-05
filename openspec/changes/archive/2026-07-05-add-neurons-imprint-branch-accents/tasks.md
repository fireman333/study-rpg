## 1. Per-NT-branch accent (Ng0717BranchBuds.tsx)

- [x] 1.1 `EnrichedImprint` 加 `group: string`（NT branch: DA / 5HT / GABA / Glu）
- [x] 1.2 加 `BRANCH_ACCENT` map：group → 小 SVG motif（DA 火花 / 5HT 環 / GABA 橫槓 / Glu 上箭）+ pure helper `branchAccent(group)`（未知 group → null，export 供測試）
- [x] 1.3 `Bud` 元件右上角疊 accent（隨 size/stage 縮放；白 glyph + 細暗邊確保各 tint 上可讀；`prefers-reduced-motion` 不影響——accent 靜態）

## 2. Enrichment (OverviewPage.tsx)

- [x] 2.1 enrich imprints 時從 `subject.group` 帶入 `group`（fallback 空字串）

## 3. Tests (Vitest)

- [ ] 3.1 `branchAccent` 純映射：DA / 5HT / GABA / Glu 各回對應 motif；未知 group → null（不 render accent）

## 4. Verify + ship

- [x] 4.1 `pnpm --filter @study-rpg/neurons-tw typecheck` + 全套 test 綠
- [x] 4.2 Preview smoke：seed 跨 4 分支的芽 → 每顆芽右上角正確顯示對應 branch accent；無 legend/分母；`prefers-reduced-motion` 無 error
- [ ] 4.3 grep 無 schema/sync/美術資產改動；`/opsx:verify` → `/opsx:archive` → commit → merge track-neurons→main → push → prod bundle 驗證（owner 已授權 ship）
