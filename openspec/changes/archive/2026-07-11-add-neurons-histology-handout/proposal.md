## Why

The 解剖學「考前講義(beta)」 shipped with a *subject-agnostic* UI but a *chapter-keyed* quiz-anchoring model: it emits one「測驗本章」per official blueprint chapter and, where several authored regions share a chapter, routes the earlier ones to a signpost. That model degenerates for subjects whose blueprint is one chapter — 組織學 has a single blueprint chapter (`cells-tissues-organs`, 25 leaves, 225 questions), so chapter-keying would collapse the whole subject into **one** 測驗鈕. To generalize the handout to the remaining four subjects (組織學 first, then 胚胎/病理/藥理), the quiz must anchor at **content-region** granularity, and the content-gen pipeline (whose authoring scripts were lost) must be rebuilt config-driven so each subsequent subject is a cheap, repeatable run.

## What Changes

- **Region-keyed quiz anchoring (config-driven).** A subject may declare a per-subject **region config** (`<subject>.config.json`: an ordered list of `{ regionId, title, leafIds[], targetDepth }`). When present, the build emits **one quiz entry per content region** (`memberRegionIds = [regionId]`, pool = union of that region's leaves' questions). This is additive: the existing chapter-keyed path (解剖學's `REGION_TO_CHAPTER`) is retained unchanged, so anatomy does not regress.
- **The「測驗本章」control label becomes context-driven** — `測驗本區` when a quiz entry maps to exactly one region (region-keyed subjects), `測驗本章` when it groups multiple regions (legacy chapter-keyed 解剖學). **The signpost mechanism is KEPT** (解剖學 still uses it — its region-keyed retrofit is explicitly out of scope); region-keyed subjects simply never trigger it. Full signpost removal defers to a future 解剖學 retrofit.
- **Coverage invariant (leaf partition, question cover, no orphan).** The region config partitions the subject's leaves (each leaf in exactly one region); each region's quiz pool is the **union** of its leaves' questions, so a multi-leaf question MAY appear in several regions (a cover, not a partition — measured ≈18% of 組織學 questions). The build SHALL fail loudly if any question's EVERY tagged leaf is unmapped (untestable), or any region resolves to 0 leaves/questions, or config↔HTML region ids drift — mirroring the existing loud-on-drift guards. No catch-all region (組織學 has 0 orphans).
- **組織學 teaching content.** A new committed `組織學.html` (套 `解剖學.html` 模板：region = 導言 + 必背重點 + 教學表格/易混 X-vs-Y), 25 leaves 全寫 (well under the 解剖 87-leaf proven ceiling → no filtering). **7 content regions** (Fable's 6 pedagogical buckets with the 器官系統 bucket sub-split + 肌肉/神經 merged to keep each region ≈ one sitting; final cut is the config's single source of truth).
- **Reusable content-gen pipeline.** Rebuild the lost mine/dispatch/assemble/verify scripts as **config-driven, subjectId-parameterized, re-runnable** dev tooling (draft via Sonnet subagents, quality-gated by Codex adversarial review + OpenEvidence per-claim verification). This is dev authoring tooling, not a CI build-time step — the CI build stays "committed HTML → handout.json, no LLM/network/headless" (unchanged invariant).
- **Fact grounding generalized** from anatomy-specific wording to subject-agnostic (考選部 answer primary + OE cross-verify), and `handout.json` 的 beta「只含解剖學」 contract relaxed to ≥2 subjects with the (already-built) subject picker showing when >1.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-anatomy-handout`: quiz-anchoring generalized to support region-keyed entries (per-subject region config, `測驗本區` label, leaf-partition/question-cover invariant); content contract relaxed from beta-only-解剖學 to multi-subject; fact-grounding requirement de-anatomy-specific'd; a 組織學 region-keyed teaching-structure requirement added. (Spec name is legacy — a rename to a subject-agnostic capability is optional future cleanup, out of scope here.)

## Impact

- **Build**: `packages/content-neurons-tw/scripts/build-handout.ts` — add a region-config path to `buildChapterQuizzes` (region-keyed entries + coverage/drift guards); extend `SUBJECT_META` with 組織學; mark `REGION_TO_CHAPTER` `@deprecated` (legacy; new subjects use config). Existing anatomy path untouched.
- **Content**: new `packages/content-neurons-tw/src/handout/組織學.html`; new `packages/content-neurons-tw/組織學.config.json` (region boundaries = single source of truth).
- **Types**: `handout-types.ts` — **no shape change** (`HandoutChapterQuiz.memberRegionIds` already models the single-region case); at most a doc-comment update.
- **UI**: `apps/neurons-tw/src/routes/HandoutPage.tsx` — context-driven CTA label (`測驗本區`/`測驗本章`, L318); signpost render path retained; fix the subject-specific intro-note leak (L308 「依解剖分區」 → subject-agnostic).
- **Dev tooling**: rebuilt config-driven `mine`/`dispatch`/`assemble`/`verify` scripts (re-runnable per subjectId) under `packages/content-neurons-tw/scripts/` (or a `handout-pipeline/` subdir).
- **Data sources (read-only)**: `dist/concept-recurrence.json` (region cut + yield ordering), `dist/concept-tags.json` (region→qids inversion).
- **Zero** Dexie `.version()`, R2 `SCHEMA_VERSION`, `SYNCED_META_KEYS`, or sync-engine change. No CF Pages asset-dir allowlist change (reuses `content/neurons-tw/`).
- **Out of scope**: 解剖學 region-keyed retrofit (+ signpost removal); 胚胎/病理/藥理 subjects (cheap config-drive follow-ups).
