## 1. Reference + read

- [x] 1.1 Read 二階 styles.css ~5747–5920 — mirrored: `--leaderboard-cols` var + `@media` retune + grouped `display:none` on off-stat cells + attribute-selector re-show
- [x] 1.2 Confirmed: `FILTER_PRIMARY_STAT` = {composite→variant_count, variants→variant_count, ap→total_AP, synapse→synapse_strong, study→total_study_min}; `family_complete` is never a sort key (hidden on mobile for all filters — intentional); NO separate my-rank sticky row (the `isMe` row is a normal `.neurons-lb-row` via `rowStyleFinal`); list container = `gridStyle`, rows = `headerRowStyle`/`dataRowStyle`

## 2. CSS (apps/neurons-tw/src/styles.css)

- [x] 2.1 Added `.neurons-lb-list { --neurons-lb-cols: 3rem 1fr 4rem 4rem 5rem 4.5rem 5.5rem }` (var on list; inherits to rows)
- [x] 2.2 `.neurons-lb-row { grid-template-columns: var(--neurons-lb-cols) }` (display:grid + gap/padding stay inline)
- [x] 2.3 `@media (max-width: 480px)`: list var → `2.6rem minmax(0,1fr) 4.5rem`; grouped hide of all 5 stat cells + attribute-selector re-show of the active one (`display:block`; family has no re-show → stays hidden)

## 3. LeaderboardPage.tsx wiring

- [x] 3.1 `gridStyle` container → `className="neurons-lb-list" data-active-stat={primaryStat}`
- [x] 3.2 header row + each data row (incl. isMe row via rowStyleFinal) → `className="neurons-lb-row"`
- [x] 3.3 per-stat class on all 5 stat spans in BOTH header + data rows (`--variant/--family/--ap/--synapse/--study`); rank + nickname always visible
- [x] 3.4 Deleted `gridTemplateColumns` from `headerRowStyle` + `dataRowStyle` (kept gap/padding/etc.); no separate sticky row to handle
- [x] 3.5 Verified via probe `getComputedStyle` — `.neurons-lb-row` resolves to the CSS var (not stale inline)

## 4. Verify (prod leaderboard is EMPTY → fabricate rows; class-override probe per chrome_mcp_rwd_probe.md)

- [x] 4.1 Fabricated mock list (header + data row) @ 335px `.is-narrow`: 3 visible cells, rowScrollW=335 (**no overflow**), only rank+nickname+active-stat shown
- [x] 4.2 Toggled `data-active-stat` variant_count→total_AP: visible stat swapped variant→ap (header + data aligned)
- [x] 4.3 Desktop @900px (no narrow): all 7 cells visible, base 7-col template, no overflow — unchanged
- [x] 4.4 console clean (onlyErrors)
- [x] 4.5 typecheck — clean
- [x] 4.6 build — ✓ 1.36s
- [x] 4.7 `validate --strict` — valid

## 5. Archive + deploy

- [ ] 5.1 `/opsx:archive fix-neurons-leaderboard-mobile` (syncs the ADDED requirement into `neurons-responsive-layout`)
- [ ] 5.2 commit (explicit confirm) + push track-neurons
- [ ] 5.3 Deploy (explicit owner authorization) — merge to main + `pnpm deploy:cf` from main worktree; ensure `apps/neurons-tw/.env.local` present in main worktree first
- [ ] 5.4 **Prod re-check is DEFERRED** until the leaderboard has ≥1 ranked player (can't verify the populated mobile row on empty prod) — log this as the known gap, don't claim live-verified

## Acceptance criteria

- [x] Leaderboard row no longer overflows 375px when populated (fabricated-row probe: scrollW 335 = box, no overflow)
- [x] ≤480px shows rank + nickname + only the active-sorted stat; switching filter swaps it; header + data aligned
- [x] Desktop ≥480px renders all 7 columns unchanged
- [x] `gridTemplateColumns` removed from inline `headerRowStyle`/`dataRowStyle` (CSS var drives it); bookmarks/connectome untouched
- [x] typecheck + build green; `validate --strict` passes
