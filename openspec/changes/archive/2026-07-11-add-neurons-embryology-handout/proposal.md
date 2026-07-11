## Why

The region-keyed「考前講義」engine, the reusable config-driven content pipeline (mine / dispatch / assemble / verify), the context-driven CTA label (測驗本區 / 測驗本章), and the coverage/drift guards were all built and locked by `add-neurons-histology-handout` (shipped 2026-07-11). Adding a new subject is now the cheap, repeatable run that buildout was designed for: **one `<subject>.config.json` + one `<subject>.html`, engine unchanged**. 胚胎學 is the next subject (owner sequence 組織 → 胚胎 → 病理 → 藥理) and the smallest — a single blueprint chapter (`embryology-development`), **12 canonical leaves**, **108 questions**, **0 orphan / 0 out-of-canonical**, a clean strict leaf partition (no catch-all region needed), all `targetDepth: 'full'` (12 ≪ the proven 解剖 87-leaf one-week ceiling → no depth-tiering).

## What Changes

- **New `胚胎學.config.json` (4 regions).** An ordered `[{ regionId, title, leafIds[], targetDepth }]` strictly partitioning the 12 canonical embryology leaves into 4 developmental-logic regions (owner-confirmed cut): `hdt-early-dev` 早期發育與三胚層 / `hdt-pharyngeal-cardio` 咽弓與心血管發育 / `hdt-neural-bodywall-msk` 神經・體壁・骨骼肌肉發育 / `hdt-viscera-senses` 內臟與感官系統發育. This drives region boundaries, region→question quiz pools, and per-region length budget — no engine change (the region-keyed build path already reads any `<subjectId>.config.json`).
- **New `src/handout/胚胎學.html` (4 `.hdt-region`s).** Teaching content for all 12 leaves, drafted per-region by Sonnet subagents fed the region packet + the `解剖學.html`/`組織學.html` template contract + honesty rules, then quality-gated by Codex adversarial review + OpenEvidence per-claim verification (考選部-primary; embryology fact-rigor = histology's). Each region contains 導言 + 必背重點 + ≥1 teaching table appropriate to embryology (發育時序 / 構造演變 / 臨床畸形 or 易混 X-vs-Y discriminator).
- **Register the subject.** Add one `SUBJECT_META['胚胎學'] = { order: 2, title: '胚胎學 考前講義' }` line in `build-handout.ts` (drives the subject picker order + title); the region-keyed quiz-emission path is already generic and needs no change.
- **Extend the built-output guard.** `verify-handout.ts`'s built-output check currently asserts 組織學 (7 single-region entries) + 解剖學 (multi-region alive). Add a 胚胎學 assertion (**4** single-region entries, each with a non-empty pool) so the new subject is guarded, not silently unverified.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-anatomy-handout`: the `handout.json` content contract's enumerated minimum extends to also include the `胚胎學` entry; a `胚胎學 region-keyed 教學結構` requirement is added (4 regions, 12 leaves 全寫, teaching-three-part per region). The region-keyed coverage contract (leaf partition / question-cover / no-orphan / no-drift), the CTA/signpost behavior, and the pipeline are already generalized and unchanged — 胚胎學 simply satisfies them.

## Impact

- **Content (new)**: `packages/content-neurons-tw/胚胎學.config.json` (region boundaries = single source of truth); `packages/content-neurons-tw/src/handout/胚胎學.html` (4 `.hdt-region` fragments).
- **Build**: `packages/content-neurons-tw/scripts/build-handout.ts` — **one line** (`SUBJECT_META['胚胎學']`). The `regionKeyedQuizzesFromConfig` / `buildRegionKeyedQuizzes` path is subjectId-parameterized and untouched. `REGION_TO_CHAPTER` (legacy 解剖學) untouched.
- **Verify**: `packages/content-neurons-tw/scripts/verify-handout.ts` — add a 胚胎學 built-output assertion (4 single-region entries + non-empty pools). Existing 組織學 / 解剖學 assertions untouched.
- **Types / UI**: **none** — `HandoutChapterQuiz` shape and `HandoutPage.tsx` (CTA label, subject-agnostic intro, subject picker) already handle any region-keyed subject; 胚胎學 rides them.
- **Dev tooling**: reuse `scripts/handout-pipeline/{mine,assemble}.mjs` (subjectId-parameterized) + `_exemplar-region.html` template contract; no pipeline rebuild.
- **Data sources (read-only)**: `dist/concept-recurrence.json` (canonical leaves + breadth ordering), `dist/concept-tags.json` (leaf→qids inversion), `dist/questions.json` (per-region packets).
- **Zero** Dexie `.version()`, R2 `SCHEMA_VERSION`, `SYNCED_META_KEYS`, sync-engine, or CF Pages asset-dir allowlist change (reuses `content/neurons-tw/`, delivery is committed-HTML → build-handout → handout.json → copy-content, no LLM/network/headless at CI).
- **Out of scope**: 病理 / 藥理 subjects (later config-drive follow-ups); 解剖學 region-keyed retrofit + signpost removal (still deferred); handout×rescue deep-link integration (separately scoped, deferred); renaming the `neurons-anatomy-handout` capability.
