/**
 * Explanation — renders a question's per-option 簡答 (neurons-simplified-explanations).
 *
 * One short line per option in the form "(<key>) <簡答>", in the question's option order.
 * The correct option's row is visually marked (送分/disputed → every row marked; multi-answer
 * → each accepted key marked). This REPLACES the old inline prose/table/figure 詳解, which had
 * PDF-flatten / AI-drift quality issues and is now reached only through the 「看原始詳解 PDF」
 * button. Renders nothing when the question carries no `optionExplanations` (un-generated or
 * QA-failed questions), matching the prior hidden-詳解 behavior. Shared by every answer surface
 * (QuizModal / MockExamRunner / QuestionBankPage) so the list looks identical everywhere.
 */
import type { CSSProperties } from 'react'
import type { Question } from '@study-rpg/core'

type ExplanationQuestion = Pick<Question, 'optionExplanations' | 'options' | 'answer' | 'acceptedAnswers' | 'disputed'>

export interface OptionRow {
  key: string
  text: string
  isCorrect: boolean
}

/**
 * Pure row builder (unit-tested). Returns one row per option that has a 簡答, in the question's
 * option order, with the correct option(s) flagged — 送分/disputed marks every option, multi-answer
 * marks each accepted key. Returns null when the question has no 簡答 (→ render nothing).
 */
export function buildOptionRows(question: ExplanationQuestion): OptionRow[] | null {
  const oe = question.optionExplanations
  if (!oe || Object.keys(oe).length === 0) return null
  const correct = new Set<string>(
    question.disputed ? Object.keys(question.options) : [question.answer, ...(question.acceptedAnswers ?? [])],
  )
  return Object.keys(question.options)
    .filter((k) => k in oe)
    .map((k) => ({ key: k, text: oe[k], isCorrect: correct.has(k) }))
}

export function Explanation({
  question,
  textStyle,
}: {
  question: ExplanationQuestion
  textStyle?: CSSProperties
}): JSX.Element | null {
  const rows = buildOptionRows(question)
  if (!rows) return null
  return (
    <div style={listStyle}>
      {rows.map(({ key, text, isCorrect }) => (
        <div key={key} style={{ ...rowStyle, ...(isCorrect ? correctRowStyle : null) }}>
          <span style={{ ...keyStyle, ...(isCorrect ? correctKeyStyle : null) }}>({key})</span>
          <span style={{ ...bodyStyle, ...textStyle }}>{text}</span>
        </div>
      ))}
    </div>
  )
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
}
const rowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.4rem',
  alignItems: 'baseline',
  padding: '0.25rem 0.4rem',
  borderRadius: 6,
  borderLeft: '3px solid transparent',
}
// Correct option's row: subtle green tint + accent edge (reinforces the 正解 shown separately).
const correctRowStyle: CSSProperties = {
  background: 'rgba(47, 143, 78, 0.10)',
  borderLeft: '3px solid #2f8f4e',
}
const keyStyle: CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: '#6a5a45',
  fontFamily: 'var(--font-legible)',
}
const correctKeyStyle: CSSProperties = {
  color: '#2f8f4e',
}
const bodyStyle: CSSProperties = {
  fontFamily: 'var(--font-legible)',
  lineHeight: 1.5,
}
