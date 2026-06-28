## Context

The neurons corpus has 4,600 questions; 4,588 carry an authoritative `explanation` (陽明-reconciled or AI-generated 詳解, per `neurons-corpus-ingestion`). That 詳解 is currently hidden inline (`SHOW_INLINE_EXPLANATION=false`) because its raw prose has PDF-flatten 跑版 and occasional drift. We want a fast, scannable per-option reading aid without re-surfacing the noisy prose. The 詳解 already states why the answer is correct, so producing a per-option 簡答 is **mostly an extractive/condensing task over an authoritative source**, not net-new medical knowledge generation — which shapes every decision below.

The repo already has a precedent for "additive, build-injected explanation enrichment baked from a committed sidecar": `neurons-explanation-figures` and `neurons-explanation-table-images` both merge a `provenance/*.json`-style sidecar into `questions.json` at build, never touching `id`/`answer`/`stem`/`options`/`explanation`. This change reuses that exact shape. The generation engine + QA design was reviewed with Codex (gpt-5.5) on 2026-06-28; the owner locked the engine choice (Haiku single-engine, not agy/Gemini) and the display (reuse the inline slot, render only the per-option list).

## Goals / Non-Goals

**Goals:**
- Per-option 簡答 (one short line per option; correct = why right, wrong = why wrong) for the whole corpus, derived only from each question's own `explanation` + `options` + `answer`.
- A resumable, QA-gated, token-CP-efficient offline generation pipeline that produces trustworthy static content.
- Clean inline display of the per-option list on all three answer surfaces, replacing the hidden flat 詳解.
- Zero per-user-state change (no Dexie/R2).

