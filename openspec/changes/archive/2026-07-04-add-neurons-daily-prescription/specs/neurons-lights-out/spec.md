## ADDED Requirements

### Requirement: Player SHALL be able to end the day with a lights-out closure ritual

The homepage SHALL offer a always-available 「今天到此為止」 (lights-out) control. Activating it SHALL play a brief, low-stimulus closure ritual: the connectome/maze dims into a warm night scene, each neuron family the player touched today gives a single soft glow, and a calming line frames rest as part of the mechanism (memory consolidation happens during sleep). The ritual SHALL be available at ANY time of day (it is a chosen "I'm done for today" signal, NOT gated on a clock or on any minimum amount of work) and SHALL fire at most once per day. The lights-out state SHALL persist device-local for the rest of the local-TZ day (`prescription:v1:lightsOutDate:{date}` style meta key, NOT added to `SYNCED_META_KEYS`), and SHALL clear at local midnight. It SHALL degrade under `prefers-reduced-motion` to a static night end-state and SHALL render correctly under direct-URL / F5.

#### Scenario: Player ends the day with the ritual
- **WHEN** the player activates 「今天到此為止」
- **THEN** the connectome dims to a warm night scene, today's touched families each give a single soft glow, and a calming rest-framing line is shown
- **AND** the lights-out state is recorded device-local for the remainder of the day

#### Scenario: Ritual is available regardless of how much was done
- **WHEN** the player activates the ritual on a day with little or no activity
- **THEN** the ritual SHALL still play with an honest, non-punishing framing (e.g.「今天休息，休息也是機制的一部分」) rather than any deficit or scolding message

#### Scenario: Ritual respects reduced motion and resets at midnight
- **WHEN** the user has `prefers-reduced-motion` enabled
- **THEN** the ritual SHALL present a static night end-state (no animation)
- **WHEN** local midnight passes
- **THEN** the lights-out state SHALL clear for the new day

### Requirement: The lights-out ritual SHALL be qualitative and never surface pressuring metrics

The closure ritual SHALL present only qualitative, already-happened signals — which families were touched today — and SHALL NOT display question counts, minutes, accuracy, scores, a countdown, or any pass/fail / readiness estimate. Copy SHALL describe rest and consolidation honestly without claiming a guaranteed outcome.

#### Scenario: No pressuring metrics in the ritual
- **WHEN** the ritual renders
- **THEN** it SHALL NOT show题数/分钟/accuracy/score/countdown/pass-fail estimates
- **AND** it SHALL show only which families were touched today (qualitative) plus the rest-framing line

### Requirement: After lights-out the homepage SHALL enter a calm end-of-day state without hard-locking study

After the ritual, the homepage SHALL enter a calm end-of-day state for the rest of the day: the pushing CTAs (今日處方箋 CTA, quiz entries) SHALL be visually quieted / hidden so the app stops prompting more work. This SHALL NOT be a hard lock — the player SHALL be able to opt back in via an explicit, low-key affordance (e.g.「還是想再讀一下」) that restores the normal homepage. The calm state SHALL NOT display any negative or "you stopped early" framing.

#### Scenario: Calm state quiets the CTAs after lights-out
- **WHEN** lights-out is active for the day
- **THEN** the homepage SHALL quiet/hide the pushing CTAs and stop prompting more work

#### Scenario: Player can opt back in without penalty
- **WHEN** the player taps the low-key「還是想再讀一下」affordance during the calm state
- **THEN** the normal homepage CTAs SHALL be restored with no negative or "you stopped early" framing

### Requirement: Sleep-consolidation copy SHALL be evidence-anchored

Any copy in the ritual that makes a memory-consolidation or sleep claim SHALL be grounded in the design.md OpenEvidence anchor table (systems consolidation / sleep-dependent consolidation) and SHALL be phrased as a general mechanism, not a personal guaranteed outcome.

#### Scenario: Consolidation copy is anchored and non-overclaiming
- **WHEN** the ritual shows a line about sleep or memory consolidation
- **THEN** that line SHALL correspond to a citation in the design.md anchor table and SHALL NOT promise a guaranteed personal result
