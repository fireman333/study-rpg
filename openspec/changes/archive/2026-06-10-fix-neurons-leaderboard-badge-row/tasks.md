## 1. Fix the badge row layout

- [x] 1.1 `NicknameWithBadges`: when badges present, use an `inline-flex` container (`nicknameWithBadgesStyle`); move the nickname into an ellipsis-truncating span (`nicknameTextStyle`, `minWidth:0`)
- [x] 1.2 Keep nickname-only rows on the existing `nicknameCellStyle`

## 2. Verify

- [x] 2.1 `pnpm -r typecheck` + 561 vitest green (CSS-only, no logic)
- [x] 2.2 neurons Vite build green
- [ ] 2.3 Prod visual confirm (badges need a backend leaderboard profile — owner eyeballs on prod)
