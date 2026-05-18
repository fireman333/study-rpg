## MODIFIED Requirements

### Requirement: Study session SHALL be the sole source of reputation and revenue accumulation

The system SHALL provide a study session mode where the player explicitly enters (`startStudySession()`) and exits (`stopStudySession()`). While the session is active, the tick loop SHALL accumulate revenue + reputation per minute per assigned doctor throughput **with the `READING_SESSION_BUFF_MULTIPLIER` (1.5×) applied to throughput** (see `hospital-tycoon-engine` capability for tick formula). While no session is active, the tick loop SHALL NOT accumulate any revenue or reputation. The previous idle tick semantics (`runTick` firing on `setInterval(5000)` regardless of player activity) SHALL be removed.

**The reading-session buff SHALL apply ONLY to tick-loop idle income** (doctor patient throughput). The buff SHALL NOT apply to quiz answer rewards — quiz reward is independent of session state and is computed by the `applyQuizReward` service per `hospital-quiz` capability.

The mental model exposed to the player: "唸書 session = 我在診間旁邊讀書，醫師同時看患者，所以醫師看患者的營收/聲望會有 1.5× 加成。寫題答對的營收/聲望跟有沒有唸書 session 無關（只受診所階級和搭檔醫師專長影響）。"

#### Scenario: Session-off produces zero tick output

- **GIVEN** no study session is active (`studySession.state === 'idle'`)
- **WHEN** 60 seconds of wall-clock time pass
- **THEN** `gameCounters.revenue` SHALL remain unchanged
- **AND** `gameCounters.reputation` SHALL remain unchanged
- **AND** `gameCounters.totalStudyMinutes` SHALL remain unchanged

#### Scenario: Session-on accumulates per-minute tick with 1.5× buff

- **GIVEN** a study session has been active for 60 seconds with `totalThroughput = 40`
- **WHEN** the tick loop fires
- **THEN** `gameCounters.revenue` SHALL increase by approximately `40 × 1.5 = 60`
- **AND** `gameCounters.reputation` SHALL increase by approximately `60`
- **AND** `gameCounters.totalStudyMinutes` SHALL increase by approximately 1

#### Scenario: Quiz answered correctly during active session receives NO additional session buff

- **GIVEN** a study session is active and the player opens QuizModal
- **AND** the player has `gameCounters.tier === '診所'`, no doctor partner bound
- **WHEN** the player answers a question correctly
- **THEN** `gameCounters.revenue` SHALL increase by exactly `80` (base reward, no session buff applied)
- **AND** the tick-loop idle accrual SHALL still independently fire its own `1.5× throughput` reward on the next tick cycle

#### Scenario: Mental model copy displayed consistently across UI surfaces

- **GIVEN** the player has the app open
- **WHEN** the player views the StudySessionPage help banner, HelpMenu reading-session accordion section, OR V6Migration explainer dialog
- **THEN** all three surfaces SHALL describe the buff as "醫師看患者的營收/聲望會有 1.5× 加成" (or equivalent wording referencing doctor patient income)
- **AND** none of the three surfaces SHALL claim that quiz answer rewards receive the session buff
