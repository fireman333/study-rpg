/**
 * CramCalmView — 考前收斂 calm view (add-neurons-cram-calm-view). A passive,
 * dayComplete-gated reassurance panel that mirrors the player's own positive
 * footprint and gently permits rest. Mounts ONLY when the calm view is expanded,
 * so cram.json loads lazily on expand (the homepage never pays the ~330KB cost
 * unless opened). DISPLAY ONLY — zero CTA / button / link inside.
 *
 * Honesty guardrail: the ONLY dynamic value is a bare non-negative integer; no
 * denominator / % / remaining-count / prediction. The copy literals are exported
 * so the copy-guard test can assert they never drift past the honesty line. Note
 * the card already shows 已固化 X 天 + NG buds — those are NOT restated here (lean
 * design: only the coverage line + closing line).
 *
 * Spec: openspec/specs/neurons-daily-prescription/spec.md (考前收斂 calm view)
 */
import { useMemo } from 'react'
import { useCram } from '../lib/cram'
import { useQuestionHistory } from '../lib/services/question-history'
import { countCoveredConcepts } from '../lib/cram-coverage'
import { CALM_COVERAGE_PREFIX, CALM_COVERAGE_SUFFIX, CALM_CLOSING_LINE } from '../lib/calm-copy'

export function CramCalmView(): JSX.Element {
  const cram = useCram()
  const history = useQuestionHistory()
  const coverageCount = useMemo(() => {
    if (!cram) return null
    const consolidated = new Set(
      history.filter((h) => h.lastResult === 'correct').map((h) => h.questionId),
    )
    return countCoveredConcepts(cram.books, consolidated)
  }, [cram, history])

  return (
    <div style={calmStyle} aria-label="考前收束">
      {coverageCount != null && (
        <p style={calmLineStyle}>
          {CALM_COVERAGE_PREFIX}
          <b style={calmNumStyle}>{coverageCount}</b>
          {CALM_COVERAGE_SUFFIX}
        </p>
      )}
      <p style={calmClosingStyle}>{CALM_CLOSING_LINE}</p>
    </div>
  )
}

const calmStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  padding: '0.55rem 0.7rem',
  marginTop: '0.4rem',
  background: '#fffdf8',
  border: '1px solid #e6d6b8',
  borderRadius: '6px',
}

const calmLineStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#5a3f29',
  lineHeight: 1.5,
}

const calmNumStyle: React.CSSProperties = {
  fontFamily: 'var(--font-pixel-num)',
  color: '#a85530',
  fontSize: '0.95rem',
  padding: '0 0.1rem',
}

const calmClosingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.82rem',
  color: '#7a5c3a',
  lineHeight: 1.55,
}
