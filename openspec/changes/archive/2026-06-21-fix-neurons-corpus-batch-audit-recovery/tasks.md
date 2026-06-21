# Tasks

## 1. Audit (content health check)
- [x] 1.1 Structural scan (deterministic): 0 dup id / 0 invalid answer / 0 missing options / 0 empty stem; 443 empty explanations; 15 vertical-char runs (known); 362 footer remnants (build-stripped).
- [x] 1.2 Content audit (46 per-sitting agents, 4600 Q): 57 subject-mismatch candidates (36 high / 21 medium), 53 explanation mismatches (mis-paired / off-topic / truncated).

## 2. Recover (authoritative source)
- [x] 2.1 Per-sitting recovery (46 agents) from original 陽明 詳解 PDFs: extract each target's 科目 (authoritative subject) + 詳解; 490/510 found, 20 not in PDF.
- [x] 2.2 Cross-check audit subject-guesses vs PDF 科目 → 22 authoritative subject changes (12 audit false-positives correctly rejected; 2 audit-vs-PDF conflicts resolved to PDF).
- [x] 2.3 Build apply-set respecting per-question issue dimension (needSubject → subject only; needExpl → explanation only; never overwrite a good explanation on a subject-only question).
- [x] 2.4 Spot-check recovered explanations (mis-paired replacements + empty fills) — all matched their stems.

## 3. Apply
- [x] 3.1 Byte-safe surgical apply: 22 subject + 476 explanation across 479 objects; other 4121 byte-identical; `answer` unchanged on all (verified 0 answer diffs); corpus re-parses to 4600.
- [x] 3.2 Rebuild content pack + copy-content → regenerate app `questions/subjects/meta.json` (empty explanations 443 → 19).

## 4. Verify
- [x] 4.1 Diff integrity: 22 subject + 476 explanation changed, 4121 untouched, 0 id missing, **0 answer changed**.
- [x] 4.2 `pnpm -r typecheck` clean; 637 vitest green; content build `imported 4600 / skipped 0 / total 4600`.
- [ ] 4.3 `openspec validate fix-neurons-corpus-batch-audit-recovery --strict` passes.
- [ ] 4.4 Owner prod spot-check: a sample recovered explanation renders + a reclassified question (e.g. 108-2 醫一 Q45 子宮壁 → 組織學) appears under the correct family.
