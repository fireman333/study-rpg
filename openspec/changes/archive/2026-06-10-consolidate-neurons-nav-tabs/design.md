# Design — consolidate-neurons-nav-tabs

## Decision 1: Keep all URLs; regroup navigation only

9 main specs reference `/dmn` / `/achievements` / `/leaderboard` / `/shoutout` in scenarios; HelpMenu deep-links them; DMN toasts/modals name them. Moving pages to nested paths (`/collection/dmn` …) would need redirects + a 9-spec sync sweep for zero player value. Instead: **pathless layout routes** (`<Route element={<SubTabLayout/>}>` wrapping the existing path routes) render a shared sub-tab bar above unchanged pages. Zero redirects, zero broken links, every route-keyed spec scenario stays literally true.

## Decision 2: Grouping (owner-selected, option B)

腦圖 / 圖鑑 / 收藏 / 題庫 / 社群. 圖鑑 = 神經元圖鑑 (`/collection`) + DMN (`/dmn`) + 成就 (`/achievements`) — all three are collection-display surfaces (DMN page already titles itself「DMN 圖鑑」). 社群 = 排名 (`/leaderboard`) + 留言 (`/shoutout`) — both social/back-end-driven. Core-loop tabs (腦圖 / 收藏 / 題庫) stay top-level. 5 tabs fit a 375px viewport without horizontal scroll (verified), eliminating the off-screen-tabs problem.

## Decision 3: Group tab active state via `useLocation`, not NavLink isActive

`NavLink to="/collection"` only matches its own subtree; the group tab must light up on sibling paths. `GroupNavLink` computes `active = group.some(p => pathname === p || pathname.startsWith(p + '/'))`. Sub-tab pills use plain `NavLink end` (exact match suffices — no nested paths).

## Decision 4: Sub-tab visual = 二階 underline tablist, neurons palette (owner feedback)

First cut used small pills; owner asked for bigger/more prominent「參考二階國考」. Ported 二階's `.achievements-tab` pattern: container-wide 2px bottom rule (`#d4c4a0`), tabs `0.5rem × 1.1rem` padding at 1rem/700 weight, active = 3px gold underline (`#d4a04d`) + darker text, `margin-bottom: -2px` overlay trick — re-palette'd from 二階's dark theme to neurons warm cream/brown.

## Decision 5: Discoverability trade-off accepted

DMN 背包 (consumable activation) moves one click deeper. Mitigated by updating the draw-modal wayfinding copy (「在『圖鑑 → DMN』的背包區手動啟用」) — the moment a player gains a consumable, the modal tells them where it went.