**Non-Goals:**
- No images/tables/figures in the 簡答 (those remain in `neurons-explanation-*` and the 原始詳解 PDF feature).
- No net-new medical facts beyond what the 詳解 supports (the pipeline is forbidden from inventing rationale).
- No runtime/LLM generation in the app — content is fully baked at build time.
- No change to `explanation` provenance/normalization (`neurons-corpus-ingestion` is untouched).
- Not gating on 100%-perfect coverage: questions whose 簡答 fail QA land in a manual-review bucket and simply show no inline 簡答 (no regression vs. today's hidden state).

## Decisions

### D1. Generation engine = Claude Haiku 4.5 single-engine (NOT agy/Gemini hybrid)
**Choice:** A deterministic Workflow orchestrator fans out Haiku 4.5 agents that return schema-validated JSON, plus a Haiku QA fan-out and a manual-review bucket. agy/Gemini is kept only as an optional dev-time smoke / cost fallback, not in the production pipeline.
**Why:** The task is extractive rationale from an authoritative source; the expensive part is not single-call tokens but **locating, re-running, and auditing the wrong ones**. Haiku gives stable structured output, per-question isolation, deterministic validation, and resumable re-runs. A hybrid (agy bulk draft → Haiku QA) muddies provenance, failure attribution, and schema repair for a precision-per-token gain that does not clearly materialize. Haiku 4.5 batched is itself cheap (~1,150 generate calls for the corpus).
**Alternatives considered:** (a) agy/Gemini bulk + Haiku QA — rejected: orchestration/attribution overhead; (b) pure agy with sample-only QA — rejected: weakest structured-output + isolation, highest drift risk; (c) one big model (Sonnet/Opus) — rejected: unnecessary for an extractive task, worse token-CP.

### D2. Batch 4 questions per generation call; failed batch retries split to 1/call
**Why:** 1/call wastes prompt overhead; 10–20/call enlarges the blast radius of a bad batch and invites cross-question rationale contamination. 4 is the sweet spot for a small-input/small-output extractive task. A batch that fails schema/parse retries as isolated single-question calls.
**Concurrency:** start 8 workers (~32 questions in flight; ~1,150 calls for 4,600), scale to 12–16 only if stable; never exceed 16.

### D3. Prompt contract (hard rules, baked into `promptVersion`)
- Use ONLY `stem`/`options`/`answer`/`explanation`; do not add external knowledge the 詳解 omits.
- Correct option line = why it is correct; each wrong option line = why it is wrong.
- If the 詳解 does not justify a wrong option, output the literal `詳解未明確說明此選項錯因` rather than inventing a reason.
- `disputed` / `acceptedAnswers.length>1` questions MUST NOT assert a single correct answer (frame neutrally / note the dispute).
- Per-option length ~12–60 CJK chars (concise; hard cap enforced by the validator).
The prompt text is versioned as `promptVersion`; bumping it invalidates the cache for affected rows.

### D4. Three-layer QA gate (token-CP-optimal; the generator is cheap, the auditor is targeted)
1. **Deterministic validator — 100%** (pure code, no LLM): every original option key present and exactly equal to the question's `options` keys; correct-option key present; each line 12–60 CJK chars; no markdown/tables/empty strings/references to non-existent options; `answer`/`acceptedAnswers` consistency; `sourceHash` match.
2. **LLM QA (Haiku) — risky subset only (~10–20%)**, batch 8 / concurrency 8, output `{qid, pass, issues[], severity}`, does NOT rewrite. Risky = `disputed`, `acceptedAnswers.length>1`, `explanation`<120 chars, 簡解：sentinel with a short body, hedge words (`可能`/`通常`/`建議`/`臨床上`), too-long/short lines, validator-failed-then-retried, or generator self-flagged.
3. **Random sample QA** — per subject `max(20, ceil(0.05 × subject_count))` + a global 5% sample; if a subject's fail-rate >3% escalate that subject to 30% QA; >8% → full regen / prompt fix for that subject.
- QA fail → single-question regen (max 2 retries) → still-failing rows go to `option-explanations.manual-review.json` (excluded from the shipped sidecar).
**Why not full LLM QA on all 4,600:** not token-justified when the generator is cheap and a deterministic validator already catches structural defects; targeted QA concentrates LLM spend on genuinely risky rows.

### D5. Data shape = committed sidecar → build merge → `Question.optionExplanations` (zero Dexie/R2)
- `packages/content-neurons-tw/provenance/option-explanations.generated.json`: `qid → { sourceHash, model, promptVersion, generatedAt, optionExplanations: { A, B, … }, flags[] }` — only QA-passed rows.
- Companions: `option-explanations.meta.json` (run metadata) + `option-explanations.manual-review.json` (QA-fail bucket).
- `build.ts` merges the sidecar into each baked question as `optionExplanations?: Record<string,string>`; `packages/core/src/types.ts` `Question` gains the optional field. Additive — `id`/`answer`/`stem`/`options`/`explanation` never altered. Mirrors the `explanation-figures` / `table-images` sidecar precedent exactly, so no per-user state, no R2 bundle bump, no Dexie version bump.

### D6. Idempotency / resume via content hash
- Cache key = `sha256({stem, options, answer, acceptedAnswers, disputed, explanationNormalized})`; `explanationNormalized` = trim + normalize newlines + collapse whitespace + keep the 簡解：sentinel.
- Intermediate state in JSONL (`generated.jsonl` / `qa.jsonl`); only QA-passed rows promoted to the committed sidecar.
- Rerun rules: hash unchanged + QA pass → skip; hash changed / missing option key / QA fail / `promptVersion` bump → regenerate. Makes a corpus re-run cheap (deltas only).

### D7. Display = reuse the inline slot, render ONLY the per-option list
- Re-enable the inline explanation slot on all three surfaces, repointed to `optionExplanations`. Render exclusively a per-option list:
  `(A) [簡答]` / `(B) [簡答]` / `(C) [簡答]` / … — no prose/詳解/tables inline.
- The correct option's row is visually marked (the surfaces already display 正解 separately, so this is reinforcement, not the sole answer signal).
- Only render when `optionExplanations` is present; absent → render nothing inline (no regression vs. today). Keep the 「看原始詳解 PDF」 button alongside as the authoritative source.
- Implementation: either extend `Explanation.tsx` with an `optionExplanations`-first branch or add a small dedicated per-option list component the three surfaces import. The flag (`SHOW_INLINE_EXPLANATION` or a new dedicated flag) gates the whole behavior so it can ship dark until content is baked.

## Risks / Trade-offs

- **詳解 drift (詳解 describes a different option / an older version of the question)** → the generator may rationalize a wrong mapping. Mitigation: prompt anchors each line to the option text + answer; deterministic validator enforces key-set equality; risky-subset + sample QA catches mismatches; suspect rows → manual review.
- **Wrong option not addressed by the 詳解** → model may invent a medical reason. Mitigation: hard prompt rule to emit `詳解未明確說明此選項錯因`; hedge-word heuristic routes such rows to LLM QA.
- **`disputed`/送分 questions** → a "single correct answer" framing would be wrong. Mitigation: these are always in the risky subset; prompt forbids single-answer assertion; validator checks `acceptedAnswers` consistency.
- **Batch cross-contamination** → option rationale bleeding across questions in a batch. Mitigation: batch size capped at 4; per-question schema + `qid`/`sourceHash` echo; isolated single-question retry on any anomaly.
- **Length blow-out (Chinese prose easily exceeds the cap)** → unscannable. Mitigation: 12–60 CJK char hard cap in the validator; over-cap → regen.
- **Partial JSON failure across a batch** → never overwrite a whole batch. Mitigation: JSONL append + per-question schema validation; only valid rows promoted.
- **Coverage gap** → some questions never get a 簡答. Mitigation: explicitly acceptable — absent field renders nothing inline; `manual-review.json` is the human worklist; no silent claim of full coverage (log imported/skipped/total per No-Silent-Errors discipline).

## Migration Plan

1. **Pilot (100 questions)** with the locked settings; human-review 20 QA-pass + all QA-fail rows; tune the prompt/length cap/risky heuristics before scaling.
2. **Full run** (corpus); produce the three sidecar JSONs; commit them in the content pack.
3. **Wire build merge + core field**; rebuild `questions.json`; confirm `optionExplanations` present on baked questions (with imported/skipped/total counts logged).
4. **Wire display** behind the flag; verify the per-option list on all three surfaces (dev + prod SPA-route 三件套 where relevant) including a question with no `optionExplanations` (renders nothing).
5. **Ship** via the existing CF Pages content-build pipeline (track-neurons → merge main).
**Rollback:** flip the display flag back off — the baked field is inert without the renderer; the sidecar + core field are additive and safe to leave in place. A bad batch is corrected by re-running deltas (hash/promptVersion), not by reverting the merge.

## Open Questions

- **Component shape**: extend `Explanation.tsx` (an `optionExplanations`-first branch) vs. a new dedicated per-option list component imported by the three surfaces — decide at apply time based on how cleanly the existing prose/table tiers can be bypassed.
- **Correct-row marking style**: reuse the existing 正解 accent (green) vs. a lighter cue — settle during display wiring against the live surfaces.
- **115-1 AI-generated-explanation questions** (`explanationSource: 'ai-generated'`): include in the run (they have an `explanation` to condense) but the QA risky-subset SHOULD always include them — confirm during the pilot.
