## ADDED Requirements

### Requirement: First-time onboarding flow SHALL introduce core mechanics in sequence

The system SHALL run a sequenced first-time tutorial when a new player starts the game (no `gameCounters.singleton` exists yet). The tutorial SHALL gate each step on the player completing a small action, not on time elapsed. Tutorial sequence (in order):

1. **Welcome + concept** — modal explaining「在這裡，念書 = 醫院賺錢 = 升級」 (~1 paragraph)
2. **Starter pull** — guide to recruitment screen with "免費抽 P4+" highlight
3. **First doctor assignment** — guide to drag doctor into outpatient room
4. **First study session** — guide to click 「開始唸書」 button, scene opens, 1-min minimum study
5. **First revenue check** — guide back to home, show revenue counter and pulse-highlight
6. **Tier upgrade preview** — explain dual-gate concept (reputation + diversification)
7. **Done banner** — "你已掌握基本操作，繼續念書解鎖更多功能"

Each step SHALL persist `tutorial.completedSteps[stepId] = true` in `gameCounters` so reloads resume at the next pending step. The player SHALL be able to skip the entire tutorial via a「跳過教學」link in step 1 (sets all steps to completed; no return to tutorial).

#### Scenario: Fresh player sees step 1 on first load

- **GIVEN** no `gameCounters.singleton` exists in IndexedDB
- **WHEN** the app first renders
- **THEN** the welcome modal (step 1) SHALL be visible
- **AND** no other game UI elements SHALL be interactive yet (modal blocks)

#### Scenario: Skip dismisses all steps

- **GIVEN** the welcome modal is showing
- **WHEN** the player clicks「跳過教學」
- **THEN** all `tutorial.completedSteps` SHALL be set to `true`
- **AND** the modal SHALL close
- **AND** the player SHALL NOT see tutorial prompts again on this save

#### Scenario: Reload resumes at first incomplete step

- **GIVEN** the player completed steps 1-3 then closed the browser
- **WHEN** the app reloads
- **THEN** the next interaction SHALL surface the step 4 prompt (first study session guide)

### Requirement: Contextual hints SHALL appear on first-encounter of each major surface

The system SHALL track per-surface "first-visit" flags (`tutorial.firstVisit.<surface>`). When the player navigates to a major surface for the first time, the system SHALL show a contextual hint card explaining that surface. Surfaces requiring first-visit hints:

| Surface | Hint message focus |
|---|---|
| `/study` | 「session 計時、自動暫停、看診畫面就是你的醫院」 |
| `/training` | 「進修機率 + pity 5 保底 + 失敗不掉等級」 |
| `/hospital` (room management) | 「facility 升級放大 throughput，房間擴建容納更多醫師」 |
| `/fate-cards` (when unlocked) | 「reputation 溢出消耗、4 階卡包、pity 3 防連衰」 |
| Event modal (first occurrence) | 「正面事件接受，負面事件選擇付錢或扣聲望」 |

Each hint SHALL be dismissible and SHALL NOT appear again on the same save. A「重新顯示提示」option SHALL exist in settings panel for players who want to re-read all hints.

#### Scenario: First visit to /training shows hint

- **GIVEN** `tutorial.firstVisit.training = undefined`
- **WHEN** the player navigates to `/training` for the first time
- **THEN** a hint card SHALL appear explaining training mechanics
- **AND** after the player dismisses, `tutorial.firstVisit.training = true`

#### Scenario: Second visit does NOT show hint

- **GIVEN** `tutorial.firstVisit.training = true`
- **WHEN** the player navigates to `/training` again
- **THEN** no hint SHALL appear

#### Scenario: Settings "show hints again" resets all flags

- **GIVEN** all `tutorial.firstVisit.*` flags are `true`
- **WHEN** the player clicks「重新顯示提示」in settings
- **THEN** all `tutorial.firstVisit.*` flags SHALL reset to `undefined`
- **AND** the next surface visit SHALL trigger that surface's hint

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

