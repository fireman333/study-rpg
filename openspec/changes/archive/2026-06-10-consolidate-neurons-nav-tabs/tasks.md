## 1. Nav + routing

- [x] 1.1 `App.tsx`: top nav 8 → 5 tabs（腦圖 / 圖鑑 / 收藏 / 題庫 / 社群）; `GroupNavLink` computes active state from the group's path list via `useLocation`.
- [x] 1.2 `App.tsx`: pathless layout routes `SubTabLayout group="collection"` (`/collection` + `/dmn` + `/achievements`) and `group="community"` (`/leaderboard` + `/shoutout`) rendering the underline sub-tab bar + `<Outlet/>`; URLs unchanged, no redirects.

## 2. Wayfinding copy

- [x] 2.1 `DmnDrawModal.tsx`: 背包 / 裝備 notes point at「圖鑑 → DMN」instead of bare `/dmn`.
- [x] 2.2 `HelpMenu.tsx`: DMN collection、成就、排行榜 opt-in prose updated to group → sub-tab wayfinding (hrefs unchanged).

## 3. Verify

- [x] 3.1 `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test` green; fixture lint no-op (zero schema change).
- [x] 3.2 `pnpm --filter @study-rpg/neurons-tw build` clean.
- [x] 3.3 Chrome MCP dev smoke: 5 top tabs render; 圖鑑 tab active on `/collection` `/dmn` `/achievements` with sub-tab bar switching pages; 社群 tab active on `/leaderboard` `/shoutout`; direct URL + F5 on `/dmn` & `/shoutout` render with the sub-tab bar; ≤480px nav fits without trailing off-screen tabs; console clean.
- [x] 3.4 Owner confirmed spec delta wording (2026-06-10 「OK」; subtab restyled to 二階 underline tablist per owner feedback) → archive + commit.
