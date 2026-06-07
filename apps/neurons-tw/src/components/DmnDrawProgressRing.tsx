/**
 * DmnDrawProgressRing — replaces the homepage prose rule line ("每 30 min 觸發 DMN
 * 抽卡…") with a visual ring showing today's EXPEDITION-axis DMN draws earned
 * toward the daily cap. Daily-cap aware: once the cap is reached it renders an
 * explicit terminal state instead of a misleading countdown.
 *
 * Data source is the DMN expedition axis (`readDmnMeta`, `dmnTimeAxisDrawsConsumedToday`
 * = expedition draws today, `dmnTimeAxisMinutesAccrued` = cumulative expedition
 * clears today; legacy key names per add-neurons-expedition-rewards). Live via
 * Dexie liveQuery so it advances as the player clears wrong-questions in 出征.
 *
 * Covers the EXPEDITION-axis story only ("clearing wrong-questions earns draws");
 * behaviour-axis draws (variant / synapse events) surface via their own toasts.
 *
 * Spec: openspec/specs/neurons-homepage/spec.md
 *   "Homepage SHALL display a cap-aware 'next DMN draw' progress ring driven by
 *    real reading-timer data" (data source moved to expedition axis)
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { DMN_EXPEDITION_DAILY_CAP } from '@study-rpg/content-neurons-tw'
import { readDmnMeta } from '../lib/services/dmn-trigger'

interface RingState {
  clearsToday: number
  drawsToday: number
  drawsAvailable: number
  capped: boolean
}

const R = 26
const STROKE = 6
const C = 2 * Math.PI * R

export function DmnDrawProgressRing(): JSX.Element {
  const [state, setState] = useState<RingState | null>(null)

  useEffect(() => {
    const sub = liveQuery(async () => {
      const meta = await readDmnMeta()
      const capped = meta.dmnTimeAxisDrawsConsumedToday >= DMN_EXPEDITION_DAILY_CAP
      return {
        // legacy key name; now = cumulative expedition clears today
        clearsToday: meta.dmnTimeAxisMinutesAccrued,
        drawsToday: meta.dmnTimeAxisDrawsConsumedToday,
        drawsAvailable: meta.dmnDrawsAvailable,
        capped,
      }
    }).subscribe({
      next: (val) => setState(val),
      error: (err) => console.warn('[DmnDrawProgressRing] liveQuery failed:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  const fraction = state
    ? state.capped
      ? 1
      : Math.min(1, state.drawsToday / DMN_EXPEDITION_DAILY_CAP)
    : 0
  const offset = C * (1 - fraction)
  const ringColor = state?.capped ? 'var(--signal-amber, #f0a830)' : 'var(--signal-cyan, #38e0d0)'

  const centerLabel = (() => {
    if (!state) return '—'
    if (state.capped) return '滿'
    return `${state.drawsToday}/${DMN_EXPEDITION_DAILY_CAP}`
  })()

  const caption = (() => {
    if (!state) return '載入 DMN 進度中…'
    const avail = state.drawsAvailable > 0 ? ` · 可抽 ${state.drawsAvailable}` : ''
    if (state.capped) return `今日出征抽卡已達上限 · 明日重置${avail}`
    return `出征清錯題換 DMN 抽卡 · 今日已清 ${state.clearsToday} 題${avail}`
  })()

  return (
    <div style={wrapStyle} aria-label={caption}>
      <svg width={(R + STROKE) * 2} height={(R + STROKE) * 2} aria-hidden>
        <circle
          cx={R + STROKE}
          cy={R + STROKE}
          r={R}
          fill="none"
          stroke="var(--signal-dim, #2a4a52)"
          strokeWidth={STROKE}
        />
        <circle
          cx={R + STROKE}
          cy={R + STROKE}
          r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${R + STROKE} ${R + STROKE})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text
          x={R + STROKE}
          y={R + STROKE}
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fill: 'var(--signal-ink, #cfe8e2)',
            fontFamily: 'var(--font-pixel-num)',
            fontSize: state?.capped ? 16 : 20,
          }}
        >
          {centerLabel}
        </text>
      </svg>
      <span style={captionStyle}>
        💎 {caption}
      </span>
    </div>
  )
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  padding: '0.4rem 0.7rem',
  background: 'var(--signal-bg, #0c1418)',
  border: '2px solid var(--signal-dim, #2a4a52)',
  borderRadius: '6px',
}

const captionStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  color: 'var(--signal-ink, #cfe8e2)',
  fontWeight: 600,
}
