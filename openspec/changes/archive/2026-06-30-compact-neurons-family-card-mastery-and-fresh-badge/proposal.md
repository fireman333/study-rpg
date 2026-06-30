## Why

Two density problems on the homepage family cards (owner, prod):

1. The mastery chip renders the **full tier label + accuracy %** (e.g.「P5 新手 5/6 83%」, or「P4 入門 11/14 79% ⚡+5%」on a mastery-energy-boosted family like 免疫學). At the fixed ~157px card content width this pushes the「X 隻」variant-collection pill onto a **second line** — worst on boosted families.
2. The standalone「X 題」total-question pill takes a chip-row slot of its own, yet the total is most meaningful next to the 新題 entry it gates.

## What Changes

- **Compact mastery chip (spec delta — `neuron-family-mastery`):** the chip now shows only the **tier code**（P5 / P4 / … / 「—」for none）**＋ the animated `correct/total` count ＋ the ⚡ mastery-energy boost when active**. The tier WORD（新手 / 入門 / …）and the **accuracy %** are removed from the visible chip and moved into the chip's `title` tooltip（e.g.「解剖學 熟練度 · P5 新手 · 正確率 83%」）. The chip is also tightened (smaller internal gap/padding; the boost renders as「⚡5%」without the「+」) so that even a boosted family's chip ＋ the「X 隻」pill fit on one row.
- **題-count folded into the 新題 badge (spec delta — `neurons-quiz-modes`):** the standalone「{total} 題」chip is removed from the card's chip row; the family total is shown **inside the 🆕 新題 button badge as「{unseen}/{total}」**（e.g.「新題 694/700」）. The badge still reads「全部答過」when unseen = 0, and「—」when the family has no questions. The 🔄 錯題 badge is unchanged (due-count only).

## Capabilities

### Modified Capabilities
- `neuron-family-mastery`: the mastery chip's visible content is reduced to tier-code + count + optional ⚡ boost; the accuracy % (previously a required visible element) moves to the tooltip.
- `neurons-quiz-modes`: the 🆕 新題 chip badge shows the unseen count over the family total (`unseen/total`) rather than the unseen count alone.

## Impact

- **Code (apps/neurons-tw):** `components/MasteryChip.tsx` (tier-code instead of `TIER_LABELS`, drop the visible accuracy span, enrich the tooltip, tighten gap/padding + compact boost), `components/FamilyPicker.tsx` (remove the `countChip`「X 題」pill + its now-orphan `countChipStyle`; 新題 badge → `unseen/total`; minor chip-row gap tighten).
- **Data / sync:** none — purely presentational; no Dexie / R2 schema change, no mastery-data change.
- **Cross-cutting invariants preserved:** `NumberTickUp` animated count, reduced-motion, the mastery-energy multiplier source of truth.
