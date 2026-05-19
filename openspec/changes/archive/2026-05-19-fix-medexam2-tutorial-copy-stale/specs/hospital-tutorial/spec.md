## MODIFIED Requirements

### Requirement: First-time onboarding flow SHALL introduce core mechanics in sequence

The system SHALL run a sequenced first-time tutorial when a new player starts the game (no `gameCounters.singleton` exists yet). The tutorial SHALL gate each step on the player completing a small action, not on time elapsed. Tutorial sequence (in order):

1. **Welcome + concept** — modal explaining「在這裡，念書 = 醫院賺錢 = 升級」 (~1 paragraph)
2. **Starter pull** — guide to recruitment screen with "免費抽 P4+" highlight
3. **First doctor assignment** — guide to **click outpatient room → pick a doctor from `AssignDoctorModal` list**. Body copy SHALL NOT describe drag-and-drop interaction (removed by `redesign-doctor-roster-as-shelf` 2026-05-19, which collapsed scene-overlay sprites into a non-draggable shelf below the scene).
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

#### Scenario: Step 3 body describes click-then-pick UX

- **GIVEN** the player is on tutorial step 3 (`first-assignment`)
- **WHEN** the modal renders
- **THEN** the body SHALL instruct the player to **click** the outpatient room and pick a doctor from the resulting list
- **AND** the body SHALL NOT use the verb 「拖」 (drag) or describe drag-and-drop interaction
- **AND** the body SHALL preserve the existing 「同科別的醫師在對應房間內加成最大」 sub-clause about specialty matching

### Requirement: Contextual hints SHALL appear on first-encounter of each major surface

The system SHALL track per-surface "first-visit" flags (`tutorial.firstVisit.<surface>`). When the player navigates to a major surface for the first time, the system SHALL show a contextual hint card explaining that surface. Surfaces requiring first-visit hints:

| Surface | Hint message focus |
|---|---|
| `/study` | 「session 計時、自動暫停、看診畫面就是你的醫院」 |
| `/training` | 「進修機率 + pity 5 保底 + 失敗不掉等級」 |
| `/hospital` (room management) | 「click room → pick doctor 指派 UX; facility 升級放大 throughput; 房間擴建; 場景下方名牌牆 = assigned doctor shelf; 改名入口在「醫師」tab 卡片右上 ✏️」 |
| `/fate-cards` (when unlocked) | 「reputation 溢出消耗、4 階卡包、pity 3 防連衰」 |
| Event modal (first occurrence) | 「正面事件接受，負面事件選擇付錢或扣聲望」 |

Each hint SHALL be dismissible and SHALL NOT appear again on the same save. A「重新顯示提示」option SHALL exist in settings panel for players who want to re-read all hints.

**Skip-tutorial safety-net sub-clause** (added by `fix-medexam2-tutorial-copy-stale` 2026-05-19): the `/hospital` surface hint body SHALL be self-contained enough that a player who tapped「跳過教學」on onboarding step 1 (which marks all 7 onboarding steps complete and prevents the assignment tutorial step from ever surfacing) can still learn assignment + roster identity + rename entry from this single hint. The hint body SHALL therefore cover, in order: (a) click-room-then-pick assignment, (b) facility upgrade + room extension, (c) doctor sprite shelf identity (場景下方名牌牆 = assigned roster, room-grouped), (d) rename entry pointer (上方「醫師」tab → 卡片右上 ✏️). Cross-reference: `redesign-doctor-roster-as-shelf` (2026-05-19) introduced the shelf; `add-doctor-rename` (2026-05-19) introduced the ✏️ entry.

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

#### Scenario: Hospital hint body is self-contained for skip-tutorial players

- **GIVEN** a player who tapped「跳過教學」on onboarding step 1 (so `tutorial.completedSteps['first-assignment'] = true` was set without the player ever reading the step body)
- **AND** `tutorial.firstVisit.hospital = undefined`
- **WHEN** the player navigates to the hospital scene for the first time
- **THEN** the hint card SHALL display
- **AND** the body SHALL describe click-room-then-pick assignment (so the player knows how to assign a doctor)
- **AND** the body SHALL identify the doctor sprite shelf below the scene as the assigned-doctor roster (so the player connects sprites to their team)
- **AND** the body SHALL point to the「醫師」tab → 卡片右上 ✏️ as the rename entry (so the player can discover the rename feature)
