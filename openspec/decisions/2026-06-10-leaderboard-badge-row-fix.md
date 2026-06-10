# TODO: fix neurons leaderboard 獎牌排版 (badges stack into rows)

> Logged 2026-06-10. Queued AFTER `finalize-mock-variant-catalog` ships.

**Bug**: On `/leaderboard`, a player's achievement badges stack vertically into
several rows instead of sitting inline in one row next to the nickname.

**Root cause**: `BadgeSprite` renders a block-level `<div>` (with `flexShrink:0`,
designed for a flex parent), but `NicknameWithBadges`
(`apps/neurons-tw/src/routes/LeaderboardPage.tsx:~348`) places them directly inside
an inline `<span>` (`nicknameCellStyle`) with NO flex container. Block `<div>`s in
an inline span each break to a new line → vertical stacking. Width-independent.

**Fix** (tiny, one component): make the `NicknameWithBadges` container `inline-flex`:
`{ ...nicknameCellStyle, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }`,
wrap the nickname in its own `overflow:hidden; textOverflow:ellipsis` span so it
still truncates; badges (`flexShrink:0`) sit inline after it. Optional: cap visible
badges at N + "…" to avoid horizontal overflow in a narrow cell.

**Change**: lean fix `fix-neurons-leaderboard-badge-row`. NO spec delta
(`neurons-leaderboard` spec doesn't make badge layout normative). NO schema/sync.
Do NOT fold into the mock-variant change (different subsystem).
