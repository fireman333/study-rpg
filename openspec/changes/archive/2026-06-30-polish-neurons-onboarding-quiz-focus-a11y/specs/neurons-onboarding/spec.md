## MODIFIED Requirements

### Requirement: Interactive guided first-run overlay SHALL coach the new player to their first neuron by observing existing gameplay events

The app SHALL render a guided tour for first-time players that coaches the core loop as a welcome card followed by step-by-step element spotlights — each step framing the next action's UI element with a one-line 繁中 instruction — and SHALL NOT intercept input, simulate clicks, or block interaction at any step. The step sequence SHALL be at most eight steps: 歡迎卡 → 📖 閱讀此科 → 答題（先框 🆕 新題 入口，開啟答題後框選項） → 腦圖前進 → 🔍 聚焦 → 每日儀表板 → 等待抽出 → 🎉 終點慶祝. Steps SHALL advance by observing the existing event surface only (`onAnswerCorrect` / `onAnswerWrong` from `lib/maze/answer-feedback`, `connectome.variantSlotUnlocked` from the connectome `events` bus, `onReadingTimerStateChange` + `getReadingTimerState` from `lib/services/reading-timer`) and/or an explicit 「下一步」 control — the tour SHALL NOT modify walker / energy / gacha / settle logic. `connectome.variantSlotUnlocked` firing at ANY active step SHALL jump the tour to its terminal celebration ("抽出第一隻神經元") and end it, so the player can reach the terminal via answering questions or accruing reading minutes regardless of which step they are on.

#### Scenario: First-time player is coached step by step
- **WHEN** a first-time player (no `neurons:onboarding:guidedComplete` flag) loads the homepage and taps 開始引導 on the welcome card
- **THEN** the tour spotlights the 📖 閱讀此科 entry with a one-line instruction
- **AND** when the player starts a reading session (or taps 下一步) the tour advances to the 答題 step, which frames the 🆕 新題 entry (the answer-opening control) while the quiz modal is closed and the answer-option grid (`[data-tutorial="quiz-answer"]`) once the modal is open, and auto-advances on the player's first correct answer

#### Scenario: Tour terminates on first neuron extraction from any step
- **WHEN** `connectome.variantSlotUnlocked` fires while the tour is on ANY active step
- **THEN** the tour jumps to the completion celebration ("抽出第一隻神經元") and ends
- **AND** `neurons:onboarding:guidedComplete` is set so the tour does not auto-render again

#### Scenario: Tour advances via reading path
- **WHEN** the player reaches the first node by accruing reading minutes (not answering)
- **THEN** the terminal step still fires on `connectome.variantSlotUnlocked` and the tour completes

### Requirement: A just-in-time expedition-unlock spotlight SHALL teach the expedition benefit on the player's first wrong answer

When a player answers their first question incorrectly, the app SHALL reveal the ⚔️ 錯題出征 entry with a highlight AND surface a one-shot spotlight that teaches the benefit in plain language: 答錯不是壞事 → 它會進錯題出征 → 重新答對＝修復腦圖連線＋抽 DMN 命運卡. The spotlight SHALL target the `[data-tutorial="expedition"]` anchor through the layout-agnostic spotlight engine — framing the actual ⚔️ button when the anchor resolves, degrading to a centered card when it does not. Because the `emitAnswerWrong` event fires before the `questionHistory.everWrong` write that mounts the ⚔️ button, the host SHALL wait (a short bounded retry) for `[data-tutorial="expedition"]` to resolve before rendering the spotlight, so the spotlight frames the button on first paint rather than visibly flashing a centered card and then snapping; if the anchor does not resolve within the bound, the host SHALL fall back to rendering the centered card so the teach is never lost. The entry's reveal is derived from the monotonic `questionHistory.everWrong` signal (no separate persisted reveal flag). The spotlight SHALL fire at most once (gated on `neurons:onboarding:expeditionSpotlightSeen`). The benefit copy SHALL NOT be reachable only via the button's hover tooltip.

#### Scenario: First wrong answer reveals expedition + teaches benefit
- **WHEN** the player answers their first question incorrectly (first `emitAnswerWrong`)
- **THEN** the ⚔️ 錯題出征 entry is revealed and the one-shot benefit spotlight frames it via the `[data-tutorial="expedition"]` anchor (or renders centered if the anchor is absent)
- **AND** `neurons:onboarding:expeditionSpotlightSeen` is set so it does not fire again

