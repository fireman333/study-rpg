# 2026-05-20 — Stage 3 explanation-quality batch abandoned

> Captures the lifecycle and termination of `fix-medexam2-haiku-inversion-stage3` (proposed + designed + spec'd + tasked, but **never applied**). Moved here from `openspec/changes/` since no implementation will follow.

## Origin

After `fix-medexam2-explanation-quality-batch-2026-05-19` (archived 2026-05-20 as commit `8239d34`) reduced inversion count 480 → 77, this Stage 3 change proposed finishing the cleanup:
1. Merge 27 already-staged AI Overview scraper files (free wins)
2. Gemini batch retry remaining ~55 via `gemini-2.5-flash`
3. Land polarity-aware inversion counter in `build.ts` as report-only build-time check

## What actually happened this session

### Discovery: detector convention bug

While preparing the batch, a polarity-aware re-measurement (Convention B logic: negative-polarity stems → answer marked ✗) reported **1805 inversions** across the corpus — vastly more than the expected ~82. Investigation showed:

| Subpopulation | Count | Convention |
|---|---|---|
| Original Haiku-output questions (never touched by Stages 1+2) | ~4900 | **Convention A** (✓ at answer regardless of polarity) |
| Stage 1+2 Gemini rewrites | 1132 | **Convention B** (✓ = correct statement, ✗ = wrong statement) |

The 1805 wasn't "1805 new bugs" — it was the polarity-aware detector flagging the 4900 Convention A questions as "wrong" relative to its Convention B yardstick.

### Discovery: answer fields 100% canonical-verified

User downloaded the 76 standalone 考選部 MOD/ANS PDFs (10 years × 2 sittings × 4 papers, minus 115-2 not yet published) to `/Users/kangweiling/Desktop/國考/二階國考/二階國考簡答/`. Parser cross-checked every question's `answer` field against the official 考選部 standard answer tables:

- **6080/6080 match** (5895 letter==letter + 185 #==#, 0 mismatches)
- Q76 specifically: canonical = C, .md = C (user's earlier "should be B" claim is a clinical-judgment disagreement with the official answer, not a data-extraction bug)

Canonical map preserved at `/tmp/moex_canonical_answers.json` (96 KB).

### Stage 3 batch attempt 1 — silent failure

Launched with `GEMINI_MODEL=gemini-2.5-flash` from `/tmp`. All 83 entries failed with empty stdout — root cause: Gemini CLI "trusted folders" feature refuses to run headless from `/tmp` without `GEMINI_CLI_TRUST_WORKSPACE=true`. Lost 6 minutes of runtime to silent fails.

### Stage 3 batch attempt 2 — killed mid-run

Re-launched from project root with the trust env var. 19 questions written successfully before user-initiated kill. Each write was correct Convention B (script's prompt + validator enforce ✗ at answer for negative-polarity stems).

### Decision: abandon, accept current state

Three options weighed for handling the 1132 Stage 1+2 Convention B rewrites:

| Option | Effort | Outcome |
|---|---|---|
| (a) Accept current state | 0 | Mixed corpus: 4900 Convention A + 1132 + ~19 Convention B; answer fields all correct |
| (b) Pure mark swap | < 1 min | Breaks prose — e.g. Q6 prose explicitly says「這是錯誤敘述」for the answer; swapping mark to ✓ would contradict |
| (c) Gemini full rewrite of 1132 prose | ~9 hr wall + Gemini quota | All Convention A consistent |

**User chose (a)**. Rationale: answer fields canonical-verified is the high-stakes correctness check; mark direction is cosmetic UX; users who read full prose can disambiguate; 9 hr of API calls for cosmetic improvement is poor ROI.

## Side effects accepted

- **Sidecar drift**: The ~19 Convention B writes that succeeded before kill remain in `~/Desktop/國考/二階國考/二階國考_拆分/醫學*/<subject>/<paper>.explanations.md`. They are NOT in the shipped `questions.json` (shipped JSON is pre-Stage-3). Next `pnpm --filter @study-rpg/content-medexam2-tw build` will include them, taking the mixed-convention count from 1132 → ~1151. Acceptable.
- **`/tmp/batch_rewrite_v3_state.json`** preserved (8 entries marked "failed" from real validation failures during the brief run; rest were trust-error empties already cleaned out).

## Lessons

1. **Convention assumptions need verification before scaling**: I assumed Convention B was canonical because Stage 1+2 enforced it. Real corpus survey showed Stage 1+2 was the OUTLIER, not the rule. Should have spot-sampled both groups before designing the polarity-aware detector.
2. **Gemini CLI headless trust trap**: Running from `/tmp` or any non-trusted directory silently fails with empty stdout. Always set `GEMINI_CLI_TRUST_WORKSPACE=true` for headless batches, or launch from a trusted project directory.
3. **Pure data swaps need prose audit**: Mark swap is mechanically simple but semantically only safe if prose was written under the same convention as the target. Stage 1+2's prose explicitly uses Convention B wording (「這是錯誤敘述」for the answer); mark-swap to Convention A would create explicit contradictions.

## Reusable artifacts

| Path | What |
|---|---|
| `/tmp/moex_canonical_answers.json` | 76 papers × 80 answers parsed from official 考選部 PDFs. Authoritative reference for any future answer-field audit. |
| `/Users/kangweiling/Desktop/國考/二階國考/二階國考簡答/` | The 76 official MOD/ANS PDFs (outside repo). Source of truth for canonical map. |
| `/tmp/convention_a_inversions.json` | 1132 qids where current mark on answer ≠ ✓ (under Convention A yardstick). Defines the scope of any future cleanup if user reverses decision. |
| `/tmp/batch_rewrite_v3.py` | Stage 3 script variant (separate state file). Reusable for any future Convention B rewrite if scope changes. |
| `/tmp/detect_inversions_v2.py` | Standalone polarity-aware detector CLI (Convention B logic). Reusable but needs `--convention=a` flag added if user reverses. |

## Related changes / references

- `openspec/changes/archive/2026-05-20-fix-medexam2-explanation-quality-batch-2026-05-19/` — the Stage 1+2 work that created the 1132 Convention B rewrites
- Commit `8239d34` — Stage 1+2 shipping commit
- `openspec/specs/medexam2-corpus-ingestion/spec.md` — main spec for the corpus; was synced with Stage 1+2 deltas, no Stage 3 deltas added
