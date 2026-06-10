## 1. Responsive causal-chain layout (D1)

- [x] 1.1 Added `styles.css` rules: `.neurons-stat-stages` (mobile-first `flex-direction: column`, stages `flex: 0 0 auto`) + `.neurons-stat-arrow` (`transform: rotate(90deg)` → `↓`); `@media (min-width: 520px)` → row + per-stage `flex: 1 1 130px` (`.neurons-stat-stage--dmn` 200px) + arrow `transform: none`.
- [x] 1.2 `ConnectomeStatCard.tsx`: stage row `className="neurons-stat-stages"`, each stage `className="neurons-stat-stage"` (+ `--dmn`), arrows `className="neurons-stat-arrow"`; removed the inline `flex`/`flexWrap`/`minWidth`/`stageRowStyle`/`stageDmnStyle` (CSS-driven now), kept visual styling.

## 2. Fold collection chips into the card (D2)

- [x] 2.1 Added `variants`/`dmnOwned`/`totalStudyMin` props; render a bottom chip row inside the card (🧬 變體 X 隻 · 💎 DMN X/20 · 📖 累積閱讀 X min) in the cream theme (`collectionRowStyle`/`collectionChipStyle`/`collectionValStyle`), wraps on narrow.
- [x] 2.2 `OverviewPage.tsx`: removed the standalone `<section aria-label="進度狀態">` strip + the `status*` style consts + the now-unused `EmojiIcon` import; pass the three chip values to `<ConnectomeStatCard/>`.

## 3. Verify

- [x] 3.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (561 passed).
- [x] 3.2 Chrome verify (wide): card present with chips folded in (`收藏進度` row) + standalone `進度狀態` strip removed + 3 `.neurons-stat-stage` + 2 `.neurons-stat-arrow`; CSS responsive rules confirmed loaded (`.neurons-stat-stages` + `@media (min-width:520px)` + arrow `rotate(90deg)`); no error boundary; console clean. NOTE: the mobile `<520px` vertical-stack render can't be sampled headlessly (automation viewport stuck at 2560, can't shrink) — the CSS is verified loaded + correct (mobile-first column + ↓ arrows), actual mobile look is owner-verified.
- [x] 3.3 **Owner verifies on real iPhone** post-deploy (vertical stack + ↓ arrows + folded chips). 520px breakpoint is a single tunable value in `styles.css`.
- [x] 3.4 Zero schema/sync change; `lint:dexie-fixtures` no-op. `/simplify` light — focused presentation change; dead code removed (status styles + EmojiIcon import), nothing complex to reduce; `noUnusedLocals` typecheck clean.
