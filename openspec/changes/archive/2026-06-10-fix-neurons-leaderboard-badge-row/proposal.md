## Why

On `/leaderboard`, a player's achievement badges stack **vertically into several rows** instead of sitting inline in one row next to the nickname. Root cause: `BadgeSprite` renders a block-level `<div>` (with `flexShrink: 0`, designed for a flex parent), but `NicknameWithBadges` placed them directly inside an inline `<span>` (`nicknameCellStyle`) with no flex container — block `<div>`s inside an inline span each break to a new line. Width-independent.

## What Changes

- `NicknameWithBadges` (`apps/neurons-tw/src/routes/LeaderboardPage.tsx`): when badges are present, the container becomes an `inline-flex` row (`nicknameWithBadgesStyle`); the nickname text moves into its own `overflow:hidden; textOverflow:ellipsis` span (`nicknameTextStyle`, `minWidth:0`) so it truncates, while the `flexShrink:0` badges lay out horizontally after it.
- No nickname-only rows change (they keep `nicknameCellStyle`).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-leaderboard`: ADD a requirement that nickname badges render in a single inline row (makes the layout normative so the block-vs-inline regression can't silently return).

## Impact

- **Code**: one component in `LeaderboardPage.tsx` (+ 2 style consts). CSS-only — no logic, no schema, no sync, no Worker/D1 change.
- **Risk**: minimal (pure layout). typecheck + 561 vitest + neurons build green. Visual confirm on prod (badges require a backend leaderboard profile, not easily seeded in dev).
