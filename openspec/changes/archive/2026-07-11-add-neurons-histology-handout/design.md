## Context

解剖學「考前講義(beta)」 is live at `/cram/handout` with a **subject-agnostic** UI (subject picker, sidebar TOC + scroll-spy, per-grouping 測驗 CTA, one-click PDF, reading progress / deep-link / a11y) but a **chapter-keyed** quiz model (`build-handout.ts` `REGION_TO_CHAPTER`: region→blueprint-chapter, one 測驗本章 per chapter, signpost for shared chapters). 組織學 has a single blueprint chapter (`cells-tissues-organs`, 25 leaves, **225 questions**) → chapter-keying would collapse the whole subject into one 測驗鈕. This change is the first of a four-subject buildout (組織學 → 胚胎 → 病理 → 藥理); 組織學 is chosen first as the forcing function that exposes chapter-keying's failure, so the region-keyed engine change + the reusable config pipeline both get built here and amortize over the next three subjects.

Owner locked three decisions in the 2026-07-10 planning session (see `openspec/decisions/2026-07-10-neurons-subject-handouts-generalization.md`): (1) full forcing-function this session — region-keyed engine change + reusable config pipeline together; (2) accept Fable's 6-bucket region cut; (3) Sonnet draft subagents + Codex/OE quality gates.

Reconnaissance of the actual code shrank the engine surface below the handoff's framing: `HandoutChapterQuiz.memberRegionIds` **already** models the single-region case, and the signpost only renders when `memberRegionIds.length > 1`, so region-keyed needs **no type change and no UI branch removal** — only a build path that emits one entry per region.

## Goals / Non-Goals

**Goals:**
- Region-keyed quiz anchoring for subjects that declare a region config, additive to (not replacing) the anatomy chapter-keyed path.
- A committed `組織學.html` covering all 25 leaves, fact-grounded (考選部-primary + OE), matching the `解剖學.html` template.
- `組織學.config.json` as the single source of truth for region boundaries → content + region→qid + length budget.
- A rebuilt, config-driven, re-runnable content-gen pipeline so 胚胎/病理/藥理 are cheap follow-ups.
- No-orphan coverage guard (leaf-partition + question-cover): every 組織學 question testable.

**Non-Goals:**
- 解剖學 region-keyed retrofit and full signpost-code removal (deferred; anatomy stays chapter-keyed and keeps the live signpost).
- 胚胎 / 病理 / 藥理 content (later config-drive runs).
- Any Dexie / R2 / SYNCED_META_KEYS / sync-engine / CF Pages allowlist change.
- Depth-tiering (only 病理/藥理 might need it; 組織 25 leaves 全寫).
- Renaming the `neurons-anatomy-handout` capability (optional future cleanup).

## Decisions

### D1 — Region-keyed anchoring is an *additive* build path, not a rewrite

`buildChapterQuizzes(subjectId, html, rec, leafToQids)` gains a branch **inserted before** the current `const regionChapters = REGION_TO_CHAPTER[subjectId]` (build-handout.ts:77): **if** a `<subject>.config.json` exists → early-return **region-keyed** entries (one per config region, `memberRegionIds=[regionId]`, `leafIds` straight from config, `sourceQuestionIds = new Set(config.leafIds.flatMap(l => leafToQids.get(l) ?? []))` reusing the already-built global inversion); **else** fall through to the existing chapter-keyed path, unchanged. 解剖學 keeps `REGION_TO_CHAPTER` and does not regress. *Alternative considered:* migrate anatomy to a region config too (unifies the path, lets signpost code die). Rejected for this change — expands scope, needs re-authoring + re-verifying anatomy's quiz pools, explicitly deferred by the handoff. **To stop the dual path ossifying**: annotate `REGION_TO_CHAPTER` `@deprecated — legacy chapter-keyed; new subjects use <subject>.config.json, do not add here`, and track a future `retrofit-anatomy-to-region-config` change (deferred, not opened now).

### D2 — CTA label is derived from `memberRegionIds.length`, signpost retained

