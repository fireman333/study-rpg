## MODIFIED Requirements

### Requirement: The UI SHALL make the wiring benefit (synaptic conduction) legible

To communicate the benefit of wiring (not just that conduction happened), the UI SHALL provide three presentation layers over the existing `connectome-collection` conduction mechanic. In all of them the UI SHALL NOT itself grant or compute conduction energy or wiring — it only presents engine-computed state.

1. **Settlement conduction ledger**: at expedition settlement, a short ledger SHALL list each conduction that flowed (`<source> → <target> +<amount> 能量`) plus a total (`今日連線額外獲得 +X 能量`), alongside the day's repairs, whether a wire formed/strengthened, and (when no cross-subject wiring occurred) an honest "今日已修復，尚未形成跨科連線" line.

2. **Per-wire tooltip**: hovering (desktop) or tapping (touch) a wire on the maze synapse overlay SHALL surface a tooltip describing that wire's two subjects, its tier and conduction rate, and today's conduction usage against the per-wire cap (e.g. 「藥理 ↔ 解剖 · 強連線 +12% · 今日傳導 12/15」). A legacy / not-re-validated wire (per the `connectome-collection` legacy-synapse rule) SHALL be labelled as 早期連線 and indicated as non-conducting. On touch devices, tapping elsewhere SHALL dismiss the tooltip. The wire/rate/usage values SHALL be read from engine state, not computed in the UI.

3. **About-to-wire ghost line**: at expedition settlement the recap SHALL surface the closest about-to-wire pair as a nudge — 「再修復 X 題就能和 <subject> 形成連線」 — where the pair and the remaining-repair count X are derived by the engine from today's per-subject repair counts versus the wiring gate. When no pair is close, the recap SHALL show an honest empty state rather than a fabricated hint.

#### Scenario: Settlement shows the conduction ledger

- **GIVEN** today's expedition settlement conducted +12 from 藥理 to 解剖 and +5 from 藥理 to 生化
- **WHEN** the settlement screen renders
- **THEN** it SHALL list `藥理 → 解剖 +12`、`藥理 → 生化 +5` and `今日連線額外獲得 +17 能量`

#### Scenario: Per-wire tooltip on hover (desktop)

- **GIVEN** a strong wire between 藥理 and 解剖 has conducted 12 of its 15 daily cap today
- **WHEN** the player hovers that wire's spark on the maze synapse overlay
- **THEN** a tooltip SHALL appear naming both subjects, the rate (`+12%`), and today's usage (`今日傳導 12/15`)
- **AND** moving the pointer off the wire SHALL dismiss the tooltip

#### Scenario: Per-wire tooltip on tap (touch)

- **GIVEN** the player is on a touch device viewing the maze synapse overlay
- **WHEN** the player taps a wire's spark
- **THEN** the per-wire tooltip SHALL appear
- **WHEN** the player taps elsewhere
- **THEN** the tooltip SHALL dismiss

#### Scenario: Legacy wire tooltip indicates non-conducting

- **GIVEN** a legacy wire whose `lastCoFireDate` predates the conduction epoch
- **WHEN** the player hovers or taps it
- **THEN** the tooltip SHALL label it 早期連線 and indicate it does not conduct

#### Scenario: About-to-wire ghost line in the settlement recap

- **GIVEN** after settlement one subject is repaired-today at the wiring threshold and a not-yet-wired subject is 2 repairs short
- **WHEN** the settlement recap renders
- **THEN** it SHALL show 「再修復 2 題就能和 <that subject> 形成連線」

#### Scenario: About-to-wire ghost line honest empty state

- **WHEN** the settlement recap renders and no pair is close to wiring
- **THEN** no fabricated 「再修復 X 題…」 hint SHALL be shown (an honest empty state is shown instead)

## ADDED Requirements

### Requirement: The homepage SHALL play a once-per-day completion ritual on the first effective expedition completion

To give the daily loop a payoff moment, the homepage SHALL play a brief celebratory ritual overlay the first time the day's effective-completion gate is reached (the same gate that flips 今日出征 → 完成 and increments the daily streak). The ritual SHALL fire at most once per day, SHALL reuse the existing completion-celebration presentation primitives, and SHALL respect `prefers-reduced-motion` (degrading to a static/no-animation acknowledgement). The once-per-day guard SHALL be a date-keyed `meta` flag that is NOT added to the synced meta-key allowlist (cosmetic; a second device the same day MAY re-show it once). The ritual SHALL NOT block interaction and SHALL auto-dismiss.

#### Scenario: Ritual fires once on first effective completion of the day

- **GIVEN** the player has not yet reached an effective expedition completion today
- **WHEN** an expedition settles with `effectiveCompletion === true`
- **THEN** the completion ritual overlay SHALL play
- **AND** the date-keyed ritual flag for today SHALL be set

#### Scenario: Ritual does not replay later the same day

- **GIVEN** the ritual already played today
- **WHEN** a later expedition settles with `effectiveCompletion === true`
- **THEN** the ritual SHALL NOT play again that day

#### Scenario: Ritual respects reduced motion

- **GIVEN** the player's OS reports `prefers-reduced-motion: reduce`
- **WHEN** the ritual triggers
- **THEN** it SHALL present a static / non-animated acknowledgement rather than the full motion overlay

#### Scenario: No effective completion → no ritual

- **WHEN** an expedition settles with `effectiveCompletion === false`
- **THEN** the ritual SHALL NOT play
