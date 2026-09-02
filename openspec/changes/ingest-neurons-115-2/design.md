## Context

The neurons corpus is assembled by `packages/content-neurons-tw/reconcile/`: 考選部 PDFs are the authority for
stem / options / answer, 陽明 contributes only the explanation, and a sitting 陽明 has not covered takes the
AI-generated escape hatch. 115-1 sat on that escape hatch for months before 陽明 published; 115-2 now takes the
same seat.

Two properties of this pipeline shape every decision below:

- **Its failure mode is silence.** A detached superscript, a stale denominator, a 講義 that never mentions the
  newest paper — none of these fail a build, a type-check or a test. They ship looking exactly like success.
- **Explanations for a sitting are replaceable; question text is not.** The 115-1 precedent shows the
  AI 詳解 can be swapped for 陽明's later at bounded cost. A wrong stem, by contrast, is read as fact and is
  invisible once merged, because nothing downstream re-derives it.

## Goals / Non-Goals

**Goals:**

- Ingest 115-2 additively, with 考選部 as the sole authority for stem / options / answer.
- Make every corpus-derived count read from the corpus, so the next sitting needs no code edit.
- Leave behind the checks that would have caught this ingest's near-misses, not just the fixes.

**Non-Goals:**

- **Replacing the AI 詳解 with 陽明's.** 陽明 has published nothing for 115-2. The path back is documented and
  already walked once (`2026-07-13-add-neurons-115-1-real-explanations`).
- **A `question-page-map` entry / 「看原始詳解 PDF」 for 115-2.** There is no 陽明 booklet to point at; the button
  hides itself on an unmapped question, which is the correct behaviour and needs no code.
- **Giving the year filter a sitting dimension.** Real, out of scope, recorded in the proposal.
- **Sweeping the detached-superscript class through the 23 already-shipped sittings.** See D2 — the evidence
  says the class is specific to how 115 booklets were parsed, and a corpus-wide errata pass inside an ingest
  would blur which change touched which question.

## Decisions

### D1. `-layout` stays the default parser; the span-aware parse is an oracle, not a replacement

`parse_moex_spans.py` rebuilds each **visual** line from PyMuPDF spans (lines whose bounding boxes overlap
vertically by >60% are one line; spans inside are ordered by x), so a raised span rejoins its base word.
`detached_superscript_fields()` diffs it against `-layout` whitespace-insensitively, and the ingest swaps in
`merge_spacing(layout, spans)` — span content, `-layout` spacing — only for the fields that disagree.

**Why not just switch to the span parser.** It is not safe everywhere. Run against 115020, 112100 and 113020
it **doubles characters** (「三三支試管」, `trochaanter`, `longuss`) because those booklets carry overlapping
duplicate text layers that the overlap-merge concatenates. A blanket switch would trade a visible defect for
an invisible one across the whole corpus. Used as an oracle on 23 disagreeing fields, every swap was
eyeballed against the 考選部 render.

**Why `merge_spacing` rather than taking the span text raw.** `-layout` reproduces the CJK/ASCII spacing the
rest of the corpus was built with; the span text carries the PDF's own tighter spacing. Aligning the two
whitespace-free strings and taking a space when *either* source has one — minus the gap the extracted
superscript left behind, which is why the rule declines a `-layout` space that falls right after an inserted
run and before a non-CJK character — reproduces `-layout` exactly on the 177 fields the two agree on.

### D2. The superscript class is not swept corpus-wide, and the reason is evidence, not budget

The obvious follow-up is "run the detector over 107–115". It was run: 87 differing fields across 9 already-
shipped booklets. **They are not defects.** Sampling them against the committed corpus shows the shipped text
is already correct (112-2 生理 Q56 reads `CO2與Fe 2+結合`; 113-1 微免 Q11/Q12 are intact), because those sittings
were reconciled with the *default* fitz parser, not `-layout` — only the 115 path uses `-layout`, and only it
loses the raised span. An independent orphan-tail scan over all 4800 shipped questions returned 22 candidates,
of which every one is legitimate (`Toll-like receptor 4`, `cyclin E/cdk 2`, `trisomy 22`); the residue is
cosmetic spacing (`HCO3 -`, `Ca 2+`), not lost characters.

**So the honest statement is narrower than "we deferred a corpus-wide errata pass":** there is no evidence of
a corpus-wide instance of this class to sweep. The new requirement therefore binds the *ingest*, which is
where the defect is actually introduced.

### D3. Corpus-derived counts become derived; the tier thresholds deliberately do not

`SITTINGS_TOTAL`, `statUpTo` and the strings in `CramPage` are now read from the corpus. The tier boundaries
in `tierOf()` (breadth ≥ 13 for 常青必掃, ≥ 8 with `lastGap` ≥ 6 for 經典但降溫, `PUSH_THRESHOLD` 5) stay
**absolute sitting counts** and are not rescaled to the new denominator.

**Why.** Those numbers encode a judgement about how many sittings of evidence make a 考點 worth calling
evergreen — that judgement is about absolute repetition, not about a fraction of however many papers happen
to be ingested. Rescaling them would move every tier boundary silently on every future ingest, which is the
exact failure this change exists to remove. The observed shift (常青必掃 93 → 115) is the constant behaving
correctly: 22 more 考點 have now genuinely been tested in ≥ 13 distinct sittings.

