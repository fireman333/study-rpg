## ADDED Requirements

### Requirement: The 題庫 search SHALL also match per-question concept tags

The 題庫 keyword search SHALL match any of a question's tested concept tags in addition to its existing text fields, so that searching a concept name surfaces that concept's questions (including cross-concept questions tagged with it). This composes with the existing chip filters.

#### Scenario: Concept-name search surfaces the concept's questions
- **WHEN** the user searches a concept name (e.g. 「皮質脊髓徑」)
- **THEN** the results SHALL include every question tagged with that concept (whether it is the question's sole or one of several tested concepts), combined with any active chip filters

### Requirement: Question cards SHALL display concept labels that act as a search shortcut

Question cards (`QuestionReviewCard` and its usages in 題庫 / 收藏 / 考前猜題 source expansions) SHALL display the question's tested concept(s) as labels. In the standalone 題庫 / 收藏 views, tapping a concept label SHALL navigate to the 題庫 (`/bank`) with that concept pre-filled into the search box (reusing the concept search), NOT toggle a separate filter dimension. In an embedded read-only drill-down (e.g. a question opened inside the 考前猜題 source list), the label MAY be non-interactive to avoid navigating away mid-review.

#### Scenario: Concept label is a search shortcut in the standalone bank
- **WHEN** the user taps a concept label on a question card in 題庫 / 收藏
- **THEN** the app SHALL navigate to `/bank` with that concept pre-filled into the search box, showing that concept's questions

#### Scenario: Label does not disrupt in-place drill-down
- **WHEN** a question is shown inside the 考前猜題 source drill-down
- **THEN** its concept label MAY render as non-interactive so tapping it does not navigate away from the review context
