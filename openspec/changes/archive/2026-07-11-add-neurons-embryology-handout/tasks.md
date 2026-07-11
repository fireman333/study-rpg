# Tasks — add-neurons-embryology-handout

> First pure config-drive run of the region-keyed handout pipeline built by `add-neurons-histology-handout`. Engine / UI / types / pipeline scripts / guards are unchanged — bulk is content authoring + config + 2 tiny code edits (SUBJECT_META line + verify assertion). 解剖學 (chapter-keyed) and 組織學 (region-keyed) stay untouched.

## 0. Pre-flight — coverage + region config (do before authoring)

- [x] 0.1 Coverage probe (node): assert every 胚胎學 question (108) has ≥1 leaf tag in `dist/concept-tags.json`, every tag ∈ the 12 canonical `dist/concept-recurrence.json` 胚胎學 leaves, and print `total / covered / unmapped` (No Silent Errors). Expected 0 unmapped (pre-measured at resume) → confirms no catch-all needed; a non-zero count blocks authoring until the region cut absorbs it. **DONE: 108 total / 108 covered / 0 untagged / 0 unmapped / 0 out-of-canonical / 22 multi-tagged (~20%).**
- [x] 0.2 Author `packages/content-neurons-tw/胚胎學.config.json` = ordered `[{ regionId, title, leafIds[], targetDepth }]` per design.md D1 (4 regions, owner-confirmed). Contract (locked by 組織學): `regionId` = `hdt-`-prefix ASCII kebab (= the HTML `.hdt-region` id verbatim, no CJK); `title` = CJK display; `leafIds` = **canonical ids from concept-recurrence.json** (verbatim, per embryology.ts); `targetDepth` all `'full'` → verify (node): every `leafId` exists in recurrence, union of all `leafIds` === the 12 leaves exactly, no leaf shared (strict leaf partition). **DONE: 4 regions (3+2+3+4=12), strict partition PASS, all hdt- ASCII, all `full`.**

## 1. Content-gen pipeline (reuse — no rebuild)

