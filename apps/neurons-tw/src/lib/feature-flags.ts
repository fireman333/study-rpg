/**
 * App-level feature flags for neurons-tw.
 */

/**
 * Whether to show the expandable inline 詳解 (the AI / 陽明 text explanation) under each answered
 * question, on every surface (QuestionBankPage / QuizModal / MockExamRunner).
 *
 * Temporarily OFF: the current inline explanations have quality issues (PDF-flatten 跑版 +
 * AI-generated drift) and are being replaced by AI-agent-produced simplified answers. Until that
 * lands, players still get the 正解 + the authoritative 「看原始詳解 PDF」 source button — only the
 * unreliable text 詳解 is hidden. Flip back to `true` (or repoint the surfaces to the new
 * simplified-explanation field) once the cleaned content ships. The render code is kept intact
 * behind this flag so re-enabling is a one-line change.
 */
export const SHOW_INLINE_EXPLANATION: boolean = false
