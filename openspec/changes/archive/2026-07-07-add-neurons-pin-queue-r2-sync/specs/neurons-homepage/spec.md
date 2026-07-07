## MODIFIED Requirements

### Requirement: The full 錯題出征 expedition SHALL surface and drain pinned quick-review questions

The homepage's full cross-subject 錯題出征 expedition pool SHALL lead with the **synced** pinned **still-wrong** ids (ordered ahead of the remaining wrong-question pool, in `pinnedAt` ascending order), so questions pinned via「置頂下次出征」(per `neurons-simplified-explanations`) surface first in the player's daily expedition. A pin is `questionFlags.pinnedAt != null` (per `neurons-quiz-modes`); the pinned-lead and badge derivation SHALL be reactive (Dexie `liveQuery` over `questionFlags`, joined with the wrong-question set), not a bespoke `localStorage` subscription. When the full expedition closes, the served pinned ids SHALL be dequeued by setting `pinnedAt = null` with a fresh `updatedAt`, so a cleared pin does not re-lead the next expedition; because this rides the per-row LWW `questionFlags` sync, the dequeue SHALL propagate cross-device with no tombstone. The ⚔️ 錯題出征 entry SHALL render a「已置頂 N 題」badge when at least one pinned id is still marked `wrong` (N counts only pinned ids still `wrong`), and SHALL omit the badge when no pinned id is still `wrong`. This behavior is now **durable cross-device** (the pin is synced via `questionFlags.pinnedAt`), superseding the prior transient-`localStorage` behavior; it SHALL NOT add a synced Dexie table or a synced meta key, and SHALL NOT require a Dexie `.version()` bump (`pinnedAt` is non-indexed), but it DOES require an R2 `SCHEMA_VERSION` bump (per `neurons-quiz-modes`). The DMN `quick-review-batch` mini-batch path (its own ≤5-question drain of the same pinned set) is unaffected in behavior.

#### Scenario: Pinned questions lead the full expedition pool

- **GIVEN** the player has pinned 2 still-wrong questions via「置頂下次出征」
- **WHEN** the player opens the full ⚔️ 錯題出征 expedition
- **THEN** the two pinned questions SHALL appear ahead of the other wrong questions in the expedition pool, ordered by `pinnedAt` ascending

#### Scenario: Cleared pins are dequeued after a full expedition and propagate cross-device

- **GIVEN** the player has pinned questions and opens the full expedition
- **WHEN** the player closes the full expedition after it served the pinned questions
- **THEN** the served pinned ids SHALL have `pinnedAt` set to `null` with a fresh `updatedAt` so they do not re-lead the next expedition
- **AND** the null dequeue SHALL propagate to the player's other devices under per-row LWW (no tombstone)

#### Scenario: Expedition entry shows a pinned-count badge

- **GIVEN** 3 pinned ids are still marked `wrong`
- **WHEN** the homepage renders the ⚔️ 錯題出征 entry
- **THEN** the entry SHALL show a「已置頂 3 題」badge

#### Scenario: No badge when nothing is pinned

- **GIVEN** no question is pinned, or all pinned ids are no longer marked `wrong`
- **WHEN** the homepage renders the ⚔️ 錯題出征 entry
- **THEN** no「已置頂」badge SHALL be shown
