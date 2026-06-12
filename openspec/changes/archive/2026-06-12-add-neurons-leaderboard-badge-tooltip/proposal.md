## Why

On `/leaderboard`, a player's achievement badges render next to the nickname but give no hint of **what each badge is** — hovering them does nothing. 二階 (`medexam2-hospital-tw`) already shows the achievement name on badge hover via a small custom tooltip host; neurons should match so players can read a badge without opening the 成就 page.

## What Changes

- New `apps/neurons-tw/src/components/CustomTooltipHost.tsx` — ported 1:1 from 二階. A document-level delegate that shows a fast (250 ms), styled, `position: fixed` tooltip for any element carrying `data-tooltip`. Mounted once at the App root (`App.tsx`). Escapes the leaderboard list's `overflow` clipping; no-op on touch devices.
- `apps/neurons-tw/src/components/BadgeSprite.tsx`:
  - New exported helper `resolveBadgeLabel(category, tier)` — resolves the representative achievement name(s) for a badge from `NEURONS_ACHIEVEMENTS`. Because a badge encodes only `<category>:<tier>` (highest unlocked per category) and several achievements can share that cell, names are joined with `" / "`. Falls back to a generic「<tier>級<category>成就」when the catalog has no match.
  - The badge `<div>` gains `role="img"` + `data-tooltip` + `aria-label` set to that label, plus an optional `ariaLabel` prop override (mirrors 二階's API).
  - **Locked** badges do NOT reveal the name — they show a generic「<tier>級<category>成就（尚未解鎖）」label so the `/achievements` page's masked「????」locked names are not leaked via hover. Leaderboard badges are always unlocked, so they show the real name as requested.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-leaderboard`: ADD a requirement that a leaderboard badge reveals its achievement name on hover, and that locked badges never reveal their name.

## Impact

- **Code**: 1 new component (~120 lines, ported), 1 helper + attributes on `BadgeSprite`, 1 mount line in `App.tsx`. Presentation-only — no Dexie / R2 / SYNCED_META / Worker / D1 change; no economy or schema change.
- **Shared component note**: `BadgeSprite` is also used by `AchievementCard` / `AchievementToastHost` / `AchievementUnlockModal`. They now get the same hover tooltip; the name is already visible in those contexts so it is additive, and the locked-name guard protects `/achievements` silhouettes.
- **Risk**: minimal. `pnpm -r typecheck` clean; 635 vitest green (+3 new `badge-label` tests); neurons build green; Playwright hover smoke on `/achievements` confirms tooltip appears with the resolved label, removes on mouseout, 0 console errors, and locked badges show only the generic label (no name leak).
- **Verify on prod**: leaderboard badges require a backend profile (not easily seeded in dev) — owner confirms an unlocked badge on a real leaderboard row shows its achievement name on hover.
