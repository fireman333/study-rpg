## 1. Single-source family→branch map (content pack)

- [x] 1.1 Add `packages/content-neurons-tw/src/families.ts` exporting `export type NtBranchId = 'DA' | '5HT' | 'GABA' | 'Glu'` and `export const FAMILY_NT_BRANCH: Record<string, NtBranchId>` with all 11 families (藥理學/公共衛生學→DA; 寄生蟲學/組織學→5HT; 生物化學/病理學/免疫學→GABA; 解剖學/生理學/胚胎學/微生物學→Glu)
- [x] 1.2 Re-export `FAMILY_NT_BRANCH` + `NtBranchId` from `packages/content-neurons-tw/src/index.ts`
- [x] 1.3 Refactor `packages/content-neurons-tw/scripts/build.ts` so `FAMILY_BY_SUBJECT[*].ntBranch` derives from `FAMILY_NT_BRANCH` (single source — no parallel hard-coded branch values); keep `family`/`persona` columns as-is
- [x] 1.4 Rebuild content pack (`MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-neurons-tw build`) and confirm the DA/5HT/GABA/Glu subject counts in build stderr are unchanged from before the refactor — got DA 2 / 5-HT 2 / GABA 3 / Glu 4 (= 11, unchanged)

## 2. Branch derivation in the pure helper

- [x] 2.1 In `apps/neurons-tw/src/lib/variant-decor.ts`: import `FAMILY_NT_BRANCH` + `NtBranchId` from `@study-rpg/content-neurons-tw`; add `branch: NtBranchId | null` to the `VariantContextArt` interface
- [x] 2.2 In `variantContextArt(row)`: set `branch = FAMILY_NT_BRANCH[row.familyId] ?? null`; leave the existing `decor` type mapping and `band` derivation untouched

## 3. Per-branch sprite resolution (theme pack)

- [x] 3.1 In `packages/theme-pixel-neurons/src/sprites.ts`: generate `DECOR_KEYS` programmatically = 3 universal (`decor:redemption/milestone/elder`) + 3×4 per-branch (`decor:<type>:<da|5ht|gaba|glu>`) so every key gets a `SPRITE_MAP` fallback entry
- [x] 3.2 Export `decorSpriteUrl(universalKey: string, branch: string | null): string` from `sprites.ts` (+ re-export from index.ts): return per-branch real asset (`decor:<type>:<branch.toLowerCase()>`) if present in the decor glob, else universal real asset if present, else `TRANSPARENT_PIXEL`

## 4. Composer wiring

- [x] 4.1 In `apps/neurons-tw/src/components/VariantSprite.tsx`: read `branch` from `variantContextArt(row)`; render each decor layer via `decorSpriteUrl(key, branch)` instead of indexing `SPRITE_MAP[key]` directly
- [x] 4.2 Confirm the faint background-watermark model is unchanged (opacity 0.11 single / 0.07 stacked, `objectFit: cover`, behind the neuron, no foreground badge, no full-cell colour wash) — only the decor `src` resolution changed; style block untouched

## 5. Tests

- [x] 5.1 Extend `apps/neurons-tw/src/__tests__/variant-decor.test.ts`: assert each of the 11 families resolves to its canonical branch via `variantContextArt(row).branch`
- [x] 5.2 Assert an unknown `familyId` yields `branch === null`
- [x] 5.3 Assert existing decor-type mapping (標準 / 救贖 / 里程碑 / stack / 元老) and band scenarios still pass unchanged
- [x] 5.4 Add a unit test for `decorSpriteUrl` fallback order (per-branch present → per-branch; per-branch absent + universal present → universal; both absent → transparent placeholder) — new `decor-sprite-url.test.ts` asserts against the live glob (3 universal assets present, 0 per-branch)
- [x] 5.5 Run `pnpm --filter @study-rpg/neurons-tw test` (165 passed) + `pnpm -r typecheck` (all green)

## 6. Assets (branch-tinted decor textures)

- [x] 6.1 Generate per-branch textures into `packages/theme-pixel-neurons/sprites/decor/` (`<type>-<branch>.png` → glob maps `-`→`:` → `decor:<type>:<branch>`). **Owner chose recolor-existing over fresh Gemini gen** (design D4 says "same motif, tinted per NT") — `magick <type>.png -colorspace Gray +level-colors "black,<NT_BRANCH_COLOR>" -colors 16`. Generated the **full 12** (4 branches × 3 types), not 9 — full coverage avoids a neutral-branch grid inconsistency; the 3 universals become a pure fallback safety-net
- [x] 6.2 Recolor IS the post-process (deterministic, motif-identical to the 3 universals, 384×384, 16-color); side benefit — collapses milestone's residual magenta key colour into the single branch hue. DA 琥珀 #d4a04d / 5HT 紅 #c44d4d / GABA 藍 #6a9bc4 / Glu 綠 #5c9b6b
- [x] 6.3 All 12 shipped this pass; montage visually confirmed (4 distinct branch hues, consistent motif per row, dark neutral fields). Universal fallback retained for unknown-family / null-branch defensive path

## 7. Verify

- [x] 7.1 `/simplify` on the diff — removed dead `DECOR_KEYS`/`SPRITE_MAP` decor entries (decor now resolves only via `decorSpriteUrl` → single path); added `NtBranchId` parallel-type justification comment. Skipped out-of-scope items (core-contract type unification, pre-existing colour divergence). Tests 166 ✓ + typecheck ✓ after
- [x] 7.2 Chrome MCP visual smoke: `/collection` dex cards across 2 NT branches — 藥理學×2 (DA) render faint **amber** elder Cajal backdrop, 解剖學 (Glu) renders faint **green** one; DOM srcs confirmed `elder-da.png` / `elder-glu.png`; neuron fully visible, no rainbow-wash, β/α band letter intact, console clean
- [x] 7.3 `/opsx:verify` green (completeness / correctness / coherence) — no CRITICAL/WARNING; all requirements traced to code + tests + live smoke
