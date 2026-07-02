## Why

The 圖鑑 (/collection) dex's 科別 filter chips use a different mental model from every other filter surface in the app: they start with ALL chips lit and clicking one **hides** that family (exclusion), while 收藏 (/bookmarks) and 題庫 (/bank) both use the **inclusion** model — nothing selected = 全部 shown, clicking a chip narrows to just it. A player moving between tabs has to re-learn the chips per tab, and the dex chips also lack the per-subject accent colors that make the 收藏 「依科目篩選」 bar scannable. Finally, the dex has no way to narrow by rarity tier at all — with 66+ collectible slots across 11 families, "show me only my P0/P1s" is a natural completionist ask.

## What Changes

- **科目 chips → inclusion model**, matching 收藏 / 題庫: empty selection = 全部 shown; selecting one or more subjects narrows to those. Leads with a 「全部」 reset chip. (This also brings the implementation in line with the existing spec's normative wording — "Selecting one or more chips SHALL narrow the view to those families" — which the old hide-on-click code inverted.)
- **收藏-style colored chip bars**: both bars restyle to the 收藏 tab's labelled-card pattern (「依科目篩選」 header + wrapping chip row); each subject chip carries its own `Subject.color` (solid fill when included, dashed outline when excluded), the 全部 chip uses the shared gold accent.
- **New 依稀有度篩選 bar**: P0 始源 → P5 拉完了 chips (inclusion model, tier-colored via the page's `RARITY_COLOR`). Narrowing by tier filters each family's cards to matching rarities, hides families with zero matching cards (no empty headers under an active tier filter), and narrows the per-family fusion buttons to the shown tiers. Both filters compose (AND).
- No behavior change to squad manager, representatives, fusion mechanics, connector / mock-variant sections, or any data/schema.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-variant-collection-view`: the family-filter requirement's chip interaction model is restated as inclusion (empty = all) with 收藏-pattern colored bars; a new requirement adds the 稀有度 (P0–P5) filter bar; the responsive requirement's wording follows the two-bar layout.

## Impact

- `apps/neurons-tw/src/components/FamilyFilterChips.tsx` — rewritten: two labelled filter-bar sections (科目 + 稀有度), inclusion-model props, per-chip accent colors (`chipIncludedStyle` / `chipExcludedStyle` mirroring BookmarksPage).
- `apps/neurons-tw/src/routes/CollectionPage.tsx` — `visible` Set (exclusion) replaced by `selectedFamilies` + `selectedTiers` (inclusion); new `familyView` memo precomputes per-family tier-filtered rows + render flag; fusion `promoteTiers` narrowed by the tier filter; `FamilyChipOption` gains `color`.
- Zero Dexie / R2 / sync / content-pack change. Display-only.
