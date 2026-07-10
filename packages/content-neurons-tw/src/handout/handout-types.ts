/**
 * 考前講義 (handout) data types (add-neurons-anatomy-handout).
 *
 * A teaching-style, one-week-scope study handout — deeper and more beginner-friendly
 * than the cram-tab discriminator sheets. Per-subject content is authored as a committed
 * HTML fragment (src/handout/<subjectId>.html), built into dist/handout.json, and
 * lazy-fetched by the /cram/handout scene (NOT bundled via getContentPack).
 *
 * beta ships the 解剖學 entry only; `subjects[]` is extensible to all 11 families.
 *
 * HONESTY invariant (mirrors cram): no hit-rate / guarantee language — frequency framing
 * is historical 投報率參考 only. Enforced by build-handout's banned-word lint.
 */

/**
 * A per-chapter quiz mapping — carried as TYPED data (not embedded in the authored HTML) so the
 * handout scene can render a「測驗本章」CTA at the end of a blueprint chapter and open a quiz over
 * its questions. Exam questions are tagged at blueprint-chapter granularity, so several authored
 * regions can share one chapter; the CTA anchors to the chapter's LAST region (`regionId`), and the
 * earlier member regions render a lightweight signpost pointing to it (using `label`).
 *  - `regionId`: the `.hdt-region` anchor the CTA attaches to (the chapter's last region). Shared
 *    contract between TOC, scroll-spy, quiz, and deep-link.
 *  - `label`: the blueprint chapter's display name (for the signpost text).
 *  - `memberRegionIds`: every region in this chapter, in document order (last = `regionId`).
 *  - `leafIds`: the chapter's concept leaves; `sourceQuestionIds`: exam ids resolved from them at build.
 */
export interface HandoutChapterQuiz {
  regionId: string
  label: string
  memberRegionIds: string[]
  leafIds: string[]
  sourceQuestionIds?: string[]
}

/** One subject's full teaching handout. `html` = build-trusted authored HTML (regions concatenated). */
export interface HandoutSubject {
  subjectId: string
  /** Display title, e.g. "解剖學 考前講義". */
  title: string
  /** Full teaching HTML for this subject (one or more `<section class="hdt-region">`). */
  html: string
  /** Optional per-chapter quiz map (typed, not in HTML). Regions without an entry render no CTA. */
  chapterQuizzes?: HandoutChapterQuiz[]
}

export interface HandoutData {
  version: 1
  builtAt: string
  subjects: HandoutSubject[]
}
