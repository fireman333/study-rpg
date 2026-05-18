## Context

二階 corpus dogfood surfaced an unanswerable-question class:「左耳鼓室圖（tympanogram），最可能為下列何者？」reading the answer key requires looking at four candidate tympanogram curves which the PDF-extractor was never asked to crop and bundle. Today these questions enter the quiz pool, the user picks one at random (since the stem looks reasonable), then the option list is just「A. _(圖片或缺失)_」, B/C/D similar, plus the occasional text option. Cannot pick rationally → either lucky guess or scroll explanation. Either path corrupts the SRS data we record.

10 affected 二階 questions across 9 papers, 7 subjects (內 / 外 / 婦產 / 家醫 / 小兒 / 神內 / 耳鼻喉). 一階 has 0. Magnitude small enough that "filter for now, defer per-option image rendering" is the right ROI call.

**Scope = 二階 only.** Per project plan, 二階 ships first. 一階 forward-compat filter (build-script detection mirror + `App.tsx` pool filter) is deferred to a follow-up change so this proposal cannot stall 二階 deploy. The schema field added here is optional, so 一階 build silently emits no field and downstream `=== true` checks default to "playable" — exactly the current 一階 behavior — until the follow-up lands.

## Goals / Non-Goals

**Goals**

- Stop unanswerable option-image questions from reaching the 二階 quiz UI.
- Preserve the underlying `questionHistory` rows so user progress (mastery counts, prior streak) is not retroactively rewritten.
- Add the detection / filter as a contract field (`hasOptionImages`) so future content packs (including the forthcoming 一階 follow-up) can mark this class explicitly without re-deriving from raw markdown markers.
- Keep `@study-rpg/core` 's API surface change additive + optional so unrelated consumers (including the un-touched 一階 build) are unaffected.

**Non-Goals**

- Phase 2 (per-option image extraction + render). This needs PDF coordinate parsing, per-option `<img>` UI in QuizModal, image-bundle expansion, and probably a doubling of the bundled image budget. Deferred until ROI is justified by user feedback.
- 一階 build-script changes or 一階 quiz-pool filter — explicitly deferred to a separate follow-up change.
- Schema migration for legacy `questionHistory` rows. The 10 affected IDs continue to exist; they just no longer surface. Cleanup is intentionally a non-event.
- Refactoring `hasImage` detection. Different semantic class — `hasImage` means "stem references a figure"; `hasOptionImages` means "at least one option IS an image" — keep them separate.
- Telemetry for filter-out counts. The build script's `imported / skipped / total` counter already prints to stdout; adding a separate `hasOptionImagesCount` log is noise.

## Decisions

**Decision 1: Optional field on `Question`, not a new spec.**

`hasOptionImages?: boolean` follows the existing `hasImage?: boolean` pattern. Older / external content packs (and the unchanged 一階 build) without the field continue to validate. The downside (silent absence = unset) is acceptable because the filter is `=== true`, so missing = "treated as non-image" = correct default.

Alternative considered: rename `hasImage` to `imageType: 'none' | 'stem' | 'options' | 'both'`. Rejected — breaking change for external `@study-rpg/core` consumers (M3 already shipped to npm) and complicates the simpler `hasImage` regex match path.

**Decision 2: Detect by marker substring `_(圖片或缺失)_`, not by absence of plain text.**

The marker is what the upstream PDF→Markdown extractor writes when it cannot OCR a graphic option. It is a stable string with zero false-positive risk (no real medical text contains this exact pattern). An alternative — "option whose text length < N characters" — would false-positive on legitimately short options like「點」 in the very example that motivates this change.

Also covered marker variants observed in raw scan (see proposal § Why): `_(選項缺失或為圖片題；參見原 PDF)_` appears, but always at block level (full option list missing) where the existing build script's `< 2 options` guard already drops the question. No additional handling needed.

**Decision 3: Filter at pool-load (二階), not inside each picker.**