`HandoutPage.tsx` currently hardcodes `📝 測驗本章` (L318). Change to `memberRegionIds.length === 1 ? '📝 測驗本區' : '📝 測驗本章'`. The `signpostByRegion` memo and render branch stay live (anatomy still triggers them). This is the minimal, non-breaking realization of the owner's "拿掉 signpost" intent: region-keyed subjects never populate `signpostByRegion` (no shared groups), so no signpost appears for 組織學; the code only truly becomes dead after a future anatomy retrofit. *Alternative:* delete signpost now — rejected, would break anatomy. **Also fix a subject-specific leak**: the intro note (L308) hardcodes 「依**解剖分區**整理高頻重點」, which currently renders for every subject — reword to subject-agnostic (「依各科組織/系統分區」) and grep for other hardcoded 「解剖」 strings.

### D3 — `組織學.config.json` is the single source of truth; 7 regions (not 6)

Fable's 6 buckets (細胞 / 上皮 / 結締 / 肌肉 / 神經 / 器官系統) map onto the 25 leaves unevenly — the 器官系統 bucket alone absorbs ~14 leaves (circulatory / respiratory / skin / lymphoid / digestive×5 / urinary / repro×2 / endocrine / special-senses), far past the "≈ one sitting (~5–15 min)" budget. So 器官系統 sub-splits (消化系統 / 泌尿·生殖·內分泌·感官 / 循環·呼吸·皮膚·淋巴) and the thin 肌肉 (1 leaf) + 神經 (1 leaf) buckets merge — landing **7 regions**. The engine is region-count-agnostic, so this is a pure config/pedagogy call, finalized when the config is authored (owner gets a one-line heads-up, not a gate).

`regionId` = `hdt-`-prefixed ASCII kebab (locked convention; = the HTML `.hdt-region` id verbatim); `title` = CJK display. **`leafId`s below are the CANONICAL ids from `concept-recurrence.json`** — the config MUST use these exact strings (not shorthand), and task 0.1 verifies each exists before authoring:

| regionId | title | leafIds (canonical, of 25) |
|---|---|---|
| `hdt-cell-basics` | 細胞與組織學技術 | cell-biology-organelles-and-cytoskeleton · microscopy-and-tissue-preparation-techniques |
| `hdt-epithelium` | 上皮組織 | epithelial-tissue-classification-and-lining · epithelial-surface-specializations-and-junctions · glandular-epithelium-and-secretion-mechanisms |
| `hdt-connective` | 結締組織（含血液·骨·軟骨） | connective-tissue-proper-fibers-and-fibroblasts · cartilage-histology · bone-histology-and-ossification · blood-cells-and-hematopoiesis |
| `hdt-muscle-neural` | 肌肉與神經組織 | muscle-tissue-comparative-histology · nervous-tissue-neuron-and-glia |
| `hdt-cardio-resp-skin-lymph` | 循環·呼吸·皮膚·淋巴系統 | vascular-histology-arteries-veins-capillaries · respiratory-system-histology · integumentary-system-skin-histology · lymphoid-organs-histology |
| `hdt-digestive` | 消化系統組織學 | digestive-system-oral-cavity-tongue-and-teeth · digestive-system-salivary-glands · digestive-system-esophagus-and-stomach · digestive-system-small-and-large-intestine · digestive-system-liver-gallbladder-and-pancreas |
| `hdt-uro-repro-endo-senses` | 泌尿·生殖·內分泌·感官系統 | urinary-system-histology · male-reproductive-system-histology · female-reproductive-system-histology · endocrine-system-histology · special-senses-eye-and-ear-histology |

7 regions, **strict leaf partition** of all 25 leaves (2+3+4+2+4+5+5=25), each ≈ one sitting. Note this is a leaf partition; at question granularity the pools **overlap** (see D5). All 7 regions use `targetDepth: 'full'` (組織 25 leaves 全寫); the `'brief'` tier is reserved for future 病理/藥理 depth-tiering.

### D4 — Content pipeline: config-driven dev tooling, NOT a CI build step

