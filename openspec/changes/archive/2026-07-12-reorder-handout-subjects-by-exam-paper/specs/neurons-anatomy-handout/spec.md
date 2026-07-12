## ADDED Requirements

### Requirement: 多科講義選擇器依 EXAM_PAPER_ORDER 排序

The multi-subject handout picker SHALL order its subjects by the exam-paper sequence defined in `EXAM_PAPER_ORDER` (the single source of truth also consumed by `FamilyPicker` and `CollectionPage`), rendering 醫學一 subjects before 醫學二 subjects: 醫學一 = 解剖學 → 胚胎學 → 組織學 → 生理學 → 生物化學; 醫學二 = 微生物學 → 免疫學 → 寄生蟲學 → 公共衛生學 → 藥理學 → 病理學. The ordering SHALL be derived at runtime from `EXAM_PAPER_ORDER`, NOT from a separate build-time subject-order constant. Any subject not listed in `EXAM_PAPER_ORDER` SHALL be appended after the ordered subjects (extras fallback), never dropped. The default subject (when no `?subject=` deep-link is present) SHALL be the first subject of this ordering.

#### Scenario: 選擇器依 paper 順序、醫學一先於醫學二

- **WHEN** 講義科目選擇器 render 全 11 科
- **THEN** 順序 SHALL 為 解剖學 → 胚胎學 → 組織學 → 生理學 → 生物化學 → 微生物學 → 免疫學 → 寄生蟲學 → 公共衛生學 → 藥理學 → 病理學（醫學一整組先於醫學二整組）

#### Scenario: 未列於 EXAM_PAPER_ORDER 的科目不遺漏

- **WHEN** 某 subject 存在於 handout.json 但不在 `EXAM_PAPER_ORDER`
- **THEN** 它 SHALL 綴在已排序科目之後呈現，而非被 silently drop
