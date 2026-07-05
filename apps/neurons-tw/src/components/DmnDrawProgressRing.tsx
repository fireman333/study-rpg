/**
 * DmnDrawProgressRing — the homepage DMN-draw progress indicator, rendered as a
 * horizontal progress BAR (the prior circular ring form is retired, per
 * redesign-neurons-homepage-cta). The export name is kept because the
 * neurons-homepage spec references this component by name ("the
 * `DmnDrawProgressRing` indicator (in its bar form)"). It is folded into the
 * merged daily-loop stat card (ConnectomeStatCard), so it is styled for that
 * card's light cream/brown theme rather than the old dark signal theme.
 *
 * Shows today's EXPEDITION-axis DMN draws earned toward the daily cap.
 * Daily-cap aware: once the cap is reached it renders an explicit terminal
 * state (「今日抽卡已達上限」) instead of a misleading countdown.
 *
 * Data source is the DMN expedition axis (`readDmnMeta`,
 * `dmnTimeAxisDrawsConsumedToday` = expedition draws today,
 * `dmnTimeAxisMinutesAccrued` = cumulative expedition clears today; legacy key
 * names per add-neurons-expedition-rewards). Live via Dexie liveQuery so it
 * advances as the player clears wrong-questions in 出征.
 *
 * Spec: openspec/specs/neurons-homepage/spec.md
 *   "Homepage SHALL display a cap-aware 'next DMN draw' progress ring driven by
 *    real reading-timer data" (rendered in its bar form; data source = expedition axis)
 */

import { memo, useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { DMN_EXPEDITION_DAILY_CAP } from '@study-rpg/content-neurons-tw'
import { EmojiIcon } from './EmojiIcon'
import { readDmnMeta } from '../lib/services/dmn-trigger'

interface BarState {
  clearsToday: number
  drawsToday: number
  drawsAvailable: number
  capped: boolean
}

// Propless + self-subscribing, so memo lets the parent card's 詳細 toggle re-render
// without re-running this live-data bar.
export const DmnDrawProgressRing = memo(function DmnDrawProgressRing(): JSX.Element {
  const [state, setState] = useState<BarState | null>(null)

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

  // capped ⟹ drawsToday ≥ CAP, so Math.min already yields 1 in that case.
  const fraction = state ? Math.min(1, state.drawsToday / DMN_EXPEDITION_DAILY_CAP) : 0
  const fillColor = state?.capped ? '#e0992f' : '#3a9b8f'

  const countLabel = (() => {
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
      <div style={headerRowStyle}>
        <span style={labelStyle}><EmojiIcon char="💎" size={13} decorative /> DMN 抽卡</span>
        <span style={countStyle}>{countLabel}</span>
      </div>
      <div
        style={trackStyle}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={DMN_EXPEDITION_DAILY_CAP}
        aria-valuenow={state?.drawsToday ?? 0}
      >
        <div style={{ ...fillStyle, width: `${fraction * 100}%`, background: fillColor }} />
      </div>
      <span style={captionStyle}>{caption}</span>
    </div>
  )
})

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  width: '100%',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '0.4rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const countStyle: React.CSSProperties = {
  fontFamily: 'var(--font-pixel-num)',
  fontSize: '0.9rem',
  color: '#5a3f29',
}

const trackStyle: React.CSSProperties = {
  height: '10px',
  width: '100%',
  background: '#e3d5bd',
  border: '1px solid #cdb892',
  borderRadius: '999px',
  overflow: 'hidden',
}

const fillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: '999px',
  transition: 'width 0.5s ease',
}

const captionStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#6b5640',
  lineHeight: 1.4,
}
