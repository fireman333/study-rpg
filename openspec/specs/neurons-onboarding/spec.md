# neurons-onboarding

## Purpose

Defines the neurons-tw new-player onboarding system: two complementary first-run moments that teach the core loop without a heavy text card. (1) A non-blocking interactive guided overlay that observes existing gameplay events and coaches the player from their first answer through to extracting their first neuron (skippable + replayable). (2) A just-in-time expedition-unlock spotlight fired on the player's first wrong answer, teaching the benefit (修復腦圖連線 ＋ DMN 命運卡) at the right moment. All state is device-local `meta` keys — no Dexie schema bump, no cross-device sync, no change to maze/quiz core logic.

## Requirements

### Requirement: Interactive guided first-run overlay SHALL coach the new player to their first neuron by observing existing gameplay events

The app SHALL render a guided tour for first-time players that coaches the core loop as a welcome card followed by step-by-step element spotlights — each step framing the next action's UI element with a one-line 繁中 instruction — and SHALL NOT intercept input, simulate clicks, or block interaction at any step. The step sequence SHALL be at most seven steps: 歡迎卡 → 📖 閱讀此科 → 答題 → 腦圖前進 → 每日儀表板 → 等待抽出 → 🎉 終點慶祝. Steps SHALL advance by observing the existing event surface only (`onAnswerCorrect` / `onAnswerWrong` from `lib/maze/answer-feedback`, `connectome.variantSlotUnlocked` from the connectome `events` bus, `onReadingTimerStateChange` + `getReadingTimerState` from `lib/services/reading-timer`) and/or an explicit 「下一步」 control — the tour SHALL NOT modify walker / energy / gacha / settle logic. `connectome.variantSlotUnlocked` firing at ANY active step SHALL jump the tour to its terminal celebration ("抽出第一隻神經元") and end it, so the player can reach the terminal via answering questions or accruing reading minutes regardless of which step they are on.

#### Scenario: First-time player is coached step by step
- **WHEN** a first-time player (no `neurons:onboarding:guidedComplete` flag) loads the homepage and taps 開始引導 on the welcome card
- **THEN** the tour spotlights the 📖 閱讀此科 entry with a one-line instruction
- **AND** when the player starts a reading session (or taps 下一步) the tour advances to the 答題 step, which auto-advances on the player's first correct answer

#### Scenario: Tour terminates on first neuron extraction from any step
- **WHEN** `connectome.variantSlotUnlocked` fires while the tour is on ANY active step
- **THEN** the tour jumps to the completion celebration ("抽出第一隻神經元") and ends
- **AND** `neurons:onboarding:guidedComplete` is set so the tour does not auto-render again

#### Scenario: Tour advances via reading path
- **WHEN** the player reaches the first node by accruing reading minutes (not answering)
- **THEN** the terminal step still fires on `connectome.variantSlotUnlocked` and the tour completes

### Requirement: A welcome card SHALL open the guided tour with the core loop in plain language

On first run (no `neurons:onboarding:guidedComplete` flag), the tour SHALL open with a dismissible centered welcome card that explains the core loop in at most three short plain-語 lines (📖 閱讀／答題 → 能量 → 神經元在腦圖上前進 → 走到腦區抽出神經元；答錯進錯題出征＝修復連線＋抽 DMN 命運卡). The card SHALL offer 「開始引導」 (proceed to the step-by-step spotlights) and 「跳過」 (set `guidedComplete` and exit). Its backdrop SHALL NOT intercept clicks (pointer-events none) so the player is never trapped — the product's value is frictionless play.

#### Scenario: First-run welcome card
- **WHEN** a first-time player loads the homepage
- **THEN** a centered welcome card renders with the core loop in ≤3 plain-language lines and 開始引導／跳過 controls
- **AND** the page behind it remains clickable (the backdrop does not intercept input)

#### Scenario: Welcome skip exits immediately
- **WHEN** the player taps 跳過 on the welcome card
- **THEN** the tour ends immediately and `neurons:onboarding:guidedComplete` is set

### Requirement: Guided tour spotlight positioning SHALL be layout-agnostic and SHALL degrade gracefully when an anchor is missing

