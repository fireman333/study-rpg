# neurons-study-squad (delta)

## ADDED Requirements

### Requirement: Expedition completion grants DMN draw entitlement

When an expedition session completes, the `onExpeditionComplete` path SHALL invoke the DMN expedition-axis credit (`creditExpeditionDraws(pool, cleared)` in `neurons-dmn-fate-cards`) with `pool` = the wrong-question count the session was launched against and `cleared` = the session's correct-answer count (which in the wrong-only expedition pool equals the wrong→correct flip count). Draws are granted per the percentage-with-clamp milestones (`DMN_EXPEDITION_MILESTONES`, default 25% / 50% clamped to 3–15 / 6–30), capped per day. The grant SHALL be best-effort: any failure in the reward path SHALL be caught and logged (channel `[expedition-reward]`) and SHALL NOT throw out of the expedition close flow. This metric is inherently anti-farm — the expedition pool contains only currently-wrong questions and depletes as they are cleared, and the per-day cap bounds total draws regardless of how the pool is re-formed.

#### Scenario: Completing an expedition credits the DMN expedition axis

- **WHEN** the player completes an expedition session having cleared one or more wrong-questions
- **THEN** `onExpeditionComplete` SHALL invoke `creditExpeditionDraws(pool, cleared)` with the session's pool size and cleared count
- **AND** a DMN draw SHALL be granted for each milestone threshold met (subject to the per-day cap)

#### Scenario: Zero clears is a no-op

- **WHEN** the player completes an expedition session having cleared no wrong-questions (zero correct)
- **THEN** no milestone is met, no draw is granted, and no error is thrown

#### Scenario: Reward failure does not break the expedition close

- **WHEN** `creditExpeditionDraws` throws (e.g., a transient Dexie error) during `onExpeditionComplete`
- **THEN** the error is caught and logged on the `[expedition-reward]` channel
- **AND** the expedition modal close flow completes normally without propagating the error

## REMOVED Requirements

### Requirement: Reward seam left as a no-op extension point

**Reason**: The expedition completion reward — deferred to this Phase 4 change per `openspec/decisions/2026-06-03-expedition-vs-maze-design-language.md` — is now implemented. `onExpeditionComplete` grants DMN draw entitlement via the expedition axis, so the seam is no longer a no-op. Superseded by the "Expedition completion grants DMN draw entitlement" requirement added in this delta.

**Migration**: No data migration. The existing call site (`OverviewPage` → `QuizModal` `onComplete={onExpeditionComplete}`) is unchanged; only the body of `onExpeditionComplete` flips from no-op to a best-effort DMN-axis credit. Reward state persists via the existing DMN meta keys (no Dexie or R2 schema change).
