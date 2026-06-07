## ADDED Requirements

### Requirement: Correct-answer feedback intensity SHALL scale continuously with the current answer streak

The quiz correct-answer feedback (primarily the peripheral spike-train EEG burst) SHALL scale its visual intensity continuously as a function of the player's current correct-answer streak — the higher the streak, the stronger the burst — so that the most frequent positive feedback in the core loop escalates with sustained correct answers. The scaling SHALL be continuous (a smooth function of streak), NOT bucketed into discrete tiers, and SHALL be governed by dogfood-tunable constants (a per-streak intensity step and a hard intensity cap) so the effect cannot grow unbounded. The streak input SHALL be the already-persisted current correct-answer streak; this requirement adds NO new persisted state and NO sync-surface change — it only reads existing streak state at render time.

The intensity scaling SHALL adjust the burst's visual magnitude (e.g. stroke width / glow / spike amplitude) only, and MUST NOT modify any published motion-library timing token (the spike-train and related tokens retain their pre-change durations). The escalated feedback MUST remain non-blocking: it SHALL NOT block or delay answer resolution, reward, or the transition to the next question. When `prefers-reduced-motion` is set, the feedback SHALL degrade to a fixed (non-escalating) static / minimal cue.

#### Scenario: Higher streak produces a stronger burst

- **WHEN** the player answers correctly with a higher current streak
- **THEN** the correct-answer spike-train burst renders at a higher visual intensity than at a lower streak
- **AND** the scaling is a continuous function of streak (no discrete tier jumps)

#### Scenario: Intensity is capped and tunable

- **WHEN** the current streak grows large
- **THEN** the feedback intensity SHALL not exceed the configured hard cap
- **AND** the per-streak step and cap SHALL be adjustable via dogfood-tunable constants

#### Scenario: Escalation does not block answer resolution and leaves timing tokens unchanged

- **WHEN** the escalated correct-answer feedback fires
- **THEN** answer resolution, reward, and next-question availability SHALL NOT be blocked or delayed
- **AND** the published spike-train / related timing tokens SHALL retain their pre-change values

#### Scenario: Reduced-motion disables escalation

- **WHEN** the user has `prefers-reduced-motion: reduce` set
- **THEN** the correct-answer feedback SHALL render at a fixed, non-escalating static / minimal cue regardless of streak
