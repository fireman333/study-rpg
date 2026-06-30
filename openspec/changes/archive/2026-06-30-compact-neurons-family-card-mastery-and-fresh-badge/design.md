## Context

Follow-up density polish on the homepage family cards (`FamilyPicker` + `MasteryChip`). Card content width is fixed (~157px regardless of monitor size — the page is a centered fixed-max-width column), so chip-row overflow wraps the same way on every screen. Codex consulted; both tweaks confirmed sound. Purely presentational — no data/schema change.

## Goals / Non-Goals

**Goals:** keep the mastery chip + 「X 隻」pill on one row (even on ⚡-boosted families like 免疫學); surface the family total where it's most useful (inside the 新題 entry) and reclaim the chip-row slot the「X 題」pill occupied.

**Non-Goals:** no change to mastery thresholds / tiers / energy multiplier; no change to the 錯題 badge; no Dexie/R2 change.

## Decisions

### D1 — Mastery chip shows the tier CODE + count + ⚡ boost; word + accuracy → tooltip
`deriveMasteryTier` already returns the bare code (`'P5'`…), so the chip renders `tier === 'none' ? '—' : tier` instead of `TIER_LABELS[tier]`, drops the visible accuracy span, and keeps the `NumberTickUp` count + the ⚡ boost. The full tier label + accuracy % move into the chip `title` (kept accessible on hover/long-press). *Trade-off:* mobile has no hover tooltip, so accuracy is not glanceable there — accepted, because accuracy is not first-layer info for picking a family and `correct/total` already conveys progress; the goal is a non-wrapping chip row.

### D2 — Tighten the chip so the boosted case also fits
Even after dropping the word + %, a boosted family's chip（「P4 15/18 ⚡+5%」≈106px）＋ the「X 隻」pill（≈52px）＋ gap exceeded the ~157px content width and wrapped. So the chip is tightened: internal `gap` 0.4→0.28rem, horizontal `padding` 0.5→0.38rem, `white-space: nowrap`, and the boost renders「⚡5%」(no「+」, icon 13→12). This brings the boosted chip to ≈85px → chip ＋ pill fit on one row (measured). The chip-row gap is also trimmed 0.35→0.3rem. *Alternative considered:* drop the ⚡ boost from the chip entirely — rejected; it's useful and the owner didn't ask to remove it.

### D3 — 新題 badge = `unseen/total`; remove the standalone 題 pill
The card's「{total} 題」pill is deleted (and its now-orphan `countChipStyle`); the 新題 button badge becomes `isEmpty ? '—' : unseen === 0 ? '全部答過' : `${unseen}/${total}``. The badge is content-width (no fixed width) so「694/700」fits. The 錯題 badge stays due-only — a denominator there would be semantically unclear (total vs ever-wrong vs due pool).

## Risks / Trade-offs

- **Accuracy only in the tooltip on mobile** → accepted (see D1).
- **Very long localized member strings** could still wrap on a future narrower card — mitigated by `white-space: nowrap` on the chip + content-width badge; the 2-line affordance for the 新題「全部答過」string is unchanged.

## Migration Plan

Pure client-side presentation. Standard CF Pages deploy; rollback = revert the commit.

## Open Questions

None.