#### Scenario: Spotlight frames the button without a centered flash
- **WHEN** the spotlight is triggered on the first wrong answer but the ⚔️ button has not yet mounted (the `everWrong` write that mounts it is still pending)
- **THEN** the spotlight does not render a centered card first and then snap to the button
- **AND** it renders once `[data-tutorial="expedition"]` resolves, or falls back to the centered card only if the anchor never resolves within the bounded wait

#### Scenario: Spotlight does not repeat
- **WHEN** the player answers further questions incorrectly after the spotlight has been seen
- **THEN** the expedition-unlock spotlight does not fire again

### Requirement: Onboarding state SHALL be device-local meta keys with no Dexie schema bump and no cross-device sync

All onboarding state SHALL be stored as device-local `meta` keys (`neurons:onboarding:guidedComplete`, `neurons:onboarding:expeditionSpotlightSeen`) mirroring the existing `homepageOnboardingDismissed` pattern. The ⚔️ expedition entry's one-way reveal is NOT a separate flag — it derives from the monotonic `questionHistory.everWrong` signal already maintained for the wrong-answer list. The legacy `neurons:onboarding:expeditionRevealed` meta key (left behind by an earlier onboarding implementation) is no longer read by any code and SHALL be removed on a best-effort one-time startup pass AND included in the account-reset clear set, so no orphaned onboarding key persists. This change SHALL NOT bump the Dexie schema version, SHALL NOT add to `SYNCED_META_KEYS`, and SHALL NOT alter the R2 bundle schema. The account-reset path SHALL clear the onboarding keys so a reset player re-experiences onboarding.

#### Scenario: No schema or sync impact
- **WHEN** the change ships
- **THEN** the Dexie schema version is unchanged and no new key is added to `SYNCED_META_KEYS`

#### Scenario: Account reset re-arms onboarding
- **WHEN** the player resets account data
- **THEN** `neurons:onboarding:guidedComplete` and `neurons:onboarding:expeditionSpotlightSeen` are cleared
- **AND** the guided overlay renders again on the next homepage load

#### Scenario: Orphaned reveal key is cleaned up
- **WHEN** a save that still contains the legacy `neurons:onboarding:expeditionRevealed` key loads the app
- **THEN** the key is deleted on a best-effort startup pass (failure is swallowed and never blocks boot)
- **AND** no current behavior depends on the key (the ⚔️ reveal continues to derive from `questionHistory.everWrong`)

## ADDED Requirements

### Requirement: The guided tour SHALL teach the per-card 🔍 聚焦 maze-camera control

The guided tour SHALL include one step that teaches the per-family 「🔍 聚焦」 control introduced by the homepage redesign. The 聚焦 button SHALL carry a stable `data-tutorial="maze-focus"` anchor, and the step SHALL frame it (degrading to a centered card when absent) with plain-language copy clarifying that 聚焦 only moves the maze camera to that family and never hides the 科目卡 / never blocks answering. The step SHALL advance by the explicit 「下一步」 control (it is not gated on a gameplay event), and SHALL sit after the 腦圖 step and before the 每日儀表板 step. As with every step, `connectome.variantSlotUnlocked` SHALL still terminate the tour from this step, and the step SHALL remain skippable.

#### Scenario: Focus step teaches the camera-only model
- **WHEN** the tour reaches the 🔍 聚焦 step
- **THEN** the spotlight frames the `[data-tutorial="maze-focus"]` button (or renders centered if absent) with copy stating that 聚焦 moves only the maze camera and keeps the 科目卡 answerable
- **AND** tapping 下一步 advances to the 每日儀表板 step, while 跳過 ends the tour and `variantSlotUnlocked` jumps to the terminal celebration

### Requirement: The guided overlay instruction card SHALL be keyboard- and screen-reader-operable

The guided overlay / spotlight instruction card SHALL expose dialog semantics (`role="dialog"`) on the card, SHALL move initial focus to the card's primary control (開始引導 / 下一步 / 知道了) when a step mounts, and SHALL treat the Escape key as the step's skip action. Focus management SHALL NOT trap focus or block the page — the dim/hole layer SHALL remain `pointer-events: none` so play stays frictionless; the requirement is that keyboard and screen-reader users can reach the controls and dismiss the overlay, not that the rest of the page becomes inert. The existing `aria-live` announcement SHALL be retained.

#### Scenario: Keyboard user can act and dismiss
- **WHEN** a tour step's instruction card mounts
- **THEN** the card is exposed as a dialog and initial focus lands on its primary control
- **AND** pressing Escape skips the tour (same effect as 跳過) and the page behind the card remains interactive throughout (no focus trap)
