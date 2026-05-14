## ADDED Requirements

### Requirement: Game loop SHALL follow 4-step closed cycle

The hospital management mode SHALL implement a closed game loop:

1. Player answers questions filtered by subject (one of 14 二階國考 subjects)
2. Per-subject **affinity** counter accumulates with each correct answer
3. When `affinity[subject] >= threshold[subject]`, the subject's recruitment banner SHALL be unlocked
4. Player consumes recruitment tickets to roll for doctors (P1–P5 rarity); recruited doctors are assigned to hospital rooms; rooms auto-process patients producing revenue + reputation

The loop is intentionally closed — answering more questions → unlocks more banners → more doctors → more reputation → hospital upgrade → more room slots → encourages answering more questions. No external grind / no real-money loop.

#### Scenario: Initial state has no unlocked subjects

- **GIVEN** the player starts a new save
- **THEN** `affinity[subject] = 0` for all 14 subjects
- **AND** every recruitment banner SHALL be in `locked` state with displayed text `「再答對 N 題<科別> 解鎖」`
- **AND** the player MAY answer questions from any subject (answering is not gated)

#### Scenario: First subject unlock

- **GIVEN** the player has answered 49 外科 questions correctly and `threshold[外科] = 50`
- **WHEN** the player answers one more 外科 question correctly
- **THEN** `affinity[外科]` SHALL increment to 50
- **AND** the 外科 recruitment banner SHALL transition to `unlocked` state
- **AND** an in-app notification SHALL fire informing the player

### Requirement: Progression metric SHALL be hospital level + reputation score

The player's primary "becoming stronger" feedback SHALL be measured by:

- **Hospital level**: discrete tier `診所` → `區域醫院` → `醫學中心` (three tiers total)
- **Reputation score**: continuous integer accumulating from processed patients × doctor power × room facility

Hospital level SHALL upgrade when reputation crosses tier-specific thresholds. The specific threshold values, room-slot increments per tier, and reputation formula are NOT specified in this capability — they are deferred to `wire-clinic-level-up` and `wire-hospital-reputation` changes.

#### Scenario: Hospital tier upgrade fires on threshold cross

- **GIVEN** the hospital is at tier `診所` with reputation just below the `診所 → 區域醫院` threshold
- **WHEN** accumulated reputation reaches or exceeds the threshold (value defined in `wire-clinic-level-up`)
- **THEN** the hospital SHALL transition to `區域醫院` tier
- **AND** new room slots SHALL become available (count defined in `wire-clinic-level-up`)
- **AND** the visual building rendering SHALL switch to the `區域醫院` pixel scene

### Requirement: Doctor cards SHALL be tycoon-idle units (no combat)

Each recruited doctor SHALL occupy a hospital room and contribute to that room's patient throughput. Doctors SHALL NOT have a separate combat / battle / boss-fight system. Idle revenue accumulation is the only doctor function.

The set of valid room types is `{ outpatient, surgery, ward }`. Specific room counts per tier and per-type behaviors are deferred to `wire-clinic-level-up` and `wire-hospital-tycoon-engine`.

#### Scenario: Doctor multiplier affects room throughput multiplicatively

- **GIVEN** an outpatient room with `baseRate = 10 patients/min` and `roomFacility = 1.0`
- **WHEN** a P1 doctor with `powerMultiplier = 5.0` is assigned
- **THEN** the room throughput SHALL be `10 × 5.0 × 1.0 = 50 patients/min`
- **WHEN** the assigned doctor is replaced with a P5 doctor (`powerMultiplier = 0.5`)
- **THEN** the room throughput SHALL be `10 × 0.5 × 1.0 = 5 patients/min`

#### Scenario: Unassigned rooms produce zero throughput

- **GIVEN** a hospital with 3 rooms and only 1 assigned doctor
- **WHEN** the game ticks
- **THEN** only the assigned room SHALL produce revenue + reputation
- **AND** the 2 unassigned rooms SHALL contribute zero

### Requirement: Doctor rarity SHALL be P1 through P5 mapped to power only

Doctor rarity SHALL use the 5-tier `「夯到拉」` system (per `~/.claude/imports/priority_levels.md`):

| Tier | Label | powerMultiplier |
|---|---|---|
| P1 | 夯 | 5.0 |
| P2 | 頂級 | (between P1 and P3, monotonic) |
| P3 | 人上人 | (between P2 and P4, monotonic) |
| P4 | NPC | (between P3 and P5, monotonic) |
| P5 | 拉完了 | 0.5 |

Rarity SHALL map purely to `powerMultiplier`. Rarity SHALL NOT carry implicit semantics about drop weight, visual flavor, or backstory — those are orthogonal axes (e.g., a P1 doctor may or may not have a named-character story; this is a separate design layer).

The exact P2 / P3 / P4 multiplier values, drop weight distribution per tier, and pity / 保底 mechanics are NOT specified in this capability — they are deferred to `wire-recruitment-gacha` (which SHALL reuse `core/lib/loot.ts` 30/100 保底 with rarity rename: `N/R/SR/SSR/UR → P5/P4/P3/P2/P1`).

