# Tasks

## 1. Tooltip host
- [x] 1.1 Port `CustomTooltipHost.tsx` from 二階 (document-level `data-tooltip` delegate, 250 ms styled fixed-position tooltip, hide-on-scroll).
- [x] 1.2 Mount `<CustomTooltipHost />` once at the App root in `App.tsx`.

## 2. Badge label
- [x] 2.1 Add exported `resolveBadgeLabel(category, tier)` to `BadgeSprite.tsx` (catalog lookup, `" / "`-join, generic fallback).
- [x] 2.2 Set `role="img"` + `data-tooltip` + `aria-label` on the badge `<div>`; add optional `ariaLabel` override prop.
- [x] 2.3 Locked badges render a generic「<tier>級<category>成就（尚未解鎖）」label — never the masked name.

## 3. Verify
- [x] 3.1 `pnpm -r typecheck` clean.
- [x] 3.2 Add `badge-label.test.ts` unit tests for `resolveBadgeLabel`; full suite 635 green.
- [x] 3.3 `pnpm --filter @study-rpg/neurons-tw build` green.
- [x] 3.4 Playwright hover smoke on `/achievements`: tooltip appears with resolved label, removes on mouseout, locked badges show generic label only, 0 console errors.
- [ ] 3.5 Owner prod verify: an unlocked badge on a real leaderboard row shows its achievement name on hover.
