# Concept-Tags — Porting Guide for 二階 (medexam2 / study-rpg-2nd)

> Reference for building an equivalent **concept-tag / 考點 label + 押題重現度** system on the 二階 國考 corpus.
> The neurons (一階) implementation shipped 2026-07-06 as OpenSpec change `add-neurons-concept-tags`
> (archived: `openspec/changes/archive/2026-07-06-add-neurons-concept-tags/`). This doc is the map for
> replicating it in the standalone `study-rpg-2nd` repo. **二階 has its OWN corpus (6066 Q / 14 科) →
> build its own vocab + tags; the pipeline shape + scripts here are the template, not drop-in data.**

## What it does (4 stages)

1. **Closed concept vocabulary** (per-subject two-level tree) — coarse chapters from the official
   考選部 命題大綱 + fine leaves mined bottom-up from the actual corpus, textbook-canonical names,
   closed + validated (unknown value raises).
2. **Tagging** — every question tagged 1–3 tested leaf concepts, via a **cheap-model batch script**
   (agy / Gemini flash, $0), NOT a Claude sub-agent fan-out. Deterministic keyword pre-pass + single
   pass, 100% coverage, out-of-vocab rejected.
3. **Recurrence dataset** — per-concept **sitting-breadth** (distinct exam sittings tested, capped at
   the sitting count), recency-gap tiers, 送分/disputed excluded → the defensible 押題 ranking.
4. **UI** — 題庫 concept search (concept name → its questions), clickable 考點 labels on question cards
   → 導 題庫 prefilled search, and a 🐞「概念標籤錯誤」 report option.

## Reference files (in this neurons repo)

| Stage | Files to copy/adapt |
|---|---|
| Vocab | `packages/content-neurons-tw/reference/blueprint-coarse.json` (大綱章節), `reference/concept-mining/*.concepts.json` (mined leaves, source-of-record), `src/concept-vocab/{types,validator,index}.ts` + per-subject trees, `scripts/gen-concept-vocab.ts` (generator), `scripts/verify-concept-vocab.ts` |
| Tagging | `scripts/build-concept-keyword-prepass.ts` (§2.1), `scripts/tag-concepts-batch.mjs` (§2.2 — the agy batch), `scripts/verify-concept-tags.ts` (§3 hard gate), `provenance/concept-tags.model.json` (output shape), `provenance/concept-tags-exceptions.json` |
| Recurrence | `scripts/build-concept-recurrence.ts` (§4 — sitting-breadth, tiers, disputed filter) |
| UI | `apps/neurons-tw/src/lib/concept-tags.ts` (loader + zh label helper), `src/components/QuestionReviewCard.tsx` (label chip render), `src/routes/QuestionBankPage.tsx` (search haystack + `/bank?concept=` prefill), `src/routes/BookmarksPage.tsx` |
| Bug-report | `packages/core/src/lib/bug-report-types.ts` (`concept-tag` target + `concept-tag-error` category), `supabase/migrations/0019_neurons_concept_tag_category.sql` |

## Load-bearing decisions (don't re-litigate — these were panel-vetted)

- **Closed + canonical vocab**: tags may only reference a leaf in the question's own subject tree;
  synonyms pre-map to one canonical id (else recurrence breadth dilutes). Validator raises on unknown.
- **Density-targeted granularity**: per-subject leaf count ≈ subject-question-count ÷ 8–12 (so the
  median tested concept lands in a discriminable breadth band, not saturated at max/max).
- **1–3 tags, tested-not-mentioned**: tag what the stem+**correct answer** tests, not distractor
  mentions. Cross-concept questions keep both. Cap 3.
- **押題 key = sitting-breadth** (distinct sittings tested, dedup within a sitting, cap = sitting count).
  Multi-label does NOT inflate breadth (each concept records the sitting once). question-count is a
  secondary "intensity" field only. Threshold ≥ ~5/N; below = searchable low-yield, not ranked.
- **送分/disputed excluded from breadth** — 二階's signal is in its answer-corrections
  (see memory `medexam2-disputed-grading`: `#` ≠ 全部送分, per-Q ruling in `answer-corrections.json`).
  一階 used `questions.json` `disputed` + `acceptedAnswers.length>1`; **二階 must use its own correction
  source** (the task text originally named the wrong file — verify yours).
- **Tier logic = recency-GAP, not a fixed "last-N-sittings = 0" window.** The first cut used
  「近3=0 → 降溫」 and the agent panel killed it: a 3-sitting empty window has no statistical power
  (a staple like S. aureus tested at the 4th-from-last sitting got mislabeled "cooling"). Use:
  常青必掃 = high breadth AND recently active; 經典但降溫 = high breadth AND genuinely absent ≥6
  sittings; 近年新寵 = genuinely newly-appeared (first appearance recent — honestly this stable exam had ~0).

## Gotchas that bit us (avoid the re-debug)

1. **Content fetch MUST use `import.meta.env.BASE_URL`** — prod base is `/neurons/` (二階 = `/2nd/`).
   A bare `/content/…` fetch hits the SPA `index.html` fallback (200 HTML) → `JSON.parse` throws →
   silent `{}` → labels vanish on prod while dev (base `/`) passes. **And don't swallow the catch —
   `console.warn`.** (memory `neurons-content-fetch-base-url`; cost us a broken deploy.)
2. **Verify RENDER on prod, not just data+route.** "concept-tags.json 200 + /bank 200" ≠ "labels
   render". Do a real-browser (Chrome MCP) prod check that the DOM actually shows the chips.
3. **Tagging = cheap-model batch script, NOT Claude fan-out.** agy Gemini flash, ~30 Q/call, hard call
   budget, single pass + keyword fallback. Claude sub-agent per-question fan-out burns tokens for no gain.
4. **Agent-panel + owner sign-off before shipping the taxonomy.** 2 rounds (Codex structure/closure +
   Fable granularity/pedagogy) caught real tier-logic + mis-tag issues. Cross-model inter-rater on a
   stratified sample (92.6% overlap here) is the quality backstop; low-agreement subject → re-run.

## Cross-repo (二階 consumes @study-rpg/core from npm)

- The bug-report `concept-tag-error` category lives in **core** (`bug-report-types.ts`). For 二階's
  concept-tag report, core must be published with it + 二階's own Supabase migration adds it to its
  `bug_reports` category CHECK. (二階 shares the same sync Worker + Supabase — coordinate the migration.)
- Vocab / tagging / recurrence / UI are content-pack + app specific → 二階 builds its own on its corpus.

## Contact
Ping the 一階/neurons session via session-bus (same-project) or reference this doc path directly.
Full spec + design rationale: `openspec/changes/archive/2026-07-06-add-neurons-concept-tags/`.
