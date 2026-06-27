## ADDED Requirements

### Requirement: Cross-booklet mis-files and confirmed-absent explanations are handled correctly
When 陽明's volunteer 詳解 booklets mis-file a question's explanation — either printing it in the SIBLING booklet of the same exam (e.g. a 醫學一 question's 詳解 typeset inside the 醫學(二) PDF, and vice-versa) or omitting it entirely — the provenance map SHALL reflect the verified reality rather than a 題號-anchored guess. A verified-override entry MAY therefore name a `file` that differs from the question's own nominal booklet, and a question for which verification proves no 詳解 exists in any of its exam's booklets SHALL be left unmapped (its provenance action hidden) rather than retained at an incorrect page.

#### Scenario: Override relocates a question to the sibling booklet
- **WHEN** a question's 詳解 is confirmed (by reading the rendered card and by a verbatim stem-run found in the sibling booklet's text) to be printed in the OTHER booklet of the same exam sitting than the one its base-map entry assumed
- **THEN** its `provenance/verified-overrides.json` entry records that sibling booklet's filename and page, and the builder maps the question to it (winning over all other sources)
- **AND** the entry's `file` is allowed to differ from the question's nominal 醫學一/醫學二 booklet

#### Scenario: Confirmed-absent explanation is removed, not left wrong
- **WHEN** an end-to-end verification confirms that no 詳解 for a question exists on any page of any of its exam sitting's booklets (the 陽明 volunteers never wrote it), while the base map currently maps it to an incorrect page
- **THEN** that entry is removed from `provenance/question-page-map.json` so the question becomes unmapped and its provenance action is hidden
- **AND** the map is NEVER left pointing a confirmed-absent question at a wrong page