Tour spotlight steps SHALL locate their target element at runtime via `document.querySelector('[data-tutorial="…"]')` (plus the pre-existing `[id^="family-card-"]` fallback for 科目卡) and SHALL compute the spotlight box from `getBoundingClientRect()` — never from hard-coded coordinates or assumptions about page structure. The measurement SHALL re-run on `resize`, on (capture-phase) `scroll`, and on a light re-query cadence so anchors that mount/unmount (e.g. the QuizModal answer options) are picked up. WHEN no anchor for a step resolves (element absent or zero-size), the step SHALL degrade gracefully to a centered instruction card — it SHALL NEVER render a spotlight hole over nothing and SHALL NEVER crash. The dim/hole layers SHALL be `pointer-events: none` so the highlighted element itself stays directly clickable (non-blocking). Spotlight animation SHALL respect `prefers-reduced-motion`.

#### Scenario: Anchor present — element is spotlighted
- **WHEN** a tour step's `data-tutorial` anchor exists in the DOM
- **THEN** a spotlight hole frames the element's runtime bounding rect with the instruction card positioned adjacent
- **AND** the element remains directly clickable through the overlay

#### Scenario: Anchor missing — graceful degrade
- **WHEN** a tour step's anchors all fail to resolve (layout changed, element not rendered)
- **THEN** the step renders as a centered instruction card with no spotlight hole and the tour continues to function (next/skip still work)

#### Scenario: Layout reflow re-measures
- **WHEN** the viewport resizes or the page scrolls while a spotlight step is shown
- **THEN** the spotlight box re-measures from the anchor's current `getBoundingClientRect()` and tracks the element

### Requirement: The guided overlay SHALL be skippable and replayable

The guided tour SHALL present a one-tap skip control at every step (welcome card, every spotlight step, and the terminal wait strip); skipping SHALL set `neurons:onboarding:guidedComplete` and immediately remove the tour. Spotlight steps SHALL additionally offer a 「下一步」 manual advance so a player is never gated on a gameplay event (except the terminal extraction wait, which still offers skip). The HelpMenu SHALL offer a "重看新手引導" entry that re-runs the tour from the welcome card after it has been completed or skipped.

#### Scenario: Player skips the tour
- **WHEN** the player taps the skip control on any step
- **THEN** the tour is removed immediately and `neurons:onboarding:guidedComplete` is set
- **AND** the tour does not auto-render on subsequent loads

#### Scenario: Player replays from HelpMenu
- **WHEN** the player opens HelpMenu and taps "重看新手引導"
- **THEN** the guided tour re-runs from the welcome card

### Requirement: The first-run surface SHALL use plain language and relocate deep neuroscience terms to HelpMenu

The guided overlay's first-surface copy SHALL use plain language (e.g. 「答題讓腦圖長大」「走到腦區就抽出一隻神經元」) and SHALL NOT lead with jargon (growth cone / 白質束 / wire / 突觸 / Hebbian). The deeper neuroscience terminology SHALL live in HelpMenu for players who want the precise mechanism (progressive disclosure).

#### Scenario: Overlay copy avoids jargon
- **WHEN** the guided overlay renders any step
- **THEN** its visible copy uses plain-language phrasing and does not surface growth cone / 白質束 / wire / 突觸 as load-bearing terms
- **AND** the precise neuroscience terms remain available in HelpMenu

### Requirement: A just-in-time expedition-unlock spotlight SHALL teach the expedition benefit on the player's first wrong answer

When a player answers their first question incorrectly, the app SHALL reveal the ⚔️ 錯題出征 entry with a highlight AND surface a one-shot spotlight that teaches the benefit in plain language: 答錯不是壞事 → 它會進錯題出征 → 重新答對＝修復腦圖連線＋抽 DMN 命運卡. The spotlight SHALL target the `[data-tutorial="expedition"]` anchor through the layout-agnostic spotlight engine — framing the actual ⚔️ button when the anchor resolves, degrading to a centered card when it does not. The entry's reveal is derived from the monotonic `questionHistory.everWrong` signal (no separate persisted reveal flag). The spotlight SHALL fire at most once (gated on `neurons:onboarding:expeditionSpotlightSeen`). The benefit copy SHALL NOT be reachable only via the button's hover tooltip.

#### Scenario: First wrong answer reveals expedition + teaches benefit
- **WHEN** the player answers their first question incorrectly (first `emitAnswerWrong`)
- **THEN** the ⚔️ 錯題出征 entry is revealed and the one-shot benefit spotlight frames it via the `[data-tutorial="expedition"]` anchor (or renders centered if the anchor is absent)
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
