# consolidate-neurons-nav-tabs

## Why

The top nav has grown to 8 tabs（腦圖 / 圖鑑 / DMN / 收藏 / 題庫 / 成就 / 排名 / 留言）. On mobile（≤480px）the nav is a horizontal-scroll row, so the trailing tabs（排名 / 留言）sit off-screen behind a scroll affordance. Owner call (2026-06-10): consolidate to 5 tabs — DMN + 成就 fold into 圖鑑 as sub-tabs（current 圖鑑 content becomes the 神經元圖鑑 sub-tab）, and 排名 + 留言 fold into a new 社群 tab. Conceptual fit is natural: the DMN page already titles itself「DMN 圖鑑」(card collection + 背包 + 消耗品圖鑑 + 裝備圖鑑) and 成就 is a badge collection — all three are collection-display surfaces, distinct from the core-loop tabs.

## What Changes

- **Top nav 8 → 5**: 腦圖 / 圖鑑 / 收藏 / 題庫 / 社群. The 圖鑑 tab's active state covers `/collection` + `/dmn` + `/achievements`; the 社群 tab (links to `/leaderboard`) covers `/leaderboard` + `/shoutout`.
- **Sub-tab bar via pathless layout routes** (`SubTabLayout` in `App.tsx`): an underline tablist (ported from 二階's `.achievements-tab` pattern — full-width bottom rule, gold underline + bold text on the active tab, neurons warm palette). 圖鑑 group renders 神經元圖鑑 / DMN / 成就 above the page; 社群 group renders 排名 / 留言. **All URLs unchanged** — `/dmn`, `/achievements`, `/leaderboard`, `/shoutout`, `/collection` keep rendering their existing pages (zero redirects, zero broken deep links; every existing spec scenario keyed on those routes stays valid).
- **Wayfinding copy updated**: DmnDrawModal「在 /dmn 背包頁手動啟用」→「在『圖鑑 → DMN』的背包區手動啟用」(+ 裝備區 twin); HelpMenu prose for DMN / 成就 / 排行榜 points at the new group → sub-tab path (hrefs unchanged).
- No page-content changes — CollectionPage / DmnCollectionPage / AchievementsPage / LeaderboardPage / ShoutoutBoardPage render as before, one sub-tab bar above.

## Capabilities

### Modified Capabilities

- `neurons-mode`: ADDED requirement — top navigation SHALL consolidate to five tabs with grouped sub-tab navigation; route paths unchanged. (Supersedes stale positional notes about the old 8-tab order, e.g. the「收藏 → between DMN and 成就」implementation note in the bookmarks requirement.)
- `neurons-variant-collection-view`: MODIFIED「A dedicated /collection route SHALL exist with a single navbar entry」— the single navbar entry is now the 圖鑑 group tab; the page sits under the group's 神經元圖鑑 sub-tab.
- `neurons-shoutout-board`: MODIFIED「Shoutout tab entry」—「留言」reachable via the 社群 group's sub-tab (route `/shoutout` unchanged).

## Impact

- **Edited files**: `apps/neurons-tw/src/App.tsx` (nav + layout routes + sub-tab styles), `apps/neurons-tw/src/components/DmnDrawModal.tsx` (2 copy lines), `apps/neurons-tw/src/components/HelpMenu.tsx` (3 copy lines).
- **Schema / sync**: **ZERO** — no Dexie bump, no R2 bump, no Worker change; fixture lint no-op.
- **Tests**: existing vitest suites are service-level (no nav-render assertions) — expected green unchanged.
- **Deploy**: presentation-only; rides normal merge→main → CF Pages.