- [x] 1.1 `node scripts/handout-pipeline/mine.mjs 胚胎學`: emit 4 per-region packets `{ regionId, title, targetDepth, leaves[], questions[] (stem/answer/optionExplanations/explanation), breadth-ordered }` → verify: 4 packets written, each non-empty (region 2 = 咽弓+心血管 is the smallest at 2 leaves — confirm still substantial), union may exceed 108 due to multi-tag overlap (expected ~20%). **DONE: 4 packets 16/36/31/43 Q (union 126).**
- [x] 1.2 Dispatch: **gate-A already owner-confirmed (~4 Sonnet + Codex + OE); a one-line heads-up before fan-out**, then **4 Sonnet subagents** (one per region), each fed its packet + the `_exemplar-region.html` template contract (`.hdt-region#<regionId>` > `.hdt-intro` + `.hdt-topic`(`h3`+`.hdt-teach`+`.hdt-must>li>b`+`cite`) + `.hdt-tbl`) + honesty rules (no 命中率/保證 slang; 考選部-primary facts; embryology fact-rigor = histology's) → each returns its region HTML fragment (`<section class="hdt-region" id="<regionId>">`, id === config regionId). **DONE: 4 fragments; assemble lint green.**
- [x] 1.3 `node scripts/handout-pipeline/assemble.mjs 胚胎學`: concat region fragments in config order into `packages/content-neurons-tw/src/handout/胚胎學.html`, then fragment-structure lint: every `.hdt-region` id matches a config regionId (bidirectional), each region contains `.hdt-intro` + `.hdt-must` + ≥1 `.hdt-tbl` → loud-fail on any missing.
- [x] 1.4 Quality gate on the ASSEMBLED draft: Codex adversarial review (21 HIGH findings) → packet(考選部)+OpenEvidence cross-check. **KEY RESULT: ~11 of Codex's 21 were 考選部-official answers that diverge from Langman/Moore (象牙質←中胚層, 食道←中胚層, surfactant←末囊期, 角膜基質←中胚層, 副中腎管←中腎, 原始生殖細胞←內胚層, 闊背肌=軸上肌, 臍動脈血氧最低, 原條13-14天, 神經管18天) → blind-applying Codex would BREAK exam-alignment.** Owner decided (考選部為主 + ⚠️國際教科書小註). Action set: 6 FIX (喉軟骨內部矛盾 / 膀胱三角 per 108-1-Q34 / 動脈導管充氧血 per 108-1-Q35+OE / 肛門膜二次破裂杜撰 / 左頭臂靜脈←左總主靜脈 per OE / foramen cecum位置) + 8 NOTE + drop resolved teratoma FLAG. Applying via Opus corrector → re-Codex re-review as closing gate.

## 2. Register subject (minimal — region-keyed path already generic)

- [x] 2.1 `scripts/build-handout.ts`: add ONE line `SUBJECT_META['胚胎學'] = { order: 2, title: '胚胎學 考前講義' }`. **DONE — one line added; region-keyed path already generic, no build-branch change.** Confirm NO build-branch change is needed (`regionKeyedQuizzesFromConfig` routes on `existsSync(胚胎學.config.json)`, canonical leaves filtered by `subjectId`). If a real engine gap surfaces for a single-blueprint-chapter subject → surface as a design deviation (design.md D2 guardrail), do NOT special-case 胚胎學. Confirm no `.version()` / R2 `SCHEMA_VERSION` / `SYNCED_META_KEYS` / sync touched.
- [x] 2.2 `scripts/verify-handout.ts` Part 2 (built-output check): add a 胚胎學 assertion symmetric to 組織學's — subject present, **4** single-region entries, every entry `memberRegionIds.length === 1`, every entry `sourceQuestionIds.length > 0`. Leave the 組織學 (7-region) + 解剖學 (multi-region alive) assertions and Part 1 (synthetic contract-violation tests) untouched.

## 3. Build + tests

- [x] 3.1 `pnpm --filter @study-rpg/content-neurons-tw build:handout` + `node apps/neurons-tw/scripts/copy-content.mjs` → `handout.json` has 3 subjects (解剖學 4 章測驗, 組織學 7 區測驗, 胚胎學 4 區測驗), copied into `public/content/neurons-tw/`. **DONE: 解剖學(4)/組織學(7)/胚胎學(4).**
- [x] 3.2 `pnpm --filter @study-rpg/content-neurons-tw verify:handout` PASS (all 3 subjects guarded, contract-violation tests still throw); typecheck clean (`content-neurons-tw` + `neurons-tw`); `pnpm --filter @study-rpg/neurons-tw test` green (no regression vs prior count). **DONE: verify:handout PASS; typecheck clean both; 138 files / 1130 tests green.**
- [x] 3.3 `/simplify` on the touched code — N/A/trivial: code surface = 1 SUBJECT_META line + a symmetric verify assertion + 1 `.hdt-intl` CSS rule (mirrors existing patterns) + content. Nothing to simplify.

## 4. Verify + ship (gated)

- [x] 4.1 dev browser e2e (built-in Browser, port 5175) — **ALL GREEN**: subject picker 3 科; 胚胎學 → 4 regions + 4 sidebar items + 4× 測驗本區 + 0 signposts + 8 ⚠️國際教科書 notes (amber-styled, correct placement); 測驗本區 opens non-empty 16-Q pool (Q32 render OK); 組織學 7 區測驗本區/0 signpost (no regress); 解剖學 8 區測驗本章/3 signpost (chapter-keyed alive); 題庫 subtab bar = 3 pills (題庫/考前猜題/考前講義→/cram/handout); SPA 三件套 dev (in-app nav + direct-URL + F5) all render; console 0 errors. (prod SPA 三件套 = task 4.3 post-deploy.)
- [ ] 4.2 archive → commit (`feat(neurons-handout)` + `spec(archive): merge add-neurons-embryology-handout`) → **merge track-neurons→main (owner-gated = CF Pages deploy)**.
- [ ] 4.3 Post-deploy prod verify: `curl` prod `handout.json` carries 胚胎學 entry (4 區測驗); bundle hash live; `/neurons/cram/handout` prod SPA three-piece; 胚胎學 測驗本區 opens a real pool.
