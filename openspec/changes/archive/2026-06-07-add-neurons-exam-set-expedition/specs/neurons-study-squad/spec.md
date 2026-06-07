## MODIFIED Requirements

### Requirement: All-subject wrong-question expedition

The connectome homepage SHALL surface a 出征 action that opens a **遠征選單** offering two co-equal expeditions: **錯題遠征** (defined by this requirement) and **年份回數遠征** (defined by `neurons-exam-set-expedition`). The menu itself SHALL be reachable regardless of either pool's state, so the player can always pick the other expedition.

**錯題遠征** opens the existing `QuizModal` on the cross-subject pool of questions whose `questionHistory.lastResult === 'wrong'` (the "currently unmastered" set), spanning all subjects — NOT a single family. When that pool is empty, the 錯題遠征 option SHALL surface an empty-state (disabled control or message) instead of opening a broken modal; the 遠征選單 SHALL still allow selecting 年份回數遠征.

#### Scenario: 出征 opens a 遠征選單 with two expeditions
- **WHEN** the player triggers 出征
- **THEN** a 遠征選單 SHALL present 錯題遠征 and 年份回數遠征 as co-equal options

#### Scenario: 錯題遠征 with wrong questions opens the drill
- **WHEN** the player picks 錯題遠征 and the cross-subject `lastResult === 'wrong'` pool is non-empty
- **THEN** `QuizModal` opens on exactly that pool, drawing from multiple subjects

#### Scenario: 錯題遠征 with an empty pool
- **WHEN** the player picks 錯題遠征 and there are no `lastResult === 'wrong'` questions
- **THEN** an empty-state message is shown and no `QuizModal` opens
- **AND** 年份回數遠征 SHALL remain selectable from the 遠征選單

#### Scenario: Pool is all-subject, not per-family
- **WHEN** the wrong-question pool spans multiple subjects
- **THEN** the 錯題遠征 drill includes questions from all of them (no family restriction)

### Requirement: Expedition completion grants DMN draw entitlement

When an expedition session completes, the `onExpeditionComplete` path SHALL invoke the DMN expedition-axis credit (`creditExpeditionDraws(pool, cleared)` in `neurons-dmn-fate-cards`) with `pool` = the question count the session was launched against (for 錯題遠征, the wrong-question count; for 年份回數遠征, the unanswered-set count it opened on) and `cleared` = the session's correct-answer count. Draws are granted per the percentage-with-clamp milestones (`DMN_EXPEDITION_MILESTONES`, default 25% / 50% clamped to 3–15 / 6–30), capped per day. Both expeditions share the single expedition-axis daily cap (one axis). The grant SHALL be best-effort: any failure in the reward path SHALL be caught and logged (channel `[expedition-reward]`) and SHALL NOT throw out of the expedition close flow. This metric is inherently anti-farm — each expedition pool depletes as questions are cleared/answered, and the per-day cap bounds total draws regardless of how the pool is re-formed.

#### Scenario: Completing an expedition credits the DMN expedition axis
- **WHEN** the player completes an expedition session (錯題 or 年份回數) having answered one or more correctly
- **THEN** `onExpeditionComplete` SHALL invoke `creditExpeditionDraws(pool, cleared)` with the session's pool size and cleared count
- **AND** a DMN draw SHALL be granted for each milestone threshold met (subject to the shared per-day cap)

#### Scenario: Zero clears is a no-op
- **WHEN** the player completes an expedition session having cleared no questions (zero correct)
- **THEN** no milestone is met, no draw is granted, and no error is thrown

#### Scenario: Reward failure does not break the expedition close
- **WHEN** `creditExpeditionDraws` throws (e.g., a transient Dexie error) during `onExpeditionComplete`
- **THEN** the error is caught and logged on the `[expedition-reward]` channel
- **AND** the expedition modal close flow completes normally without propagating the error
