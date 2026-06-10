# neurons-onboarding

## Purpose

Defines the neurons-tw new-player onboarding system: two complementary first-run moments that teach the core loop without a heavy text card. (1) A non-blocking interactive guided overlay that observes existing gameplay events and coaches the player from their first answer through to extracting their first neuron (skippable + replayable). (2) A just-in-time expedition-unlock spotlight fired on the player's first wrong answer, teaching the benefit (修復腦圖連線 ＋ DMN 命運卡) at the right moment. All state is device-local `meta` keys — no Dexie schema bump, no cross-device sync, no change to maze/quiz core logic.

## Requirements

### Requirement: Interactive guided first-run overlay SHALL coach the new player to their first neuron by observing existing gameplay events

The app SHALL render a non-blocking guided onboarding overlay for first-time players that coaches the core loop by SPOTLIGHTING the next action and advancing when the corresponding EXISTING gameplay event fires — it SHALL NOT intercept input, simulate clicks, or block interaction. The overlay SHALL subscribe to the existing event surface only (`emitAnswerCorrect` / `emitAnswerWrong` from `lib/maze/answer-feedback`, `connectome.variantSlotUnlocked` from the connectome `events` bus, `onMazeFocus` from `lib/maze/maze-focus`) and SHALL NOT modify walker / energy / gacha / settle logic. The guided sequence SHALL be at most four steps, terminating when the player extracts their first neuron (`connectome.variantSlotUnlocked`), at which point it SHALL show a completion celebration and end. Because the terminal step is bound to the extraction event, the player SHALL be able to reach it via either answering questions or accruing reading minutes.

#### Scenario: First-time player is coached step by step
- **WHEN** a first-time player (no `neurons:onboarding:guidedComplete` flag) loads the homepage
- **THEN** the guided overlay renders and spotlights the first action (start answering or reading) without blocking interaction
- **AND** when the player answers a question correctly, the overlay advances to spotlight the walker advancing on the maze

#### Scenario: Overlay terminates on first neuron extraction
- **WHEN** the player's accrued energy reaches the first node and `connectome.variantSlotUnlocked` fires
- **THEN** the overlay shows a completion celebration ("抽出第一隻神經元") and ends
- **AND** `neurons:onboarding:guidedComplete` is set so the overlay does not auto-render again

#### Scenario: Overlay advances via reading path
- **WHEN** the player reaches the first node by accruing reading minutes (not answering)
- **THEN** the terminal step still fires on `connectome.variantSlotUnlocked` and the overlay completes

### Requirement: The guided overlay SHALL be skippable and replayable

The guided overlay SHALL present a one-tap skip control at every step; skipping SHALL set `neurons:onboarding:guidedComplete` and immediately remove the overlay. The HelpMenu SHALL offer a "重看新手引導" entry that re-runs the guided overlay (by clearing/re-arming the guided state) so a player can replay it after skipping or completing.

#### Scenario: Player skips the overlay
- **WHEN** the player taps the skip control on any step
- **THEN** the overlay is removed immediately and `neurons:onboarding:guidedComplete` is set
- **AND** the overlay does not auto-render on subsequent loads

#### Scenario: Player replays from HelpMenu
- **WHEN** the player opens HelpMenu and taps "重看新手引導"
- **THEN** the guided overlay re-runs from its first step

### Requirement: The first-run surface SHALL use plain language and relocate deep neuroscience terms to HelpMenu

The guided overlay's first-surface copy SHALL use plain language (e.g. 「答題讓腦圖長大」「走到腦區就抽出一隻神經元」) and SHALL NOT lead with jargon (growth cone / 白質束 / wire / 突觸 / Hebbian). The deeper neuroscience terminology SHALL live in HelpMenu for players who want the precise mechanism (progressive disclosure).

#### Scenario: Overlay copy avoids jargon
- **WHEN** the guided overlay renders any step
- **THEN** its visible copy uses plain-language phrasing and does not surface growth cone / 白質束 / wire / 突觸 as load-bearing terms
- **AND** the precise neuroscience terms remain available in HelpMenu

### Requirement: A just-in-time expedition-unlock spotlight SHALL teach the expedition benefit on the player's first wrong answer

When a player answers their first question incorrectly, the app SHALL reveal the ⚔️ 錯題出征 entry with a highlight AND surface a one-shot spotlight that teaches the benefit in plain language: 答錯不是壞事 → 它會進錯題出征 → 重新答對＝修復腦圖連線＋抽 DMN 命運卡. The entry's reveal is derived from the monotonic `questionHistory.everWrong` signal (no separate persisted reveal flag). The spotlight SHALL fire at most once (gated on `neurons:onboarding:expeditionSpotlightSeen`). The benefit copy SHALL no longer be reachable only via the button's hover tooltip.

#### Scenario: First wrong answer reveals expedition + teaches benefit
- **WHEN** the player answers their first question incorrectly (first `emitAnswerWrong`)
- **THEN** the ⚔️ 錯題出征 entry is revealed with a highlight
- **AND** a one-shot spotlight explains that repairing wrong questions wires the connectome AND earns DMN draws
- **AND** `neurons:onboarding:expeditionSpotlightSeen` is set so it does not fire again

#### Scenario: Spotlight does not repeat
- **WHEN** the player answers further questions incorrectly after the spotlight has been seen
- **THEN** the expedition-unlock spotlight does not fire again

### Requirement: The expedition-unlock spotlight SHALL be suppressed while the guided overlay is active

To avoid two overlays competing, the just-in-time expedition spotlight SHALL be suppressed while the guided overlay is still in progress (`neurons:onboarding:guidedComplete` not set). If the player answers incorrectly during the guided overlay, the expedition entry SHALL still be revealed (one-way), but the benefit spotlight SHALL be deferred until after the guided overlay completes or is skipped.

#### Scenario: Wrong answer during guided overlay defers the spotlight
- **WHEN** the player answers incorrectly while the guided overlay is still active
- **THEN** the ⚔️ 錯題出征 entry is revealed but the benefit spotlight does NOT render yet
- **AND** the benefit spotlight renders once after the guided overlay completes or is skipped (still gated to fire at most once)

### Requirement: Onboarding state SHALL be device-local meta keys with no Dexie schema bump and no cross-device sync

All onboarding state SHALL be stored as device-local `meta` keys (`neurons:onboarding:guidedComplete`, `neurons:onboarding:expeditionSpotlightSeen`) mirroring the existing `homepageOnboardingDismissed` pattern. The ⚔️ expedition entry's one-way reveal is NOT a separate flag — it derives from the monotonic `questionHistory.everWrong` signal already maintained for the wrong-answer list. This change SHALL NOT bump the Dexie schema version, SHALL NOT add to `SYNCED_META_KEYS`, and SHALL NOT alter the R2 bundle schema. The account-reset path SHALL clear these onboarding keys so a reset player re-experiences onboarding.

#### Scenario: No schema or sync impact
- **WHEN** the change ships
- **THEN** the Dexie schema version is unchanged and no new key is added to `SYNCED_META_KEYS`

#### Scenario: Account reset re-arms onboarding
- **WHEN** the player resets account data
- **THEN** `neurons:onboarding:guidedComplete` and `neurons:onboarding:expeditionSpotlightSeen` are cleared
- **AND** the guided overlay renders again on the next homepage load
