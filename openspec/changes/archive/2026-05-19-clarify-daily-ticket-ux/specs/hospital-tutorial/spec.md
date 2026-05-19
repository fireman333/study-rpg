## MODIFIED Requirements

### Requirement: Always-available help menu SHALL list all mechanic explanations

The system SHALL provide a help menu (icon: `❓`) accessible from any page header. Clicking SHALL open a modal listing all major mechanics with short explanations + estimated time/cost numbers. Sections:

- **念書 session**: how to start, auto-pause rules, scene meaning
- **醫師招募**: gacha rates, pity P3/P2, diversification gate
- **房間 + 醫師指派**: tier rooms, facility upgrade, extension
- **薪水 + 營收**: proportional salary, tier-1 grace, default-net-positive guarantee
- **進修**: success rates per rarity, cost, pity 5
- **特殊事件**: trigger conditions, reputation scaling, negative events
- **命運卡**: unlocked at 醫學中心, cost per tier, pity 3
- **升級 tier**: dual-gate (reputation + diversification), 4 tiers, study time targets (20 / 50 / 200 hr)

Each section SHALL be a collapsible accordion. The help modal SHALL NOT block gameplay — player can dismiss without losing context.

**Copy-drift prevention sub-clauses (added by `fix-helpmenu-copy-stale` 2026-05-19):**

- **Numeric tier thresholds** SHALL be sourced at render time from the `TIER_UPGRADE_THRESHOLDS` constant exported by `@study-rpg/content-medexam2-tw`, formatted as `<value/1000>k`. Hard-coded threshold integers in the §升級 tier body are PROHIBITED. This ensures that any future recalibration of `TIER_UPGRADE_THRESHOLDS` (e.g. dogfood retune) propagates to HelpMenu automatically.
- **AAD button reference** in the 醫師退休與返還 (§retire) section body SHALL name the action button as `AAD`, with the 自願離院 / 退休 全稱 inline on first mention for new-player comprehension. The accordion section title MAY continue to use 「醫師退休與返還」 (the heading the player reads BEFORE clicking) and the internal section id MAY remain `retire`. This aligns with `rename-retire-to-aad` (2026-05-19) which deliberately separates user-visible button label from internal identifiers.

**Daily-ticket cadence sub-clause (added by `clarify-daily-ticket-ux` 2026-05-19):**

- **§recruitment body** SHALL quantify the daily-ticket grant explicitly: the cadence (+1/day), the cap (99), and the reset time in Taiwan local terms (08:00 台灣早上). Vague phrasing like 「每天免費招募券」 without quantifier is PROHIBITED because it leaves players unable to distinguish "feature works" from "feature broken" — `clarify-daily-ticket-ux` was opened specifically because players misread the unquantified copy as a bug report. Cross-reference: the same Taiwan-08:00 wording SHALL appear on the HomePage ticket-counter `title` tooltip (see `recruitment-gacha` Req「Recruitment ticket SHALL be the sole gating resource」 UI affordance sub-clause) so both surfaces use identical language.

#### Scenario: Help menu accessible from home

- **GIVEN** the player is on the `/` home route
- **WHEN** the player clicks `❓` icon
- **THEN** the help modal SHALL open
- **AND** all 10 sections SHALL be listed (8 mechanic sections + 「回報問題 / 建議」 from `bug-reporting` + 「急診照會設定」 from `add-er-consultation-feature`)
- **AND** clicking a section header SHALL expand its content

#### Scenario: Help menu accessible from any page

- **GIVEN** the player is on `/training`
- **WHEN** the player clicks `❓` icon
- **THEN** the same help modal SHALL be available

#### Scenario: Tier-upgrade copy renders current thresholds

- **GIVEN** the `TIER_UPGRADE_THRESHOLDS` constant in `@study-rpg/content-medexam2-tw` has values 診所=30_000, 區域醫院=80_000, 醫學中心=150_000
- **WHEN** the player opens HelpMenu and expands the 「升級雙閘門（聲望 + 多樣性）」 section
- **THEN** the body SHALL render the thresholds as `30k` / `80k` / `150k` (not the legacy hard-coded `48k` / `192k` / `2M`)
- **AND** the rendered values SHALL update automatically if the constant is changed in a future tune (no source-string edit required)

#### Scenario: Retire copy names button as AAD

- **GIVEN** the player has opened HelpMenu
- **WHEN** the player expands the 「醫師退休與返還」 section
- **THEN** the body SHALL refer to the button as `AAD`
- **AND** the parenthetical 自願離院 / 退休 全稱 SHALL appear once for clarity
- **AND** the body SHALL NOT instruct the player to click a 「退休」 button (which no longer exists at the user-visible label level)

#### Scenario: Recruitment copy quantifies daily ticket grant

- **GIVEN** the player has opened HelpMenu
- **WHEN** the player expands the 「招募醫師（gacha + 親和值）」 section
- **THEN** the body SHALL state the daily-ticket cadence as `每日台灣早上 08:00 +1 張免費招募券（持有上限 99）` (or visually equivalent wording specifying +1/day, cap 99, and 台灣 08:00 reset)
- **AND** the body SHALL NOT use the unquantified phrasing 「每天免費招募券」 without specifying the +1 / cap / reset time
