/**
 * DmnDrawProgressRing — replaces the homepage prose rule line ("每 30 min 觸發 DMN
 * 抽卡…") with a visual ring showing reading-minutes accrued toward the next
 * time-axis DMN draw. Daily-cap aware: once the time-axis daily cap is reached it
 * renders an explicit terminal state instead of a misleading countdown.
 *
 * Data source is the already-wired reading-timer → DMN time-axis (`readDmnMeta`,
 * `dmnTimeAxisMinutesAccrued` / `dmnTimeAxisDrawsConsumedToday`). Live via Dexie
 * liveQuery so it advances as minutes accrue and as draws become available.
 *
 * Covers the TIME-axis story only ("reading accrues toward a draw"); behaviour-
 * axis draws (variant / synapse events) surface via their own toasts.
 *
 * Spec: openspec/specs/neurons-homepage/spec.md
 *   "Homepage SHALL display a cap-aware 'next DMN draw' progress ring driven by
 *    real reading-timer data"
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  DMN_TIME_AXIS_MINUTES_PER_DRAW,
  DMN_TIME_AXIS_DAILY_CAP,
} from '@study-rpg/content-neurons-tw'
import { readDmnMeta } from '../lib/services/dmn-trigger'

interface RingState {
  minutesIntoWindow: number
  minutesToNext: number
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
      const per = DMN_TIME_AXIS_MINUTES_PER_DRAW
      const minutesIntoWindow = meta.dmnTimeAxisMinutesAccrued % per
      const capped = meta.dmnTimeAxisDrawsConsumedToday >= DMN_TIME_AXIS_DAILY_CAP
      return {
        minutesIntoWindow,
        minutesToNext: per - minutesIntoWindow,
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

  const per = DMN_TIME_AXIS_MINUTES_PER_DRAW
  const fraction = state && !state.capped ? state.minutesIntoWindow / per : state?.capped ? 1 : 0
  const offset = C * (1 - fraction)
  const ringColor = state?.capped ? 'var(--signal-amber, #f0a830)' : 'var(--signal-cyan, #38e0d0)'

  const centerLabel = (() => {
    if (!state) return '—'
    if (state.capped) return '滿'
    return `${state.minutesToNext}`
  })()

  const caption = (() => {
    if (!state) return '載入 DMN 進度中…'
    if (state.capped) return '今日抽卡已達上限 · 明日重置'
    const avail = state.drawsAvailable > 0 ? ` · 可抽 ${state.drawsAvailable}` : ''
    return `再讀 ${state.minutesToNext} min 觸發下個 DMN 抽卡${avail}`
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
            fontFamily: "'VT323', monospace",
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
