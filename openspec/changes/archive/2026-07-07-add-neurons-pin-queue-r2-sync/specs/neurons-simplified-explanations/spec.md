## MODIFIED Requirements

### Requirement: Error-cause replay SHALL offer an add-to-quick-review action

The error-cause replay SHALL present a「**置頂下次出征**」CTA that pins the just-missed question by setting a **durable, cross-device-synced `pinnedAt` timestamp** on that question's `questionFlags` row (per `neurons-quiz-modes`), NOT into a transient device-local queue. Effective pin = `pinnedAt != null`; a question un-pins by setting `pinnedAt = null`. The **full 錯題出征 expedition pool** SHALL draw the pinned (still-wrong) questions first, ordered by `pinnedAt` ascending (FIFO), so a pinned question surfaces at the front of the player's next daily expedition without requiring any DMN gacha reward. The existing DMN quick-review mini-batch (the ≤5-question review batch granted by the `quick-review-batch` fate-card consumable) SHALL ALSO continue to draw from the pinned (still-wrong) set first. On tap, the CTA SHALL confirm「已置頂，下次錯題出征會優先遇到」(NOT a passive「已加入快速複習」state) so the player does not expect a mini-batch to open immediately. Because the pin rides the already-synced `questionFlags` row, a pin made on one device SHALL become visible on the player's other devices after sync (this is durable cross-device state, superseding the prior transient-`localStorage` behavior).

#### Scenario: Pin-to-next-expedition sets a durable synced pin

- **WHEN** the player taps「置頂下次出征」on the error-cause replay
- **THEN** the current question's `questionFlags.pinnedAt` SHALL be set to the current time with a fresh `updatedAt` (no new synced Dexie table, no Dexie `.version()` bump)
- **AND** the CTA SHALL reflect that the question is now pinned, with confirmed copy「已置頂，下次錯題出征會優先遇到」

#### Scenario: Next full expedition surfaces pinned questions first

- **GIVEN** the player has pinned 2 questions via「置頂下次出征」
- **WHEN** the player next opens the full 錯題出征 expedition
- **THEN** the expedition pool SHALL place the pinned (still-wrong) questions ahead of the other wrong questions, ordered by `pinnedAt` ascending

#### Scenario: A pin made on one device leads the expedition on another

- **GIVEN** the player pins a still-wrong question on device A
- **WHEN** device B syncs and opens the full 錯題出征 expedition
- **THEN** the question pinned on device A SHALL lead device B's expedition pool (the pin is durable cross-device via `questionFlags.pinnedAt`)

#### Scenario: DMN quick-review mini-batch still drains the pinned set first

- **GIVEN** the player has pinned questions via「置頂下次出征」
- **WHEN** the player launches a DMN `quick-review-batch` mini-batch
- **THEN** the batch SHALL still include the pinned (still-wrong) questions ahead of other candidates
