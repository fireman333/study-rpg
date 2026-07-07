## MODIFIED Requirements

### Requirement: Error-cause replay SHALL offer an add-to-quick-review action

The error-cause replay SHALL present a「**置頂下次出征**」CTA that enqueues the just-missed question into a **transient device-local quick-review queue** (in-memory / `localStorage`, NOT a new synced Dexie table and NOT a schema bump). The **full 錯題出征 expedition pool** SHALL draw the enqueued (still-wrong) questions first, so a pinned question surfaces at the front of the player's next daily expedition without requiring any DMN gacha reward. The existing DMN quick-review mini-batch (the ≤5-question review batch granted by the `quick-review-batch` fate-card consumable) SHALL ALSO continue to draw from this queue first. On tap, the CTA SHALL confirm「已置頂，下次錯題出征會優先遇到」(NOT a passive「已加入快速複習」state) so the player does not expect a mini-batch to open immediately. The queue is a convenience buffer, not durable cross-device state.

#### Scenario: Pin-to-next-expedition enqueues the question locally

- **WHEN** the player taps「置頂下次出征」on the error-cause replay
- **THEN** the current question SHALL be added to the transient device-local quick-review queue (no new synced table, no schema bump)
- **AND** the CTA SHALL reflect that the question is now pinned, with confirmed copy「已置頂，下次錯題出征會優先遇到」

#### Scenario: Next full expedition surfaces pinned questions first

- **GIVEN** the player has pinned 2 questions via「置頂下次出征」
- **WHEN** the player next opens the full 錯題出征 expedition
- **THEN** the expedition pool SHALL place the pinned (still-wrong) questions ahead of the other wrong questions

#### Scenario: DMN quick-review mini-batch still drains the queue first

- **GIVEN** the player has pinned questions via「置頂下次出征」
- **WHEN** the player launches a DMN `quick-review-batch` mini-batch
- **THEN** the batch SHALL still include the pinned questions ahead of other candidates
