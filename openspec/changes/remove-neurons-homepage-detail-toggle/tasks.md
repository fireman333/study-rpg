## 1. Remove the disclosure toggle (ConnectomeStatCard.tsx)

- [x] 1.1 Delete the `showDetail` `useState` and the 「▾ 詳細 / ▴ 收合」 toggle `<button>` (+ its `aria-expanded`). Also dropped the now-unused `useState` import.
- [x] 1.2 Promote 本週 X/7 to an always-visible core signal — added `📅 本週 {weeklyCount}/7` to the first causal-chain stage (alongside 今日出征 / 連續).
- [x] 1.3 Render 最強 pair and ⚡ 今日連線額外能量 inline only when they have a value — secondary row now renders only when `strongestPair || todayConductionEnergy > 0`, with each item kept behind its own conditional.
- [x] 1.4 Removed the now-unused `detailToggleStyle`; `detailRowStyle` is retained (the secondary row reuses it).

## 2. Verify

- [x] 2.1 `pnpm -r typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` green (563/563, no stat-card test regressions).
- [x] 2.2 Chrome non-regression (localhost:5175): card renders, `📅 本週 0/7` always visible in stage 1, NO 詳細/收合 button (the only button is the ⚔️ CTA), survives F5, console clean. (最強 pair / ⚡ inline-when-present path verified by code review — no cross-subject links in the dev state to render them.)
- [x] 2.3 Zero schema/sync change confirmed; `lint:dexie-fixtures` no-op (`[lint:dexie] OK`); `openspec validate remove-neurons-homepage-detail-toggle --strict` passes.
