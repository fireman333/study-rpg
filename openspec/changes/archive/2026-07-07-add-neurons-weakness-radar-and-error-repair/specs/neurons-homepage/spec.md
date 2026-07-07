## ADDED Requirements

### Requirement: Expedition settlement SHALL offer a one-time session-repair pass over this session's wrong questions

At expedition settlement (the same recap surface that shows the settlement conduction ledger and completion ritual), the homepage SHALL offer an optional「當場回鍋」session-repair pass. The availability of this pass SHALL depend **only on whether the just-finished session has any wrong questions to repair** (i.e. `buildSessionRepairPool` is non-empty) — it SHALL NOT be gated on `todayRepairs`, the connectome settlement, or any completion metric. In particular, a session in which the player got everything wrong (zero correct → zero today-repairs) SHALL still surface the session-repair entry; `todayRepairs` and connectome ledger data are recap statistics, not the render gate for the pass. This pass SHALL be built by a dedicated pool builder (`buildSessionRepairPool`) that takes **only the questions the player got wrong in the just-finished session** and presents each **at most once** (`maxAttempts: 1`). Answering within the session-repair pass SHALL still record the question result (so `everWrong` and last-result stay truthful) but SHALL apply **no SM-2 schedule change** (`srsEffect: none`). This SHALL be implemented by recording the result **without invoking the SRS scheduler** (i.e. not calling `scheduleSrsForAnswer`): the row's `interval`, `easeFactor`, `nextDueAt`, `attempts`, and `correctCount` SHALL be preserved unchanged — it is an immediate retrieval-after-error correction, not a scheduled review. A question answered correctly in the pass SHALL receive a「當場修復」cosmetic stamp (UI-only; it SHALL NOT add any synced field or schema bump). The pass SHALL be skippable and SHALL NOT block returning to the homepage.

#### Scenario: Session-repair surfaces this session's wrong questions once each

- **GIVEN** the player got 3 questions wrong during the just-finished expedition
- **WHEN** the settlement recap renders
- **THEN** a「當場回鍋」pass SHALL be offered containing exactly those 3 questions, each presented at most once

#### Scenario: Session-repair does not alter the SRS schedule

- **WHEN** the player answers a question inside the session-repair pass
- **THEN** the answer SHALL record the result without invoking `scheduleSrsForAnswer`
- **AND** the question's `interval`, `easeFactor`, `nextDueAt`, `attempts`, and `correctCount` SHALL all be unchanged (`srsEffect: none`)

#### Scenario: Correct repair earns a cosmetic-only stamp

- **WHEN** the player answers a session-repair question correctly
- **THEN** a「當場修復」cosmetic stamp SHALL show for that question
- **AND** no synced field is written and no schema/version bump occurs

#### Scenario: Session-repair is offered even when today-repairs is zero

- **GIVEN** the player got every question wrong in the just-finished session (zero correct, so `todayRepairs` is 0 and no connectome settlement is produced)
- **WHEN** the settlement recap surfaces
- **THEN** the「當場回鍋」session-repair pass SHALL still be offered over that session's wrong questions
- **AND** its availability SHALL NOT be gated on `todayRepairs` or the connectome settlement

#### Scenario: Session-repair is skippable

- **WHEN** the player dismisses the「當場回鍋」pass
- **THEN** the player SHALL return to the homepage with no penalty and no forced re-quiz

### Requirement: Session-repair SHALL be distinct from the DMN quick-review-batch card

The homepage session-repair pass SHALL be clearly distinguished, in behaviour and in UI wording, from the DMN `quick-review-batch` consumable (per `neurons-dmn-fate-cards`). The distinctions are normative: session-repair is **auto-offered at settlement**, sources **only the current session's wrong questions**, is capped at **one attempt per question**, and has **no SRS effect and no DMN-draw-axis credit**; the DMN quick-review-batch is **manually activated from the backpack**, sources from the **historical wrong-question pool**, and its clears **credit the expedition DMN draw axis**. UI copy SHALL use「當場修復 / 當場回鍋」for session-repair and「快速複習」for the DMN card so the two never read as the same feature.

#### Scenario: The two review paths use distinct wording and sources

- **WHEN** both the session-repair pass and the DMN quick-review-batch are available
- **THEN** session-repair SHALL be labelled「當場回鍋 / 當場修復」and source only the current session's wrong questions with no DMN-axis credit
- **AND** the DMN quick-review-batch SHALL be labelled「快速複習」and source the historical wrong-question pool, crediting the DMN draw axis