#### Scenario: Help menu accessible from home

- **GIVEN** the player is on the `/` home route
- **WHEN** the player clicks `❓` icon
- **THEN** the help modal SHALL open
- **AND** all 8 sections SHALL be listed
- **AND** clicking a section header SHALL expand its content

#### Scenario: Help menu accessible from any page

- **GIVEN** the player is on `/training`
- **WHEN** the player clicks `❓` icon
- **THEN** the same help modal SHALL be available

### Requirement: V6 first-launch SHALL show a "what changed" modal for existing players

When a player who previously played the v4/v5 hospital app launches v6 for the first time (detected by `gameCounters.singleton` existing AND `tutorial.firedTips.v6_welcome` being undefined AND `gameCounters.tier !== '診所'` indicating they're past onboarding), the system SHALL display a one-time modal explaining the redesign:

- Title: 「醫院系統大改版」
- Body: 簡述新增的「念書 session 模式 / 醫師薪水 / 設施升級 / 命運卡 / 教學提示」幾個重點機制
- Outcome impact: 提醒「進入區域醫院後醫師會開始扣薪，記得 `❓` 看明細」+「目前 default 配置一定 net positive，不會破產」
- Single dismiss button「我知道了」 — sets `tutorial.firedTips.v6_welcome = true`

The modal SHALL NOT block gameplay or counters — purely informational. New players (whose `gameCounters.singleton` was just created by ensureSeed) SHALL NOT see this modal; they go through the standard 7-step onboarding flow instead.

#### Scenario: Existing v5 player sees migration modal on first v6 boot

- **GIVEN** a save with `gameCounters.tier = '區域醫院'` (mid-game) and `tutorial.firedTips.v6_welcome` undefined
- **WHEN** the app boots after v6 upgrade
- **THEN** the migration modal SHALL appear
- **AND** after dismissal, `tutorial.firedTips.v6_welcome = true`
- **AND** the modal SHALL NOT appear on subsequent launches

#### Scenario: New player skips migration modal

- **GIVEN** a fresh save (no prior gameCounters)
- **WHEN** ensureSeed creates the singleton
- **THEN** the 7-step onboarding tutorial SHALL run (per Requirement 1)
- **AND** the v6 migration modal SHALL NOT appear (only the onboarding flow)

### Requirement: Tip notifications SHALL appear on key game-state milestones

The system SHALL fire toast-style notifications when the player reaches state thresholds, to teach them about emerging mechanics. Tip triggers:

| Trigger | Tip message |
|---|---|
| First time `revenue >= 1000` and revenue not yet spent | 「營收 ≥ 1000 — 試試到 /training 升等醫師」 |
| First time `reputation >= 48,000` but diversification gate not met | 「聲望已達 區域醫院 門檻，但還需 N 不同科別醫師（目前 M）」 |
| First time tier upgraded to 醫學中心 | 「醫學中心已解鎖命運卡（/fate-cards）— 用 reputation 抽獎」 |
| First time `revenue` net drops below `+10/min` for 5 consecutive ticks | 「營收成長變慢 — 考慮升級 facility 或擴建房間」 |
| First time a doctor reaches pity threshold 5 in training | 「N 次失敗後下次必中 — 別放棄」 |

Each tip SHALL fire at most once per save (tracked via `tutorial.firedTips[tipId]`). Tips SHALL be ≤ 80 characters, auto-dismiss after 8 seconds, dismissible by click.

#### Scenario: Revenue tip fires at 1000

- **GIVEN** `revenue = 999` and `tutorial.firedTips.revenue_1000 = undefined`
- **WHEN** the next tick increments revenue to >= 1000
- **THEN** a toast tip SHALL appear suggesting training
- **AND** `tutorial.firedTips.revenue_1000` SHALL be set to `true`
- **AND** subsequent crossings of 1000 SHALL NOT re-trigger the tip
