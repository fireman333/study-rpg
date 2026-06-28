/**
 * App-level feature flags for neurons-tw.
 */

/**
 * Whether to show the inline explanation under each answered question, on every surface
 * (QuestionBankPage / QuizModal / MockExamRunner).
 *
 * ON: the inline slot now renders the per-option 簡答 (neurons-simplified-explanations) — a short
 * line per option (correct = why right, others = why wrong), condensed from the authoritative 詳解
 * by the offline Haiku pipeline and QA-gated. The old unreliable prose/table/figure 詳解 (PDF-flatten
 * 跑版 + AI drift) was retired from inline display; the authoritative source stays one tap away via
 * the 「看原始詳解 PDF」 button. A question with no 簡答 (un-generated / QA-failed) renders nothing
 * inline — so flipping this on never shows the old noisy text.
 */
export const SHOW_INLINE_EXPLANATION: boolean = true