### D4. The 講義 backfill is gated per-question, not per-subject

`verify:handout` layer 3 asserts, for the **latest** sitting, that each question's primary tagged leaf lands
in a handout topic carrying a `<cite>` that names that sitting.

**Why per-question rather than "the subject mentions 115-2 somewhere".** A subject-level check passes as soon
as one line is added, which is precisely the state that looks done and is not. Per-question is the granularity
the reader experiences: they open the topic their weak question belongs to and want the newest paper's angle
on it there.

**Why "latest sitting" rather than every sitting.** Older sittings predate the citation convention unevenly,
so a retroactive all-sittings gate would fail on a debt this change did not create and cannot honestly fix in
passing. Binding the newest sitting makes the gate bite exactly when a new ingest lands.

**It bit immediately.** The first run failed on 5 生理學 questions whose concepts the 講義 already taught, where
the line had deliberately been left un-cited. That is the right outcome — 「already covered」 is a judgement
call, and the gate forces it to be recorded in the citation rather than left in a reviewer's head. All five
now carry an enriched line with the 115-2 discriminator.

### D5. The one model/考選部 disagreement was corrected by hand, not by loosening the check

The explainer picks the answer independently and the pipeline flags any disagreement with 考選部; 199/200
agreed. The one flag — 醫二 公衛 Q46, 「公費肺炎鏈球菌疫苗屬三段五級預防中那一級」 — was a real model error: it read
「級」 as 「段」 and explained the 考選部 answer B as 早期診斷早期治療. 疫苗接種 is 特殊保護, the **second of the five
levels**, which is why B is right. The explanation was rewritten by hand and the entry records that.

**Why this matters more than one question.** The verification pass is the only thing standing between a
generated 詳解 and a student reading it as fact. A flag that gets waved through because the answer letter
happens to match would make the whole gate ornamental — the letter matched here; the reasoning did not.

### D6. `meta.json` stats are re-derived, and `gapsFilled` is dropped

The committed stats block had drifted badly (`withExplanation: 4150` and `aiGenerated: 6` against a corpus
that was already 4600 / 16) because it was hand-maintained. `finalize_115_2.py` now computes every field from
the merged corpus. `gapsFilled` is removed rather than recomputed: nothing produces it, nothing reads it, and
its meaning ("how many holes 陽明 left that we filled") no longer has a single defensible definition now that
filling happens per-question on two different paths.

**Nothing reads these stats** — `build.ts` consumes only `parsedFiles` / `totalFiles` — so this is
documentation accuracy, not behaviour. It is called out because a wrong number in a committed artifact is
read as fact by the next person, exactly like a wrong denominator.

## Risks / Trade-offs

- **200 explanations are AI-generated and not 陽明-reviewed.** → They are tagged `explanationSource:
  'ai-generated'`, carry their own `sourceCredit`, and the app renders an explicit AI disclaimer on all three
  surfaces that show an explanation. 199/200 independently agreed with 考選部; the one that did not was fixed
  by hand rather than accepted.
- **The 講義 backfill is 194 hand-authored lines.** → Every line is grounded in a specific question's stem,
  its 考選部 answer, and the generated 詳解 for that question; the gate proves each one is attached to the right
  topic. It does not prove each line is medically correct — that remains a human-review property, and the
  existing 事實 grounding requirement is what governs it.
- **`statUpTo` widens from the literal `'115-1'` to `string`.** → Slightly weaker typing in exchange for the
  literal never going stale again. The two test fixtures that carried it were updated rather than loosened.
- **The tier reshuffle is visible to every active player on the same day.** → Accepted (proposal, effect 1).
  No in-app note is proposed here; saying so is better than implying it is invisible.

## Migration Plan

1. Corpus artifacts, provenance sidecars and handout fragments are already rebuilt in the working tree; the
   corpus diff was verified per-id to be purely additive before anything downstream ran.
2. Land the derived-constant changes in the **same commit** as the corpus — a deployed build must never show
   a 「23 次考試」 denominator over a 24-sitting corpus.
3. `pnpm -r typecheck`, `pnpm --filter @study-rpg/neurons-tw test`, and the eight content-pack verify gates
   green before commit.
4. Merge `track-neurons` → `main`; CF Pages deploys `main` (`deploy-cf-pages.yml`).
5. Post-deploy on `med-study-rpg.com/neurons/`: `/cram` reads 「統計至 115-2」 and 「24 次考試」; a 115-2 question
   renders its AI-generated disclaimer and per-option 簡答; a 講義 topic shows a `115-2` citation.

**Rollback**: revert the commit. Nothing here touches Dexie schemas, cloud-sync payloads or question ids, so a
revert returns the app to the 4600 corpus with every player's saved state intact.

## Open Questions

- **When 陽明 publishes the 115-2 詳解**, does it get the same treatment as 115-1 (additive-only page-map merge,
  regenerate 簡答 from the real 詳解, keep AI tags on whatever the booklet omits)? The precedent says yes; the
  cost was one focused change and it is worth re-confirming rather than assuming.
- **Should the year filter gain a sitting dimension** before the next 一階, now that two sittings share the
  year 115 and a player selecting 「115」 silently gets both?
- **Is the tier reshuffle worth an in-app note?** Every active player sees their 押題 list change on the same
  morning, with no action of their own.
