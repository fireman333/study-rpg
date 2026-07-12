## ADDED Requirements

### Requirement: Connector card label surfaces the 科目

Each unlocked connector card SHALL label both bridged families with their 科目 (subject id), not the
neuron cell-type persona alone, so the player can tell which two subjects the connection bridges. The
label SHALL use the same `科目（cell-type）` form as the per-family sections
(`CollectionPage.familyDisplayLabel`), falling back to the 科目 alone when a subject has no distinct
cell-type. Both the visible pair label and the card's `aria-label` SHALL use this form.

#### Scenario: Connector card shows 科目（cell-type）

- **WHEN** an unlocked connector bridging 藥理學 and 病理學 renders
- **THEN** the card SHALL display `藥理學（VTA Dopaminergic） ⇌ 病理學（Striatal MSN）` (科目 leading), NOT `VTA Dopaminergic ⇌ Striatal MSN`
- **AND** the card's `aria-label` SHALL name both 科目
