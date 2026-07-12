# Tasks — add-neurons-remaining-subject-handouts

> Bulk config-drive build-out of the 8 remaining 一階 subjects on the region-keyed handout engine locked by `add-neurons-histology-handout` + proven by `add-neurons-embryology-handout`. Region blueprints pre-locked in `docs/handout-architectures/<subject>.md`. Engine/UI/types/pipeline unchanged; work = 8 config + 8 html (fact-gated) + 2 code edits (SUBJECT_META lines + subject-scoped pool + verify assertions). Implementation done in a build-all workflow run (2026-07-12) + a main-session recovery of 3 subjects; this change documents + specs it.

## 1. Config + content (all 8 subjects)

- [x] 1.1 Author 8 `<subject>.config.json` from the arch docs — node-verified strict leaf partition (union === canonical, 0 dup/missing/extra). Region counts 生理12/藥理17/病理14/寄生6/微生10/生化13/公衛8/免疫7; 21 `brief` regions total. **DONE.**
- [x] 1.2 `mine.mjs <subject>` per subject → per-region packets (考選部 詳解 原文). **DONE (deterministic, regenerable).**
- [x] 1.3 Draft all 87 region fragments (Sonnet subagents, packet + `_exemplar-region.html` contract + honesty rules). **DONE.**
- [x] 1.4 **Fact-gate every subject (two-pronged, no rubber-stamp)**: Codex adversarial review → packet-grep each finding vs 考選部 原文 (is the drafter claim the official exam answer or embellishment?) + OpenEvidence tiebreak → KEEP 考選部-aligned (+ ⚠️國際教科書 note on divergence) / FIX genuine drafter errors / list ambiguous. **DONE.** 5 subjects (藥理/病理/生化*/公衛/免疫) via the build-all workflow; **3 subjects (生理/微生/寄生) failed the workflow fact-gate on SUBAGENT ENVIRONMENT artifacts (安全分類器 blocked 微生 Bash on botulism/anthrax microbiology keywords; sandbox EPERM blocked 生化 Codex; 生理/寄生 edit-phase interrupted) — NOT content problems — recovered via main-session Agent subagents (full perms + OE + Codex).** Embryology trap avoided every time (寄生 中間宿主=水生植物 / 弓蟲非水媒 / 生化 ~110 考選部-aligned kept, not rubber-stamped to Codex's textbook "fix").
- [x] 1.5 `assemble.mjs <subject>` per subject → `src/handout/<subject>.html`, structure lint green (every `.hdt-region` id matches config; each region `.hdt-intro` + `.hdt-must` + ≥1 `.hdt-tbl`). **DONE (11/11 subjects assemble green).**

## 2. Register + subject-scoped pool (build-handout.ts) + guard (verify-handout.ts)

- [x] 2.1 `build-handout.ts`: 8 `SUBJECT_META[...]` lines (order 3–10, interleaving build-all-registered 藥理/病理/生化/公衛/免疫 with recovered 生理/寄生/微生). Region-keyed quiz-emission path already generic. **DONE.**
- [x] 2.2 `build-handout.ts`: subject-scope the region quiz pool — build a `qSubject` map (qid → home subject) and scope `leafToQids` to own-subject questions before `buildChapterQuizzes`, so 生理↔生化 cross-domain leaves don't leak the other subject's questions (0.6% leak → 0). No-op for the 9 non-overlapping subjects; no `build-region-quizzes.ts` signature change (verify fixtures untouched). **DONE — owner-chosen over accept-cover-semantics; leakage 0/5269 confirmed.**
- [x] 2.3 `verify-handout.ts` built-output check: add the 8 subjects to `REGION_KEYED_SUBJECTS` with exact single-region-entry counts (12/17/14/6/10/13/8/7) + non-empty pools. Existing 組織學/胚胎學/解剖學 assertions + Part-1 synthetic fixtures untouched. **DONE.**

## 3. Build + tests

- [x] 3.1 `build:handout` + `copy-content` → `handout.json` has 11 subjects (解剖4/組織7/胚胎4/生理12/藥理17/病理14/寄生6/微生10/生化13/公衛8/免疫7 章測驗), copied into `public/content/neurons-tw/`. **DONE.**
- [x] 3.2 `verify:handout` PASS (all 11 subjects guarded); typecheck clean (content-neurons-tw + neurons-tw); `neurons-tw test` green. **DONE: verify PASS; typecheck clean; 138 files / 1130 tests green.**
- [x] 3.3 Cross-subject leakage probe: `handout.json` region pools contain 0 foreign-subject questions (was 30/5299 pre-fix). **DONE: 0/5269.**

## 4. Verify + ship (gated)

- [x] 4.1 dev browser e2e (built-in Browser, :5173) — subject picker lists all 11; 生理學 → 12 regions render + 12× 測驗本區 (single-region label) + non-empty 41-Q pool; console 0 errors; F5-on-`/cram/handout` re-renders (SPA route holds). **DONE.**
- [ ] 4.2 archive → commit (`feat(neurons-handout)` + `spec(archive): merge add-neurons-remaining-subject-handouts`) → **merge track-neurons→main (owner-gated = CF Pages deploy)**.
- [ ] 4.3 Post-deploy prod verify: `curl` prod `handout.json` carries all 11 subjects; bundle hash live; `/neurons/cram/handout` prod SPA three-piece (in-app nav + direct-URL + F5); a new subject's 測驗本區 opens a real pool.
- [ ] 4.4 Owner detailed QA: the 21 first-ever `brief` regions render acceptably; 生理 ALPHA-WAVE framing decided.
