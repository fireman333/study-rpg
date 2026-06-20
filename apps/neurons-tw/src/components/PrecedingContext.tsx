import { useEffect, useState, type CSSProperties } from 'react'
import type { Question } from '@study-rpg/core'
import { isContinuationQuestion, resolvePrecedingChain } from '@study-rpg/core'
import { loadQuestionsByIdMap } from '../lib/services/continuation-context'
import { QuestionFigure } from './QuestionFigure'

/**
 * 承上題 preceding-context box. Drop `<PrecedingContext question={q} />` above the
 * current question stem; it self-detects continuation questions, resolves the
 * preceding chain from the FULL bank (cached by-id map), and renders nothing for
 * ordinary or unresolvable questions (zero visual cost).
 */
export function PrecedingContext({ question }: { question: Question }) {
  const [chain, setChain] = useState<Question[]>([])

  useEffect(() => {
    let alive = true
    if (!isContinuationQuestion(question)) {
      // Clear any stale chain from a previous continuation question. The
      // functional update returns the same ref when already empty (the common
      // case), so React skips a re-render.
      setChain((prev) => (prev.length === 0 ? prev : []))
      return
    }
    void loadQuestionsByIdMap().then((byId) => {
      if (alive) setChain(resolvePrecedingChain(question, byId))
    })
    return () => {
      alive = false
    }
  }, [question])

  if (chain.length === 0) return null

  // A single preceding question shows its image inline; longer chains keep images
  // behind a toggle so the box doesn't push the current question off-screen.
  const showImageByDefault = chain.length <= 1

  return (
    <div style={boxStyle} role="note" aria-label="承上題前文情境">
      <p style={labelStyle}>承上題・前文情境</p>
      {chain.map((q) => (
        <PrecedingItem key={q.id} question={q} showImageByDefault={showImageByDefault} />
      ))}
    </div>
  )
}

function PrecedingItem({
  question,
  showImageByDefault,
}: {
  question: Question
  showImageByDefault: boolean
}) {
  const [showImage, setShowImage] = useState(showImageByDefault)
  const hasImage = Boolean(question.hasImage)

  return (
    <div style={itemStyle}>
      <p style={idStyle}>{question.id}</p>
      <p style={stemTextStyle}>{question.stem}</p>
      {hasImage && !showImage && (
        <button type="button" style={toggleStyle} onClick={() => setShowImage(true)}>
          顯示前文附圖
        </button>
      )}
      {hasImage && showImage && <QuestionFigure q={question} />}
    </div>
  )
}

const boxStyle: CSSProperties = {
  margin: '0 0 1rem',
  padding: '0.75rem 0.9rem',
  borderLeft: '3px solid #b0986a',
  borderRadius: '6px',
  background: '#f5efe0',
}

const labelStyle: CSSProperties = {
  margin: '0 0 0.5rem',
  fontSize: '0.8rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: '#8a7a5a',
}

const itemStyle: CSSProperties = {
  marginTop: '0.5rem',
}

const idStyle: CSSProperties = {
  margin: '0 0 0.2rem',
  fontSize: '0.75rem',
  color: '#a8966e',
}

const stemTextStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.95rem',
  lineHeight: 1.6,
  color: '#5a4a2a',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}

const toggleStyle: CSSProperties = {
  marginTop: '0.4rem',
  padding: '0.3rem 0.7rem',
  fontSize: '0.8rem',
  color: '#6a5a3a',
  background: '#ede3cc',
  border: '1px solid #d4c4a0',
  borderRadius: '5px',
  cursor: 'pointer',
}
