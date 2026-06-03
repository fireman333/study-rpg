# neurons-homepage (delta)

## MODIFIED Requirements

### Requirement: Homepage SHALL display a cap-aware "next DMN draw" progress ring driven by real reading-timer data

The homepage SHALL replace the prose rule line describing DMN draw timing with a `DmnDrawProgressRing` whose fill reflects the expedition-axis DMN draws earned today toward the daily cap (`dmnTimeAxisDrawsConsumedToday / DMN_EXPEDITION_DAILY_CAP`), sourced from `readDmnMeta()`. (Per `add-neurons-expedition-rewards`, the first DMN axis is driven by 出征 wrong-question clears, NOT reading minutes; the `dmnTimeAxisMinutesAccrued` counter now carries cumulative expedition clears today, surfaced in the ring caption.) The ring SHALL be daily-cap aware: when the daily expedition-axis draw cap is reached it SHALL render an explicit terminal state rather than continuing a misleading countdown.

#### Scenario: Ring fills as expedition draws are earned today
- **WHEN** the player earns expedition-axis DMN draws within the current local-TZ day (clearing wrong-questions in 出征)
- **THEN** the ring fill advances proportionally toward the daily cap

#### Scenario: Ring reflects the daily cap as a terminal state
- **WHEN** the daily expedition-axis DMN draw cap has been reached
- **THEN** the ring shows a "今日抽卡已達上限" terminal state instead of a countdown toward another draw

#### Scenario: No prose rule line remains for DMN timing
- **WHEN** the homepage renders
- **THEN** the previous "每 30 min 觸發 DMN 抽卡…" prose rule line is absent, the ring conveying the mechanic visually instead
