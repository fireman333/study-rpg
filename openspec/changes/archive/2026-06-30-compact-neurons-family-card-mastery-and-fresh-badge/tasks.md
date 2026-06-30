## 1. Compact mastery chip

- [x] 1.1 `MasteryChip`: render the bare tier code (`tier === 'none' ? '—' : tier`) instead of `TIER_LABELS[tier]`; remove the visible accuracy span.
- [x] 1.2 Move the full tier label + accuracy % (+ boost) into the chip `title` tooltip.
- [x] 1.3 Tighten the chip so a ⚡-boosted family's chip + the「X 隻」pill fit one row: internal gap 0.4→0.28rem, padding 0.5→0.38rem, `white-space:nowrap`, boost「⚡5%」(drop the「+」, icon 13→12). Trim the FamilyPicker chip-row gap 0.35→0.3rem.

## 2. 題-count → 新題 badge

- [x] 2.1 Remove the standalone「{total} 題」`countChip` from the FamilyCard chip row; delete the now-orphan `countChipStyle`.
- [x] 2.2 新題 badge → `isEmpty ? '—' : unseen === 0 ? '全部答過' : `${unseen}/${total}``.

## 3. Verification

- [x] 3.1 `pnpm --filter @study-rpg/neurons-tw exec tsc --noEmit` clean; vitest 755 green.
- [x] 3.2 No Dexie / R2 schema change (purely presentational).
- [x] 3.3 Chrome MCP smoke (seeded mastery): 解剖學 chip「P5 5/6」+「X 隻」same row, no accuracy %, full info in tooltip; 免疫學「P4 15/18 ⚡5%」+「X 隻」same row (boosted case fits); 新題 badge「unseen/total」, no standalone 題 pill.
