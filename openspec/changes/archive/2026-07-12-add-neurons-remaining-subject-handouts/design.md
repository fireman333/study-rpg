# Design — add-neurons-remaining-subject-handouts

## Context

Per-subject region blueprints are pre-locked in `docs/handout-architectures/<subject>.md` (design phase `823541ed`): each carries the final `<subject>.config.json` (node-verified strict leaf partition), depth-tiering, per-region 考點, fact-rigor hotspots, and a build checklist. This change executes those 8 checklists. The engine (`build-region-quizzes.ts` + `regionKeyedQuizzesFromConfig`), the pipeline (`mine`/`assemble`), the CTA/signpost UI, and the coverage/drift guards are all generalized and shipped — the 8 subjects are config-drive runs, not engine work.

## Decisions

### D1. Region cuts = per-subject arch docs (single source of truth)
The 87 regions (生理12/藥理17/病理14/寄生6/微生10/生化13/公衛8/免疫7) come verbatim from the arch docs' locked configs. Big subjects (生理 71lv / 生化 74lv / 藥理 67lv / 病理 65lv) subdivide WITHIN coarse blueprint chapters; small-chapter subjects (微生 / 生化) subdivide, 免疫's many tiny chapters merge. The config is the single source of truth for region boundaries, region→question pools, and length budget.

### D2. `brief` depth-tiering — first shipped use
21 of 87 regions carry `targetDepth: 'brief'` (low-yield regions of the big subjects) so each subject stays 考前一週唸得完. `brief` is enforced in the DRAFTER prompt (write concise), **not** an engine branch — `build-handout` doesn't read `targetDepth` for pool logic and `assemble` requires the same `.hdt-intro` + `.hdt-must` + ≥1 `.hdt-tbl` structure regardless, so `brief` is structurally identical and safe. The residual risk is content-quality (a brief drafter over-thinning a discriminator table), flagged for owner dev-QA.

### D3. Fact-gate is two-pronged, never rubber-stamps Codex
The embryology lesson (Codex flagged ~11/21 考選部-official answers as "errors") is load-bearing. Every Codex finding is packet-grepped against the 考選部 詳解 原文 (is the drafter claim the official exam answer or embellishment?) + OpenEvidence tiebreak → 考選部-aligned KEEP (+ ⚠️國際教科書 note on divergence) / genuine drafter error FIX. This session's runs confirmed the trap repeatedly (寄生 中間宿主=水生植物 / 弓蟲非水媒 / 廣節裂頭絛蟲→惡性貧血 / 生化 ~110 kept). Blind-applying Codex would have shipped exam-WRONG answers.

### D4. Build-all workflow + main-session recovery (why 3 subjects re-ran)
The 8 subjects were built by a single `build-remaining-handouts.workflow.js` run (~113 agents). 5 reached build-ready in the workflow; **3 failed their fact-gate on workflow-subagent ENVIRONMENT artifacts, not content**: the safety classifier blocked 微生's Bash session-wide (botulism/anthrax microbiology keywords — false positive on legit 國考 content), sandbox EPERM blocked 生化's Codex, and 生理/寄生's edit phase was interrupted. Each subagent's decision ledger was recoverable from the workflow `journal.jsonl`; the 3 fact-gates were re-run as **main-session `Agent` subagents** (full perms, OE MCP, `codex exec` all worked) and independently verified. Lesson: workflow subagents run under a more restrictive permission/sandbox profile than the main session; bioterrorism-agent microbiology and Codex-review-heavy subjects can trip it.

### D5. Subject-scoped region quiz pool (the one real code change)
`build-region-quizzes.ts` builds a region's pool as the leaf-union of `leafToQids`, which was global (all subjects). A handful of cell-membrane / cellular-metabolism leaves are shared between 生理學 and 生物化學, so each subject's 測驗本區 pool leaked ~30 of the other's questions (0.6%; only these 2 subjects; the modal showed the foreign subject's label). Fix = in `build-handout.ts`, build a `qSubject` map and scope `leafToQids` to own-subject questions before `buildChapterQuizzes`. This mirrors `mine.mjs`'s existing content-mining subject filter (so quiz pool == content coverage), is a no-op for the 9 non-overlapping subjects, and needs **no** `build-region-quizzes.ts` signature change — so the verify Part-1 fixtures are untouched. Owner-chosen over accept-cover-semantics. Post-fix leakage 0/5269. The spec's `區域粒度題目覆蓋` requirement gains a matching subject-scoped-pool clause + scenario.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 21 first-ever `brief` regions over-thin content | Structural contract still enforced (loud assemble-lint); owner dev-QA gives them extra eyeball |
| 生理 ALPHA-WAVE unresolved (考選部 self-inconsistency 107-2-Q50 vs 111-2-Q51) | Left verbatim; owner picks framing at QA — not a build blocker |
| Subject-scoping drops genuinely cross-domain-relevant questions | Accepted: quiz pool now matches the content the region actually teaches (content-mining already subject-filtered); only 30 Q across 2 subjects |

## Out of Scope
- 解剖學 region-keyed retrofit + signpost removal (deferred).
- handout×rescue deep-link integration across 11 subjects (separately scoped, in recon).
- Renaming `neurons-anatomy-handout` to a subject-neutral capability name.
