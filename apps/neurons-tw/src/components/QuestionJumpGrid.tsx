import { useRef, useState } from 'react'
import type { CellState, ReviewCellState } from '../lib/exam-set-mock'

type AnyCellState = CellState | ReviewCellState

/** Glyph per state — a non-colour cue so the navigator is readable without colour. */
const STATE_GLYPH: Record<AnyCellState, string> = {
  current: '▸',
  answered: '●',
  unanswered: '○',
  correct: '✓',
  wrong: '✗',
  disputed: '⚖',
}

const STATE_LABEL: Record<AnyCellState, string> = {
  current: '目前題目',
  answered: '已作答',
  unanswered: '未作答',
  correct: '答對',
  wrong: '答錯',
  disputed: '送分題',
}

/** Per-state cell colours (cream/brown pixel palette, matching QuizModal). */
const STATE_BG: Record<AnyCellState, string> = {
  current: '#d4a04d',
  answered: '#efe3c8',
  unanswered: '#fbf6e9',
  correct: '#e8f5e8',
  wrong: '#f8e8e8',
  disputed: '#fff8e0',
}
const STATE_FG: Record<AnyCellState, string> = {
  current: '#fff',
  answered: '#3a2a1a',
  unanswered: '#8c6d4a',
  correct: '#2f6b2f',
  wrong: '#9b3a3a',
  disputed: '#7a5a1a',
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}

/**
 * 模擬考試 question-jump navigator: a full 1..N grid letting the player jump to any
 * question. Each cell shows its number plus a state glyph (not colour alone) and a
 * flag badge overlay. Arrow keys move focus; Enter / Space (native button) jumps.
 * Collapses to a summary on mobile. Cell-state types come from `@study-rpg/core`.
 */
export function QuestionJumpGrid({
  states,
  flagged,
  currentIndex,
  answeredCount,
  unansweredCount,
  reviewMode,
  onJump,
}: {
  states: AnyCellState[]
  flagged: Set<number>
  currentIndex: number
  answeredCount: number
  unansweredCount: number
  reviewMode: boolean
  onJump: (index: number) => void
}): JSX.Element {
  const count = states.length
  const [expanded, setExpanded] = useState(() => !isMobileViewport())
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([])

  function focusCell(i: number): void {
    const clamped = Math.max(0, Math.min(count - 1, i))
    cellRefs.current[clamped]?.focus()
  }

  function onCellKeyDown(e: React.KeyboardEvent, i: number): void {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        focusCell(i + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        focusCell(i - 1)
        break
      case 'ArrowDown':
        e.preventDefault()
        focusCell(i + 10)
        break
      case 'ArrowUp':
        e.preventDefault()
        focusCell(i - 10)
        break
    }
  }

  return (
    <nav style={navStyle} aria-label="題號跳轉">
      <div style={summaryStyle}>
        <span style={{ fontWeight: 700, color: '#3a2a1a' }}>
          {currentIndex + 1} / {count}
        </span>
        <span style={{ color: '#6a5238' }}>
          已答 {answeredCount} · 未答 {unansweredCount}
          {flagged.size > 0 ? ` · 標記 ${flagged.size}` : ''}
        </span>
        <button type="button" style={toggleStyle} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收合題號' : '展開題號'}
        </button>
      </div>

      {expanded && (
        <ol style={gridStyle}>
          {states.map((state, i) => {
            const isFlagged = flagged.has(i)
            const label = `第 ${i + 1} 題：${STATE_LABEL[state]}${isFlagged ? '，已標記' : ''}`
            return (
              <li key={i} style={{ listStyle: 'none' }}>
                <button
                  type="button"
                  ref={(el) => {
                    cellRefs.current[i] = el
                  }}
                  style={{
                    ...cellStyle,
                    background: STATE_BG[state],
                    color: STATE_FG[state],
                    border: `2px solid ${i === currentIndex ? '#b8893a' : '#c9ad7f'}`,
                  }}
                  aria-label={label}
                  aria-current={i === currentIndex ? 'step' : undefined}
                  onClick={() => onJump(i)}
                  onKeyDown={(e) => onCellKeyDown(e, i)}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{i + 1}</span>
                  <span aria-hidden="true" style={{ fontSize: '0.7rem', lineHeight: 1 }}>
                    {STATE_GLYPH[state]}
                  </span>
                  {isFlagged && (
                    <span aria-hidden="true" style={flagBadgeStyle}>
                      ⚑
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {expanded && (
        <p style={legendStyle} aria-hidden="true">
          {reviewMode ? '✓ 答對　✗ 答錯　○ 未作答　⚖ 送分　▸ 目前' : '● 已答　○ 未答　⚑ 標記　▸ 目前'}
        </p>
      )}
    </nav>
  )
}

const navStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '0.6rem 0.7rem',
  background: '#f4ecd8',
  border: '2px solid #c9ad7f',
  borderRadius: '6px',
}
const summaryStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.6rem',
  fontSize: '0.8rem',
  marginBottom: '0.5rem',
}
const toggleStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: '0.15rem 0.5rem',
  background: 'transparent',
  color: '#8c6d4a',
  border: '1px dashed #b8893a',
  borderRadius: '999px',
  fontFamily: 'inherit',
  fontSize: '0.76rem',
  cursor: 'pointer',
}
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(10, 1fr)',
  gap: '0.25rem',
  padding: 0,
  margin: 0,
}
const cellStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.05rem',
  width: '100%',
  aspectRatio: '1 / 1',
  minHeight: '2rem',
  borderRadius: '4px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: 0,
}
const flagBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-2px',
  right: '0px',
  fontSize: '0.6rem',
  color: '#c44d4d',
}
const legendStyle: React.CSSProperties = {
  margin: '0.5rem 0 0',
  fontSize: '0.72rem',
  color: '#8c6d4a',
  textAlign: 'center',
}
