## Context

`add-neurons-histology-handout` (archived 2026-07-11) turned the beta 解剖學 handout into a **multi-subject, region-keyed** handout: a subject that ships a `<subject>.config.json` gets one 「測驗本區」quiz per content region, with build-time guards for leaf-partition / question-cover / no-orphan / bidirectional id-drift, and a re-runnable config-driven content pipeline (`scripts/handout-pipeline/{mine,assemble}.mjs`). 組織學 was the forcing function that built all of this. **胚胎學 is the first pure config-drive run of that pipeline** — the engine, UI, types, and guards are unchanged; this change adds one subject's config + HTML, one `SUBJECT_META` line, and one built-output assertion.

Owner locked two decisions at resume (2026-07-11, see `openspec/decisions/2026-07-11-embryology-handout-next.md`): (1) the **4-region cut** (developmental-logic partition of the 12 leaves); (2) **~4 Sonnet** per-region drafters + Codex/OE quality gates (same tier as 組織學). Data was pre-verified clean: 108 questions, 0 untagged, 0 out-of-canonical, 22 multi-tagged (~20% cross-region cover overlap), strict leaf partition, no catch-all needed.

## Goals / Non-Goals

**Goals:**
- 胚胎學 handout as a region-keyed subject with a committed `胚胎學.config.json` (4 regions) + `胚胎學.html` (12 leaves 全寫, 考選部-primary + OE fact-grounded).
- Register 胚胎學 as the 3rd handout subject (`order: 2`) so the subject picker shows 解剖學 / 組織學 / 胚胎學.
- Guard the new subject in `verify-handout.ts` (4 single-region entries, non-empty pools).
- Prove the config contract locked by 組織學 is genuinely reusable — engine diff ≈ 1 line.

**Non-Goals:**
- Any engine / UI / types / pipeline-script change beyond `SUBJECT_META` + the verify assertion (region-keyed path is already generic; if any real engine change is discovered necessary, that is a scope surprise to surface, not silently absorb).
- Depth-tiering (`'brief'`) — 12 leaves 全寫 `'full'`.
- 病理 / 藥理 subjects; 解剖學 retrofit / signpost removal; handout×rescue integration; capability rename.
- Any Dexie / R2 / SYNCED_META_KEYS / sync-engine / CF Pages allowlist change.

## Decisions

### D1 — 4-region cut, strict leaf partition (owner-confirmed)

The 12 canonical leaves (from `src/concept-vocab/embryology.ts`, chapter `embryology-development`) partition into 4 developmental-logic regions. `regionId` = `hdt-`-prefixed ASCII kebab (locked convention = the HTML `.hdt-region` id verbatim); `title` = CJK display. **`leafId`s are the exact canonical ids** — the config MUST use these verbatim; pre-flight verifies each exists and that the union === the 12 leaves with no leaf shared.

| regionId | title | leafIds (canonical, of 12) |
|---|---|---|
| `hdt-early-dev` | 早期發育與三胚層 | gametogenesis-fertilization · early-cleavage-implantation · germ-layers-gastrulation |
| `hdt-pharyngeal-cardio` | 咽弓與心血管發育 | pharyngeal-arches · cardiovascular-development |
| `hdt-neural-bodywall-msk` | 神經・體壁・骨骼肌肉發育 | neural-tube-development · body-wall-diaphragm-development · limb-axial-musculoskeletal-development |
| `hdt-viscera-senses` | 內臟與感官系統發育 | GI-development · respiratory-development · urogenital-development · special-sense-integument-development |

4 regions, **strict leaf partition** of all 12 leaves (3+2+3+4=12). All `targetDepth: 'full'`. Region 2 (咽弓+心血管) intentionally pairs the two highest-yield leaves that are developmentally linked (pharyngeal apparatus → great vessels / aortic arches). *Alternative considered:* a finer 5–6 region cut. Rejected — 12 leaves is small; 4 sittings is the right granularity and matches the owner-confirmed draft.

### D2 — Engine is untouched; only `SUBJECT_META` + a verify assertion

`build-handout.ts` `buildChapterQuizzes` already routes to `regionKeyedQuizzesFromConfig(subjectId, …)` whenever `<subjectId>.config.json` exists (subjectId-parameterized, canonical-leaf set filtered by `subjectId`), so 胚胎學 needs **no build-branch change**. The only edit is registering the subject:

