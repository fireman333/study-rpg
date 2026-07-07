## ADDED Requirements

### Requirement: The full 錯題出征 expedition SHALL surface and drain pinned quick-review questions

The homepage's full cross-subject 錯題出征 expedition pool SHALL lead with the transient device-local quick-review queue's **still-wrong** ids (ordered ahead of the remaining wrong-question pool), so questions pinned via「置頂下次出征」(per `neurons-simplified-explanations`) surface first in the player's daily expedition. When the full expedition closes, the served pinned ids SHALL be dequeued so a cleared pin does not re-lead the next expedition. The ⚔️ 錯題出征 entry SHALL render a「已置頂 N 題」badge when the queue holds at least one still-wrong id (N counts only ids still marked `wrong`), and SHALL omit the badge when the queue holds no still-wrong id. This behavior is device-local only (the queue is transient `localStorage`); it SHALL NOT add a synced Dexie table, a schema bump, or a synced meta key. The DMN `quick-review-batch` mini-batch path (its own ≤5-question drain of the same queue) is unaffected.

#### Scenario: Pinned questions lead the full expedition pool

- **GIVEN** the player has pinned 2 still-wrong questions via「置頂下次出征」
- **WHEN** the player opens the full ⚔️ 錯題出征 expedition
- **THEN** the two pinned questions SHALL appear ahead of the other wrong questions in the expedition pool

#### Scenario: Cleared pins are dequeued after a full expedition

- **GIVEN** the player has pinned questions and opens the full expedition
- **WHEN** the player closes the full expedition after it served the pinned questions
- **THEN** the served pinned ids SHALL be removed from the queue so they do not re-lead the next expedition

#### Scenario: Expedition entry shows a pinned-count badge

- **GIVEN** the quick-review queue holds 3 ids that are still marked `wrong`
- **WHEN** the homepage renders the ⚔️ 錯題出征 entry
- **THEN** the entry SHALL show a「已置頂 3 題」badge

#### Scenario: No badge when nothing is pinned

- **GIVEN** the quick-review queue is empty, or all pinned ids are no longer marked `wrong`
- **WHEN** the homepage renders the ⚔️ 錯題出征 entry
- **THEN** no「已置頂」badge SHALL be shown