The lost scripts are rebuilt as re-runnable, subjectId-parameterized dev tooling: `mine` (from config: pull each region's leaves' questions + concept text + breadth ordering from `concept-recurrence.json` / `concept-tags.json`) → `dispatch` (one Sonnet subagent per region, fed the region's config slice + question pool + the `解剖學.html` template contract) → `assemble` (concat region fragments into `組織學.html`) → `verify` (honesty lint + no-orphan coverage + template-structure lint). Quality gate = **Codex adversarial review + OpenEvidence per-claim verification** on the assembled draft (draft cheap, verify strict). The CI `build:handout` invariant is unchanged — it still reads committed HTML → `handout.json` with no LLM / network / headless. *Model tiers (decision #3):* Sonnet drafts, Codex + OE gates. The real gate-A size quote (agent count / wall estimate) is given right before the apply-stage fan-out.

### D5 — Coverage model: leaf-partition, question-cover, no-orphan (NOT a partition)

The pool builder is `union of a region's leaves' questions` via the existing `leafToQids` inversion. `concept-tags.json` is `qid → leafId[]` with **no "primary leaf" field** — an earlier draft invented one; removed. Measured on real data: 組織學 has **225** questions, **53 multi-tagged**, **41 of them span two of the D3 regions** (≈18%; 病理 18.6% / 藥理 13.9% are similar, 胚胎 0%). So a multi-leaf question legitimately lands in **multiple** region pools — this is a **cover, not a partition**, at question granularity. It IS a strict partition at *leaf* granularity (each leaf in exactly one region). Accepting cross-region duplicate testing is the chosen trade-off (Option 1); the alternative — a version-controlled `qid → primaryLeafId` decision table to force disjoint pools — was rejected as overkill (would need per-subject curation of dozens of questions, and a question spanning 消化+腺上皮 belongs in both quizzes anyway).

The region-keyed build branch therefore asserts (mirroring the existing loud-fail guards):
1. **leaf partition**: every canonical leaf assigned to exactly one region (none shared, none unassigned); every config `leafId` exists in `concept-recurrence.json`.
2. **no orphan**: a question whose EVERY tagged leaf is unmapped → loud fail (there is no catch-all region — 組織學 has 0 orphans; if a future subject hits one, the fix is to add that leaf to a region, which is correct anyway).
3. **no empty region**: 0 leaves or 0 questions → loud fail.
4. **bidirectional id drift**: every config `regionId` matches an HTML `.hdt-region` id, and every quiz-bearing HTML region has a config entry (overview/non-quiz regions listed exempt) → else loud fail. Both directions covered by unit tests.

## Risks / Trade-offs

- **`concept-tags.json` coverage** → measured: all **225** 組織學 questions are tagged (0 untagged), every tag within the 25 canonical leaves, so 組織學 needs **no catch-all region**. The no-orphan guard stays as a build-time safety net (loud fail) for future subjects. Mitigation: task 0.1 re-runs this coverage check before authoring.
- **Cross-region duplicate testing** → 41/225 (≈18%) questions appear in two region pools (multi-leaf). Accepted trade-off (D5) — pedagogically fine, avoids a per-subject primary-leaf curation table.
- **Sonnet drafts hallucinate histology facts** → Codex adversarial review + OE per-claim verification gate before commit (考選部-primary); nothing ships un-verified. Trade-off: slower than blind-generate, but the project's fact-rigor rule mandates it.
- **Region cut ≠ Fable's 6 (it's 7)** → engine is count-agnostic so no code impact; only a pedagogy judgment (器官系統 split, 肌肉+神經 merged). Owner gets a heads-up at config authoring.
- **Scope creep into anatomy retrofit** → explicitly fenced out; signpost stays, anatomy path untouched, so anatomy cannot regress.
- **Pipeline over-engineering for one short subject** → justified by amortization over 3 more subjects (owner decision #1/#5); the config format is small and reviewable.

## Migration Plan

Build/content-only; no data migration. Deploy = merge `track-neurons` → `main` (owner-gated, = CF Pages deploy). Post-deploy verify: `curl` `handout.json` carries the 組織學 entry + bundle hash + SPA route `/cram/handout` renders + histology subject picker + a 測驗本區 opens a non-empty pool. Rollback = revert the merge (no schema/state to unwind).

## Open Questions

- Exact per-region titles / wording of the 7-region cut (D3 leaf assignment is locked to canonical ids) — finalized at config authoring; owner heads-up, not a gate.
- (Resolved) Orphan questions: measured 0 for 組織學 (all 225 tagged, all within the 25 leaves) → no catch-all needed.
