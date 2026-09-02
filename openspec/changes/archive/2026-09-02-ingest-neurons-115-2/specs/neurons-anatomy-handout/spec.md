## ADDED Requirements

### Requirement: 最新梯次的考點 SHALL be reflected in the 考前講義, gated at build time

The 考前講義 is a corpus derivative. When a sitting is ingested, the handout SHALL teach what that sitting asked: for **every question of the most recently ingested sitting**, the handout topic that owns the question's primary tagged concept SHALL carry a `<cite>` naming that sitting. The check SHALL be enforced by `verify:handout` and SHALL fail the verification, not warn, so a corpus that has grown past its 講義 is caught rather than shipped.

The gate SHALL bind the **latest** sitting only. Earlier sittings predate the citation convention unevenly, and a retroactive all-sittings gate would fail on debt the ingest did not create; binding the newest sitting makes the check bite exactly when a new ingest lands.

The gate is a **placement** check, not a correctness one: it proves each newly-tested 考點 has teaching text attached to the right topic. Whether that text is medically correct remains governed by the 事實 grounding 與押題誠實 requirement.

#### Scenario: Every question of the newest sitting is taught somewhere citable

- **WHEN** `verify:handout` runs after the content build
- **THEN** it SHALL resolve the latest `(year, session)` present in `questions.json`
- **AND** for each of that sitting's questions, the handout topic owning its primary tagged leaf SHALL contain a `<cite>` whose value names that sitting (a compound cite such as `104/115-2` SHALL count)
- **AND** the verification SHALL report the checked / uncovered / unmapped counts and exit non-zero if any question is uncovered

#### Scenario: A newly-tested concept with no handout topic fails loudly

- **WHEN** a question of the latest sitting has a primary tagged leaf that no handout topic declares in `data-leaf-ids`
- **THEN** `verify:handout` SHALL report it as unmapped and fail, rather than silently skipping a concept the corpus now tests

#### Scenario: An already-taught concept still has to be cited

- **WHEN** the newest sitting re-tests a concept the handout already teaches
- **THEN** the existing line SHALL be updated to cite that sitting (optionally enriched with the new question's discriminator), so 「already covered」 is recorded in the citation rather than left as an unrecorded reviewer judgement
