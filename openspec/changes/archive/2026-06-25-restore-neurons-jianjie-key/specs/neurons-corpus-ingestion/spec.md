# neurons-corpus-ingestion (delta)

## ADDED Requirements

### Requirement: 陽明-path explanations SHALL retain the 簡解 Key author tips above the 詳解

陽明-path explanations SHALL retain the author's Key section (簡解 / 答題要訣 / 關鍵字) and present it above the 詳解, and the restoration MUST be a targeted by-id merge on the hand-maintained corpus (never a `reconcile_all.py` regen) that MUST NOT alter `id`, `answer`, stem, or options. The reconcile parser historically emitted only the 詳解 section and dropped this Key.

#### Scenario: A question with a source 簡解 shows it above the 詳解

- **WHEN** a 陽明-path question has a non-empty, meaningful Key section in its source markdown
- **THEN** its reconciled `explanation` SHALL begin with `簡解：`, followed by the NFKC-normalized
  Key text, a divider line, then the original 詳解 unchanged

#### Scenario: Restoration is idempotent and non-duplicating

- **WHEN** a question's explanation already begins with the `簡解：` sentinel, or already contains
  the Key text verbatim
- **THEN** the merge SHALL leave it unchanged with no duplicate 簡解

#### Scenario: Degenerate Keys are not restored

- **WHEN** a source Key is empty, pure punctuation or digits, or a placeholder such as
  「見詳解」or「無」
- **THEN** no 簡解 block SHALL be added for that question

#### Scenario: Out-of-scope sittings are left unchanged

- **WHEN** a question belongs to 104/105 (no source Key), 107-1 or 108-2 (no independent Key), or
  115-1 (AI single-section)
- **THEN** its explanation SHALL NOT be modified by 簡解 restoration