二階: filter inside `loadPack()` once. Downstream `pickRandomQuestion`, `bySubject` size accounting, and any future caller all see a consistently filtered view. `byId` keeps the full set so historical SRS rows / bookmarks still hydrate (the row is then "orphan" by intent and the existing orphan-handling path applies).

Alternative considered: filter inside each picker call (`pickRandomQuestion`, etc). Rejected — multiple sites to keep in sync, easier to forget on a new picker added later.

**Decision 4: SRS due-queue filter via cross-reference to pack, not via storing `hasOptionImages` on `questionHistory`.**

`questionHistory` is per-user state; `hasOptionImages` is per-question property derived at content build time. Duplicating it into the user's row would couple two release cycles (corpus rebuild needs to backfill the history). Instead, `getDueQueueAllSubjects` does a `byId` lookup on the loaded pack and drops the row when the question is flagged. Row stays on disk untouched.

Alternative considered: hard-delete the affected rows on next app load. Rejected — destructive, irreversible if the user later (Phase 2) gets per-option image rendering and would have wanted to keep their mastery streak.

**Decision 5: Defer 一階 to follow-up change, even though 0 currently affected.**

The project plan ships 二階 first; bundling a 一階 build-script change + `App.tsx` pool filter into this proposal would:

1. Drag 一階 deploy gating into a 二階-only roadmap row.
2. Touch a hot 一階 codepath right before 二階's release, increasing rollback blast radius.
3. Add a `quiz-runner` spec delta whose only justification is forward-compat (0 affected today).

The optional schema field means 一階 keeps working with zero change. The follow-up change adds the mirror detection + filter with no schema coupling — small, parallelizable, and visible as its own audit unit.

Four capabilities touched in this proposal:

| Capability | Direction | Why |
|---|---|---|
| `content-pack-contract` | MODIFIED Requirement | Question shape gains optional field (additive, opt-in) |
| `medexam2-corpus-ingestion` | ADDED Requirement | Build emits the field for 二階 corpus |
| `hospital-quiz` | ADDED Requirement | 二階 random-pool picker filters the field |
| `hospital-srs` | ADDED Requirement | 二階 due-queue surface filters the field |

## Risks / Trade-offs

- **[Risk]** New content pack from a third-party fork ships `Question` objects without `hasOptionImages` and contains option-image questions. → **Mitigation:** the filter's `=== true` check means missing field is "non-image" and the question enters the pool — same behavior as today. The risk is no worse than current. A future content-pack-lint sub-skill could enforce the field if needed.
- **[Risk]** User has 二階 `questionHistory` rows for the 10 IDs and notices the streak counter "freezes" when they would have been the next due card. → **Mitigation:** the due-count chip just shows fewer rows. No streak interruption (mastery / affinity unaffected). Minor UX impact, acceptable for a 10-Q population.
- **[Risk]** Upstream extractor changes the marker string (e.g. localizes to `_(image missing)_`). → **Mitigation:** the marker `_(圖片或缺失)_` is documented in `docs/MEDEXAM2_IMAGES.md` and the same project owns both repos. A regex change here is a one-line patch.
- **[Risk]** 一階 follow-up gets dropped and the 一階 corpus quietly regresses (PDF re-extract adds option-image markers later). → **Mitigation:** track the follow-up as an explicit roadmap row (M_2nd ships → 一階 mirror filter file) and re-grep `_(圖片或缺失)_` against 一階 corpus before each deploy until the mirror lands.
- **[Trade-off]** Adds an optional field to the public `@study-rpg/core` `Question` type. → **Acceptable:** purely additive; documented as optional; M3 consumers ignore unknown fields.
- **[Trade-off]** Cross-ref filter in SRS scheduler adds one async pack load to the due-queue hot path. → **Acceptable:** `loadPack` is memoized inside `lib/quiz.ts`; the second-call cost is a Map lookup per due-queue row.
