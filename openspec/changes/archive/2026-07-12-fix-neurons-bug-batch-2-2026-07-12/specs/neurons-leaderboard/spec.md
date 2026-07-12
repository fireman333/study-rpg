## ADDED Requirements

### Requirement: Leaderboard settings copy reflects the live auto-push behavior

The leaderboard settings controls SHALL describe an opted-in player's row as automatically updating
after every successful cloud sync, and SHALL frame the manual「立即更新排行榜」button as an optional
on-demand refresh. The copy SHALL NOT describe manual upload as an interim measure pending a
not-yet-wired cloud sync, because `pushNeuronsLeaderboardRow` has been wired into the sync engine's
`onPushComplete` hook (`autoPushLeaderboardOnSync`) since cloud sync landed — such copy is stale and
misleads players into thinking their rank is not syncing.

#### Scenario: Settings copy states auto-update, not interim upload

- **WHEN** an opted-in player views the leaderboard settings controls
- **THEN** the copy SHALL state that the leaderboard row updates automatically after each cloud sync
- **AND** SHALL present the manual button as an immediate on-demand refresh
- **AND** SHALL NOT claim manual upload is a temporary measure「未接前的暫時做法」before cloud sync is wired
