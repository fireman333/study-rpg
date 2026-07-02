# Tasks — Rework dex filter chips: inclusion model + 收藏-style colors + 稀有度 P0–P5 bar

## 1. Implementation

- [x] 1.1 Rewrite `FamilyFilterChips.tsx` as two 收藏-style labelled filter bars (「依科目篩選」+「依稀有度篩選」), inclusion-model props (`selectedFamilies` / `selectedTiers`, empty = 全部), per-chip accent colors (`chipIncludedStyle` solid / `chipExcludedStyle` dashed, mirroring BookmarksPage), gold 「全部」 reset chip per bar. `FamilyChipOption` gains `color`; new `TierChipOption`.
- [x] 1.2 `CollectionPage.tsx`: replace the `visible` exclusion Set with `selectedFamilies` + `selectedTiers` inclusion Sets (+ shared `toggleChip` helper); pass `Subject.color` into the family chips; add module-level `TIER_CHIP_OPTIONS` (P0→P5 from `RARITY_LABEL` × `RARITY_COLOR`).
- [x] 1.3 `CollectionPage.tsx`: new `familyView` memo — per family: 科目-filter pass, held-slot rows narrowed by the 稀有度 filter, `render` flag (tier filter active → hide zero-match families; no tier filter → keep the「empty family renders its header」behavior). Paper dividers + sections consume it; empty state reads「目前篩選下沒有符合的神經元…」.
- [x] 1.4 Narrow the per-family fusion buttons (`promoteTiers`) to tiers passing the active 稀有度 filter.

## 2. Verification

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; full vitest suite 770/770 green (no dex-filter unit tests existed before; behavior is covered by the browser smoke below).
- [x] 2.2 Browser smoke (localhost:5175 /collection): default = both bars all-shown (全部 solid gold, subject/tier chips dashed in their own colors); clicking 藥理學 + P1 夯 → chips fill with their colors, 全部 releases, non-matching families collapse, empty hint shows on zero match; 全部 reset restores 醫學一 5 科 + 醫學二 6 科. Zero console errors.