#### Scenario: Tier-to-multiplier monotonic

- **GIVEN** any two doctors `dA` (rarity `rA`) and `dB` (rarity `rB`)
- **WHEN** `rA` is rarer than `rB` (e.g., `rA = P1, rB = P3`)
- **THEN** `dA.powerMultiplier >= dB.powerMultiplier` (strict monotonic; no ties between tiers)

### Requirement: Subject affinity SHALL act as binary unlock gate

For each of the 14 subjects, `affinity[subject]` SHALL be a non-negative integer counter incremented by +1 per correct answer to that subject. The counter SHALL gate recruitment access by binary comparison to `threshold[subject]`:

- `affinity[subject] < threshold[subject]` → recruitment for that subject is **blocked**
- `affinity[subject] >= threshold[subject]` → recruitment is **open** with no further weighting based on affinity

The `threshold[subject]` values are NOT specified in this capability — they are deferred to `wire-recruitment-gacha` change after `ingest-medexam2-tw-corpus` reveals per-subject question counts (initial baseline: `5% × subject_question_count`).

#### Scenario: Recruitment blocked under threshold

- **GIVEN** `affinity[皮膚科] = 5` and `threshold[皮膚科] = 30`
- **WHEN** the player attempts to use a recruitment ticket on 皮膚科 banner
- **THEN** the action SHALL be rejected
- **AND** the UI SHALL display `「再答對 25 題皮膚科可解鎖」`
- **AND** the recruitment ticket SHALL NOT be consumed

#### Scenario: Recruitment open at and above threshold

- **GIVEN** `affinity[外科] = 50` and `threshold[外科] = 50`
- **WHEN** the player uses a recruitment ticket on 外科 banner
- **THEN** the recruitment SHALL proceed
- **AND** the resulting doctor's rarity distribution SHALL follow the `recruitment-gacha` weight table (defined separately)
- **AND** further `affinity[外科]` accumulation past 50 SHALL NOT change recruitment outcome distribution (binary gate, not continuous weight)

### Requirement: Visual theme SHALL be GBA pixel forked from theme-pixel-medical

The `theme-pixel-hospital` theme pack SHALL be a fork of `theme-pixel-medical` retaining the GBA-era pixel aesthetic:

- 16-color palette consistent with theme-pixel-medical conventions
- Pixel sprite scale (no smooth interpolation; nearest-neighbor scaling)
- Doctor sprites SHALL be pixel art (not Theme Hospital-style isometric, not anime-style portraits)
- Hospital scenes (診所 / 區域 / 醫學中心) SHALL be pixel-rendered

#### Scenario: Theme pack identity at boot

- **GIVEN** the `apps/medexam2-hospital-tw` app boots
- **THEN** it SHALL render UI components imported from `@study-rpg/theme-pixel-hospital`
- **AND** the rendered visual aesthetic SHALL match GBA pixel (palette / sprite scale)
- **AND** computed CSS image-rendering property on sprite elements SHALL include `pixelated` or `crisp-edges`

### Requirement: Reputation formula and threshold values MUST be deferred to wire-* changes

This capability SHALL NOT lock numeric values for:

- Reputation score formula (how throughput × time accumulates)
- Hospital tier upgrade thresholds
- Room slot counts per tier
- Per-subject affinity thresholds
- Per-rarity drop weight distribution
- Pity / 保底 trigger counts
- P2 / P3 / P4 powerMultiplier values (only P1=5.0 / P5=0.5 endpoints are locked here)

These values SHALL be specified by subsequent changes (`wire-recruitment-gacha`, `wire-hospital-tycoon-engine`, `wire-clinic-level-up`, `wire-hospital-reputation`). The intentional separation prevents premature numeric lock-in without dogfood balance data.

#### Scenario: Deferred values are not specified here

- **GIVEN** any future implementation
- **WHEN** an attempt is made to reference reputation thresholds / drop weights / room counts from this capability spec
- **THEN** the reference SHALL fail (values do not exist in this spec)
- **AND** the implementer SHALL look up the value in the appropriate `wire-*` capability spec

## Out of Scope

The following are explicitly excluded from hospital-management-mode and SHALL NOT be added without a new capability proposal:

- Boss combat (疑難雜症 case 對 boss 拚醫師團隊) — covered by `mini-boss` capability in one階 app only
- Multiplayer / PvP / 醫院對戰 — single-player only (per `project.md` Out of Scope)
- Real-money currency / IAP / paid gacha — strictly behavior-triggered (per `project.md` Out of Scope)
- Dual-mode toggle inside `apps/medexam-tw` (一階 app) — two app shells deliberately separate
- Native iOS / Android — web-only (per `project.md` Out of Scope)
- 醫療以外的 hard-coded content — content lives in `@study-rpg/content-medexam2-tw` content pack, not in engine or theme
