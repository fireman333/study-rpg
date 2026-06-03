## Why

`apps/neurons-tw/src/routes/LeaderboardPage.tsx` renders each leaderboard row as an inline-styled 7-column grid: `gridTemplateColumns: '3rem 1fr 4rem 4rem 5rem 4.5rem 5.5rem'` (`# / 暱稱 / 變體 / 家族 / AP / Synapse / 唸書`). The six fixed columns alone sum to **26rem ≈ 416px**; with gaps + padding the row needs **~470px minimum**, which overflows a 375px phone (≈335px content box) by ~140px once the leaderboard has ranked players. The empty prod state (0 ranked players today) hid this during the `add-neurons-mobile-rwd` measurement — confirmed by reading the source. This is the one genuine remaining mobile gap from that audit (bookmarks is already safe via a responsive auto-fill grid; connectome already has working zoom/pan). It's **latent** (no users affected until the leaderboard fills), but will break the moment it populates.

## What Changes

- Move the leaderboard header/data **row layout** out of the inline `headerRowStyle` / `dataRowStyle` objects into CSS classes in `apps/neurons-tw/src/styles.css`, driven by a `--neurons-lb-cols` CSS variable (desktop base = the current 7-col value). **Delete** the inline `gridTemplateColumns` from both style objects so the `@media` rule can take effect (Decision 1 from `add-neurons-mobile-rwd`: inline beats CSS).
- Tag each stat cell with a per-stat class (`variant / family / ap / synapse / study`) and set a `data-active-stat` attribute on the list reflecting the current sort (neurons already computes this via `FILTER_PRIMARY_STAT[activeFilter]`).
- Add `@media (max-width: 480px)` that (a) retunes `--neurons-lb-cols` to ~3 columns (`rank + nickname(1fr) + 1 stat`) and (b) hides every stat cell except the one matching `data-active-stat` — so on phones the row shows `# + 暱稱 + only the currently-sorted column`. Switching the filter tab swaps which stat shows.
- Mirror 二階's proven pattern (`apps/medexam2-hospital-tw/src/styles.css` ~5747–5920: `--leaderboard-cols` var + `@media` collapse + `leaderboard-cell` hiding).

**不做**：

- bookmarks / achievements / connectome RWD — already mobile-safe (out of scope, confirmed by measurement).
- A card-per-row or horizontal-scroll layout — rejected in favour of the 二階 active-stat-collapse pattern (consistent + the data hook already exists).
- Any change to leaderboard data, fetch, filters, or the Worker — pure presentation.
- 320px support — 375px floor (same as the nav change).

## Capabilities

### Modified Capabilities

- `neurons-responsive-layout`: ADD a requirement that the leaderboard row collapses on phones to rank + nickname + active-sorted stat without horizontal overflow, desktop unchanged. Kept in this capability (not a new one) per its existing precedent of housing all neurons responsive behavior.

## Impact

- **Code**:
  - `apps/neurons-tw/src/styles.css` — new `.neurons-lb-*` classes + `--neurons-lb-cols` var + `@media (max-width:480px)` collapse rules.
  - `apps/neurons-tw/src/routes/LeaderboardPage.tsx` — add `className`s + per-cell stat classes + `data-active-stat` on the list; remove `gridTemplateColumns` from `headerRowStyle` / `dataRowStyle` (keep their non-layout props).
- **APIs / Dependencies**: none.
- **Data / Sync**: none (no Dexie / R2 / Worker change).
- **Backwards compat**: desktop (≥480px) renders the existing 7-col layout unchanged.
- **Spec touched**: 1 — MODIFIED `neurons-responsive-layout` (+1 requirement).
- **Verification caveat**: prod leaderboard is empty (0 ranked players), so the populated mobile layout must be verified via mock/fabricated rows at 375px, not live data.
