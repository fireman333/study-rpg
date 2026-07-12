## Why

The region-keyed「考前講義」engine, the reusable config-driven pipeline (mine / dispatch / assemble / verify), the context-driven CTA label, and the coverage/drift guards were built and locked by `add-neurons-histology-handout` and proven repeatable by `add-neurons-embryology-handout` (both shipped 2026-07-11). The remaining **8 一階 subjects** (生理 / 藥理 / 病理 / 寄生蟲 / 微生物 / 生化 / 公衛 / 免疫) each already have a locked, node-verified region blueprint in `docs/handout-architectures/<subject>.md` (design phase, `823541ed`). This change is the bulk build-out: **8 `<subject>.config.json` + 8 `<subject>.html`, engine essentially unchanged** — bringing the handout to all 11 families.

## What Changes

- **8 new `<subject>.config.json`** (region counts: 生理 12 / 藥理 17 / 病理 14 / 寄生 6 / 微生 10 / 生化 13 / 公衛 8 / 免疫 7). Each is an ordered `[{ regionId, title, leafIds[], targetDepth }]` strictly partitioning that subject's canonical leaves per its arch doc. **21 of the 87 regions carry `targetDepth: 'brief'`** — the first shipped use of the `brief` length-budget signal (the big subjects 生理/藥理/病理/生化 depth-tier low-yield regions so each subject stays 考前一週唸得完).
- **8 new `src/handout/<subject>.html`** — teaching content for all leaves, drafted per-region by Sonnet subagents, then quality-gated by Codex adversarial review + OpenEvidence per-claim verification (考選部-primary; the two-pronged gate that catches Codex flagging 考選部-official answers as "errors").
- **Register the 8 subjects** — 8 `SUBJECT_META[...]` lines in `build-handout.ts` (order 3/4/5/6/7/8/9/10, interleaving the already-registered 藥理/病理/生化/公衛/免疫 from the build-all run with the recovered 生理/寄生/微生).
- **Subject-scope the region quiz pool** — `build-handout.ts` now filters `leafToQids` to each subject's own questions before pool assembly. A handful of cell-membrane / cellular-metabolism leaves are shared between 生理學 and 生物化學; without scoping, each subject's 測驗本區 pool leaked ~30 of the other subject's questions (0.6%; only these 2 subjects). This mirrors the content-mining subject filter, is a no-op for the 9 non-overlapping subjects, and needs no `build-region-quizzes.ts` signature change (so the verify fixtures are untouched).
- **Extend the built-output guard** — `verify-handout.ts` asserts each of the 8 subjects present with its exact single-region-entry count + non-empty pools.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-anatomy-handout`: the `handout.json` content contract's enumerated minimum extends to all 11 subjects; 8 `<科> region-keyed 教學結構` requirements are added (mirroring 組織學/胚胎學); the `區域粒度題目覆蓋` requirement gains a **subject-scoped pool** clause + scenario (cross-domain leaves do not leak the other subject's questions). The region-keyed coverage contract (leaf partition / question-cover / no-orphan / no-drift), the CTA/signpost behavior, and the pipeline are otherwise generalized and unchanged — the 8 subjects simply satisfy them.

## Impact

- **Content (new)**: `packages/content-neurons-tw/{生理學,藥理學,病理學,寄生蟲學,微生物學,生物化學,公共衛生學,免疫學}.config.json` (region boundaries = single source of truth) + `packages/content-neurons-tw/src/handout/<subject>.html` × 8 (region fragments).
- **Build**: `packages/content-neurons-tw/scripts/build-handout.ts` — 8 `SUBJECT_META` lines + a per-subject `leafToQids` subject-scoping wrap around `buildChapterQuizzes`. `regionKeyedQuizzesFromConfig` / `buildRegionKeyedQuizzes` signatures untouched; `REGION_TO_CHAPTER` (legacy 解剖學) untouched.
- **Verify**: `packages/content-neurons-tw/scripts/verify-handout.ts` — 8 subjects added to the `REGION_KEYED_SUBJECTS` built-output assertion list. Existing 組織學 / 胚胎學 / 解剖學 assertions + Part-1 synthetic fixtures untouched.
- **Types / UI**: **none** — `HandoutChapterQuiz` and `HandoutPage.tsx` (CTA label, subject-agnostic intro, subject picker) already handle any region-keyed subject; the `brief` regions ride the same structural contract (`.hdt-intro` + `.hdt-must` + ≥1 `.hdt-tbl`), no branch on `targetDepth`.
- **Dev tooling**: reuse `scripts/handout-pipeline/{mine,assemble}.mjs` + `_exemplar-region.html`; no pipeline rebuild.
- **Data sources (read-only)**: `dist/concept-recurrence.json`, `dist/concept-tags.json`, `dist/questions.json`.
- **Zero** Dexie `.version()`, R2 `SCHEMA_VERSION`, `SYNCED_META_KEYS`, sync-engine, or CF Pages asset-dir allowlist change (reuses `content/neurons-tw/`, committed-HTML → build-handout → handout.json → copy-content, no LLM/network/headless at CI).
- **Out of scope**: 解剖學 region-keyed retrofit + signpost removal (still deferred); handout×rescue deep-link integration (separately scoped, in recon); renaming the `neurons-anatomy-handout` capability to a subject-neutral name.