```ts
const SUBJECT_META = {
  解剖學: { order: 0, title: '解剖學 考前講義' },
  組織學: { order: 1, title: '組織學 考前講義' },
  胚胎學: { order: 2, title: '胚胎學 考前講義' },   // added
}
```

`verify-handout.ts` Part 2 (built-output check) hardcodes 組織學 (7 single-region) + 解剖學 (multi-region alive) assertions but does not touch 胚胎學, so a broken 胚胎學 build would pass verify silently. Add a symmetric 胚胎學 assertion: subject present, **4** single-region entries, every entry `memberRegionIds.length === 1`, every entry `sourceQuestionIds.length > 0`. Part 1 (synthetic contract-violation tests) is generic and unchanged.

*Guardrail:* if implementation reveals the region-keyed path is NOT actually generic for a single-chapter subject (e.g. an assumption about multi-chapter recurrence), that is a real engine gap — surface it as a design deviation, do not hard-code 胚胎學 around it.

### D3 — Coverage model reuses the locked contract (no new guard code)

胚胎學 satisfies the already-shipped region-keyed guards: leaf partition (D1), question-cover union pools (22 multi-tagged questions legitimately appear in ≥2 region pools — a cover, not a partition), no-orphan (0 out-of-canonical measured; the loud-fail guard remains the safety net), no empty region, bidirectional id-drift (config regionId ↔ HTML `.hdt-region` id). No catch-all region — 胚胎學 has 0 orphans. These are enforced by the existing `buildRegionKeyedQuizzes` + `verify:handout`; this change writes a config that passes them and re-runs the pre-flight coverage probe to confirm before authoring.

### D4 — Content pipeline: reuse, don't rebuild

`scripts/handout-pipeline/mine.mjs 胚胎學` emits per-region packets (leaves + breadth-ordered questions with stem/answer/optionExplanations/explanation) from the config + `concept-recurrence.json` + `concept-tags.json` + `questions.json`. Dispatch = **4 Sonnet subagents** (one per region, owner-confirmed tier), each fed its packet + `_exemplar-region.html` template contract + honesty rules (no 命中率 / 保證 slang; 考選部-primary). `assemble.mjs 胚胎學` concats fragments in config order into `src/handout/胚胎學.html` + structure-lint (every `.hdt-region` id ↔ config regionId; each region has 導言 / 必背 / ≥1 table). Quality gate on the **assembled** draft = Codex adversarial review + OpenEvidence per-flagged-claim verification (考選部-primary, genuine-error-vs-textbook-defensible) → apply corrections. The CI `build:handout` invariant is unchanged (committed HTML → handout.json, no LLM/network/headless). The real gate-A size quote (4 Sonnet + Codex + OE) is owner-confirmed; a heads-up is given right before the apply-stage fan-out.

## Risks / Trade-offs

- **Sonnet drafts hallucinate embryology facts** (developmental timing, malformation associations, germ-layer derivations are error-prone) → Codex adversarial review + OE per-claim verification gate before commit (考選部-primary); nothing ships un-verified. This is the project's fact-rigor hard rule.
- **Cross-region duplicate testing** → 22/108 (~20%) multi-tagged questions appear in ≥2 region pools. Accepted trade-off (D3, same as 組織學) — pedagogically fine, avoids a per-subject primary-leaf curation table.
- **"Generic engine" assumption wrong** → low risk (組織學 proved the path), but D2's guardrail says surface any real engine gap rather than special-case 胚胎學.
- **Region 2 has only 2 leaves** → both are high-yield and developmentally coupled; pool is non-empty and substantial; the no-empty-region guard passes.

## Migration Plan

Build/content-only; no data migration. Deploy = merge `track-neurons` → `main` (owner-gated, = CF Pages deploy). Post-deploy verify: `curl` prod `handout.json` carries the 胚胎學 entry (4 區測驗) + bundle hash live + `/neurons/cram/handout` SPA route renders + subject picker shows 3 科 + a 胚胎學 測驗本區 opens a non-empty pool. Rollback = revert the merge (no schema/state to unwind).

## Open Questions

- Exact per-region teaching wording / table choices (D1 leaf assignment + region ids are locked) — finalized at content authoring; owner heads-up, not a gate.
- (Resolved) Orphans: measured 0 for 胚胎學 (all 108 tagged, all within the 12 leaves) → no catch-all needed.
- (Resolved) Region cut: owner-confirmed 4 regions at resume.
