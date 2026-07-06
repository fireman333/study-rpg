## ADDED Requirements

### Requirement: 今日處方箋 SHALL offer a dayComplete-gated 考前收斂 calm view that mirrors positive footprint without any deficit or prediction

When and only when today's prescription is complete (`dayComplete === true`), the homepage prescription card SHALL make available an expandable, passive 考前收斂 calm view from its existing 「考前？」 region (device-local expand state; the pre-existing 考前猜題 link remains reachable). The calm view SHALL be display-only — it MUST NOT contain any call-to-action, button, or navigation control within its calm content. It SHALL surface only positive, already-accumulated signals and MUST NOT display any percentage, denominator (X/Y), remaining/gap count, "not-yet"/"還差"/"剩下" wording, gray placeholder, or any guarantee/prediction language (保證 / 必中 / 100% / 今年一定考 / reverse-guarantee such as 「可放心略過」/「會派上用場」). The only dynamic value interpolated into any calm-view string SHALL be a bare non-negative integer; a denominator MUST be structurally impossible. Before `dayComplete`, the card SHALL behave exactly as today (no calm view, no empty-state placeholder — a zero-footprint user simply never reaches it).

The calm view SHALL show ONLY the content the card does not already surface — one coverage line plus one non-actional closing line, with these fixed literals (only the integer varies). It SHALL NOT restate `completedDayCount` or the NG-0717 buds (which the card already displays), so no second stack of numbers is created:
- 「你已答對過 {M} 個高頻考點的題目。」 where {M} = the number of distinct cram 考點 (push items across all subjects) for which ≥1 `sourceQuestionId` has a `questionHistory` row with `lastResult === 'correct'` (the copy MUST NOT use 覆蓋 / 覆蓋率 / 掌握 nor imply a total).
- (closing line) 「今晚可以停在這裡，讓連結慢慢固化。」

The coverage count SHALL be a live-derived view (no new persisted field, no meta key, no new write path) and its data source (`cram.json`) SHALL be loaded lazily only when the calm view is opened, so the homepage never pays the cram-data cost unless the user expands it. An automated copy guard (unit test over the calm-view copy constants) SHALL fail if any static calm-view copy string contains a banned token (連續 / 掌握 / 覆蓋 / 覆蓋率 / % / 還差 / 剩下 / 還沒讀 / 保證 / 必中 / 今年一定考 / 會派上用場).

#### Scenario: Calm view appears only after dayComplete
- **WHEN** today's prescription is not yet complete (`dayComplete === false`)
- **THEN** the card SHALL render no calm view and no calm-view placeholder, behaving exactly as before

#### Scenario: Calm view content and wording when complete
- **WHEN** today's prescription is complete and the user expands the calm view
- **THEN** it SHALL show exactly 「你已答對過 {M} 個高頻考點的題目。」 and the closing line 「今晚可以停在這裡，讓連結慢慢固化。」, with {M} a bare integer and no denominator, and SHALL NOT restate `completedDayCount` or the NG-0717 buds already shown by the card

#### Scenario: No deficit, no prediction, no CTA
- **WHEN** the calm view is rendered
- **THEN** it MUST NOT contain any percentage, denominator, remaining/gap count, gray placeholder, guarantee/prediction wording, or any button / link / call-to-action within its calm content

#### Scenario: Coverage count is derived, not stored
- **WHEN** {M} (the high-frequency 考點 coverage count) is computed
- **THEN** it SHALL be derived live from `cram.json` push items ∩ `questionHistory` (`lastResult === 'correct'`), introducing no new Dexie schema field, no meta key, and no new answer-time write path

#### Scenario: Copy guard fails on banned calm-view copy
- **WHEN** a static calm-view copy constant is authored to contain a banned token (e.g. 覆蓋率, 還差, 必中)
- **THEN** the automated copy-guard test SHALL fail

#### Scenario: Cram data loads only on expand
- **WHEN** the homepage renders and the calm view has not been expanded
- **THEN** `cram.json` SHALL NOT be fetched (the ~330KB cram dataset loads only after the user opens the calm view)
