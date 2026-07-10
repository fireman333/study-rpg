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

/** One subject's full teaching handout. `html` = build-trusted authored HTML (regions concatenated). */
export interface HandoutSubject {
  subjectId: string
  /** Display title, e.g. "解剖學 考前講義". */
  title: string
  /** Full teaching HTML for this subject (one or more `<section class="hdt-region">`). */
  html: string
}

export interface HandoutData {
  version: 1
  builtAt: string
  subjects: HandoutSubject[]
}
