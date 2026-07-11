# Tasks — add-neurons-histology-handout

> Forcing-function change: region-keyed engine path + reusable config pipeline + 組織學 content, all this session. 解剖學 stays chapter-keyed (untouched). Engine surface is small (no type change, signpost retained); bulk is content authoring + config + pipeline scripts. **This is the template for 胚胎/病理/藥理 — lock the config contract here.**

## 0. Pre-flight — coverage + region config (do before authoring)

- [x] 0.1 Coverage probe (node): assert every 組織學 question (225) has ≥1 leaf tag in `dist/concept-tags.json`, every tag ∈ the 25 canonical `dist/concept-recurrence.json` 組織學 leaves, and print `total / covered / unmapped` (No Silent Errors). Expected 0 unmapped (pre-measured) → confirms no catch-all needed; a non-zero count blocks authoring until the region cut absorbs it.
- [x] 0.2 Author `packages/content-neurons-tw/組織學.config.json` = ordered `[{ regionId, title, leafIds[], targetDepth }]` per design.md D3 (7 regions). **Contract (locked for all subjects):** `regionId` = `hdt-`-prefix ASCII kebab (= the HTML `.hdt-region` id verbatim, no CJK); `title` = CJK display; `leafIds` = **canonical ids from concept-recurrence.json** (not shorthand); `targetDepth` ∈ `'full'|'brief'` (組織學 all `'full'`) → verify (node): every `leafId` exists in recurrence, union of all `leafIds` === the 25 leaves exactly, no leaf shared (strict leaf partition).

## 1. Content-gen pipeline (rebuild, config-driven, re-runnable)

- [x] 1.1 `handout-pipeline/mine.mjs <subjectId>`: from the region config + `concept-recurrence.json` + `concept-tags.json` + `questions.json`, emit per-region packets `{ regionId, title, targetDepth, leaves[], questions[] (stem/answer/optionExplanations/explanation), breadth-ordered }` → verify: 7 packets written, each non-empty, question counts consistent with the subject total (union may exceed 225 due to multi-tag overlap — expected).
- [x] 1.2 `handout-pipeline/dispatch` (or inline orchestration): **gate-A size quote to owner first** (agent count / model tier / wall est), then one Sonnet subagent per region — fed its packet + the `解剖學.html` template contract (`.hdt-region#<regionId>` > `.hdt-intro` + `.hdt-topic`(`h3`+`.hdt-teach`+`.hdt-must>li>b`+`cite`) + `.hdt-tbl`) + honesty rules (no 命中率/保證 slang; 考選部-primary facts) → each returns its region HTML fragment (`<section class="hdt-region" id="<regionId>">`, id === config regionId).
- [x] 1.3 `handout-pipeline/assemble.mjs <subjectId>`: concat region fragments in config order into `packages/content-neurons-tw/src/handout/組織學.html`, then **fragment-structure lint**: every `.hdt-region` id matches a config regionId (bidirectional), and each region contains `.hdt-intro` + `.hdt-must` + ≥1 `.hdt-tbl` → loud-fail on any missing (catches a subagent that dropped a section).
- [x] 1.4 Quality gate on the ASSEMBLED draft: Codex adversarial review (fact + template-structure) → OpenEvidence per-flagged-claim verification (考選部-primary, genuine-error-vs-textbook-defensible) → apply corrections. Nothing ships un-verified (project fact-rigor hard rule).

## 2. Build engine — region-keyed path (additive)

- [x] 2.1 `scripts/build-handout.ts`: add `SUBJECT_META['組織學'] = { order: 1, title: '組織學 考前講義' }`.
- [x] 2.2 `scripts/build-handout.ts` `buildChapterQuizzes`: insert a region-config branch **before** `const regionChapters = REGION_TO_CHAPTER[subjectId]` (build-handout.ts:77) — if `<subject>.config.json` exists, early-return one `HandoutChapterQuiz` per region (`regionId`, `label: config.title`, `memberRegionIds:[regionId]`, `leafIds` from config, `sourceQuestionIds = [...new Set(config.leafIds.flatMap(l => leafToQids.get(l) ?? []))]`); else fall through to the existing path. Mark `REGION_TO_CHAPTER` `@deprecated — legacy chapter-keyed; new subjects use <subject>.config.json` → verify: 組織學 emits 7 single-region entries; **解剖學's `解剖學` subject entry deep-equals its prior `html` + `chapterQuizzes`** (compare the subject object, NOT the whole file — `builtAt`/subjects-count change every build).
- [x] 2.3 Region-config branch guards (loud fail, mirroring existing chapterId/0-leaves guards): (a) every config `leafId` ∈ recurrence leaves; (b) leaf partition (no leaf shared / unassigned); (c) no-orphan — any question whose EVERY tagged leaf is unmapped → fail (no catch-all); (d) 0-leaf / 0-question region → fail; (e) bidirectional id drift — every config regionId has an HTML `.hdt-region`, every quiz-bearing HTML region has a config entry (overview exempt) → verify: temporarily corrupt config (drop a leaf / rename a regionId) → build fails naming the offender; restore.
- [x] 2.4 `handout-types.ts`: doc-comment only — note `memberRegionIds.length === 1` = region-keyed (no shape change). Confirm no `.version()` / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` touched.

## 3. UI — context-driven CTA label + subject-agnostic intro

- [x] 3.1 `apps/neurons-tw/src/routes/HandoutPage.tsx`: (a) CTA label `memberRegionIds.length === 1 ? '📝 測驗本區' : '📝 測驗本章'` (currently hardcoded 測驗本章 at L318); (b) reword the intro note (L308) 「依解剖分區整理高頻重點」 → subject-agnostic (e.g. 「依各科組織/系統分區整理高頻重點」), and `grep` HandoutPage.tsx for other hardcoded 「解剖」 strings. Leave `signpostByRegion` memo + render branch + `.hdt-quiz-signpost` CSS intact (解剖學 still uses them) → verify: 組織學 shows 測驗本區 + zero signposts + no 「解剖」 wording; 解剖學 still shows 測驗本章 + signposts.

## 4. Build + tests

- [x] 4.1 `pnpm --filter @study-rpg/content-neurons-tw build:handout` + `node apps/neurons-tw/scripts/copy-content.mjs` → `handout.json` has 2 subjects (解剖學 4 章測驗, 組織學 7 區測驗), copied into `public/content/neurons-tw/`.
- [x] 4.2 Typecheck clean (`content-neurons-tw` + `neurons-tw`); pure guard logic extracted to `src/handout/build-region-quizzes.ts`; **`verify:handout` script** (content-pack `verify-*.ts` idiom — pack has no vitest) exercises the region-keyed branch: happy path (7 single-region entries + cover-overlap) + all 7 contract violations throw + built-output check (組織學 region-keyed, 解剖學 multi-region alive). `pnpm verify:handout` PASS; `pnpm --filter @study-rpg/neurons-tw test` green (1130, no regression).
- [x] 4.3 `/simplify` on the touched code (build-handout branch + HandoutPage label/intro + pipeline scripts).

## 5. Verify + ship (gated)

- [x] 5.1 `/opsx:verify` (3-dim) then `/verify` — Chrome MCP dev smoke on `/cram/handout`: subject picker shows 2 科; switch to 組織學 → sidebar lists 7 regions, scroll-spy tracks, intro note is subject-agnostic (no 「解剖」), each region ends in 「測驗本區」 (no signpost), opening one launches QuizModal over a non-empty pool; PDF print + a11y unaffected; 解剖學 still 測驗本章 + signposts. SPA three-piece (in-app nav + direct URL + F5) on `/cram/handout`.
- [ ] 5.2 archive → commit → **merge track-neurons→main (owner-gated = CF Pages deploy)**.
- [ ] 5.3 Post-deploy prod verify: `curl` prod `handout.json` carries 組織學 entry (7 區測驗); bundle hash live; `/neurons/cram/handout` prod SPA three-piece; 組織學 測驗本區 opens a real pool.
