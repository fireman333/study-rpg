/**
 * ConnectomeStatCard — the homepage's merged daily-loop stat card (top dashboard,
 * above the maze), per redesign-neurons-homepage-cta. Folds three previously
 * separate surfaces into one themed light card:
 *   - top band: ⚔️ 錯題出征 primary CTA (one-way reveal per neurons-onboarding;
 *     a never-wrong new player sees guidance text in the slot, not a dead button)
 *   - body: a horizontal causal chain 今日出征狀態 → 修復連線數據 → DMN 抽卡 進度
 *     (the standalone connectome status strip + standalone DMN ring are gone)
 *   - core signals shown by default; a 「詳細」 disclosure reveals 本週 / 最強 pair /
 *     ⚡今日連線額外能量
 *
 * Presentation only — every value is engine-computed and passed in; this card
 * never grants or computes connectome / DMN state.
 *
 * Spec: openspec/specs/neurons-homepage/spec.md
 *   "Homepage SHALL compose as a CTA toolbar over the interactive tree panel…"
 */

import { useState } from 'react'
import type { ConnectomeStatus } from '../lib/services/connectome'
import { DmnDrawProgressRing } from './DmnDrawProgressRing'
import { EmojiIcon } from './EmojiIcon'

interface Props {
  /** Engine-computed connectome status; null while loading (renders zeroed). */
  status: ConnectomeStatus | null
  /** One-way reveal gate (per neurons-onboarding): false → guidance text, not a button. */
  hasEverAnsweredWrong: boolean
  /** Current cross-subject wrong-question count (drives the CTA badge + disabled state). */
  wrongCount: number
  /** Opens the cross-subject wrong-question expedition drill directly. */
  onExpedition: () => void
  /** Total-collection chips folded into the card (🧬 collected / 💎 DMN owned / 📖 reading min). */
  variants: number
  dmnOwned: number
  totalStudyMin: number
}

export function ConnectomeStatCard({
  status,
  hasEverAnsweredWrong,
  wrongCount,
  onExpedition,
  variants,
  dmnOwned,
  totalStudyMin,
}: Props): JSX.Element {
  const [showDetail, setShowDetail] = useState(false)

  const todayCompleted = status?.todayCompleted ?? false
  const streak = status?.streak ?? 0
  const stableLinks = status?.stableLinks ?? 0
  const weeklyCount = status?.weeklyCount ?? 0
  const strongestPair = status?.strongestPair ?? null
  const todayConductionEnergy = status?.todayConductionEnergy ?? 0

  return (
    <section style={cardStyle} aria-label="今日學習儀表板">
      {/* ── Top band: ⚔️ primary CTA, or new-player guidance (one-way reveal) ── */}
      {hasEverAnsweredWrong ? (
        <button
          type="button"
          style={wrongCount > 0 ? ctaStyle : ctaDisabledStyle}
          onClick={onExpedition}
          disabled={wrongCount === 0}
          aria-label="錯題出征：修復錯題建立連線"
          title="修復跨科錯題＝在腦圖上建立突觸連線（同時獲得 DMN 抽卡）"
        >
          <span style={ctaMainStyle}>
            <span>
              <EmojiIcon char="⚔️" size={18} /> 錯題出征
            </span>
            <span style={ctaBadgeStyle}>{wrongCount === 0 ? '無錯題' : `${wrongCount} 題`}</span>
          </span>
          <span style={ctaSubStyle}>🔗 修復錯題＝建立連線 → 抽 DMN</span>
        </button>
      ) : (
        <div style={ctaGuidanceStyle}>
          <span>
            <EmojiIcon char="⚔️" size={18} /> 答錯題開始修復連線
          </span>
          <span style={ctaGuidanceSubStyle}>
            答錯的題目會進錯題本；出征修復＝在腦圖建立突觸連線，同時抽 DMN
          </span>
        </div>
      )}

      {/* ── Causal-chain body: 今日出征狀態 → 修復連線數據 → DMN 抽卡 進度.
            Responsive via styles.css: vertical stack + ↓ on < 520px, horizontal + → at ≥520px. ── */}
      <div className="neurons-stat-stages">
        <div className="neurons-stat-stage" style={stageStyle}>
          <span style={signalStyle}>今日出征 {todayCompleted ? '✓' : '✗'}</span>
          <span style={signalStyle}>🔥 連續 {streak} 天</span>
        </div>
        <span className="neurons-stat-arrow" style={arrowStyle} aria-hidden>
          →
        </span>
        <div className="neurons-stat-stage" style={stageStyle}>
          <span style={signalStyle}>🔗 穩定連線 {stableLinks}</span>
        </div>
        <span className="neurons-stat-arrow" style={arrowStyle} aria-hidden>
          →
        </span>
        <div className="neurons-stat-stage neurons-stat-stage--dmn" style={stageStyle}>
          <DmnDrawProgressRing />
        </div>
      </div>

      {hasEverAnsweredWrong && stableLinks === 0 && (
        <p style={emptyHintStyle}>
          還沒有跨科連線——出征修復錯題滿門檻，就會在腦圖長出第一條突觸連線。
        </p>
      )}

      {showDetail && (
        <div style={detailRowStyle}>
          <span>本週 {weeklyCount}/7</span>
          {strongestPair && <span>· 最強 {strongestPair.replace('|', '–')}</span>}
          {todayConductionEnergy > 0 && <span>· ⚡ 今日連線 +{todayConductionEnergy}</span>}
        </div>
      )}

      <button
        type="button"
        style={detailToggleStyle}
        onClick={() => setShowDetail((v) => !v)}
        aria-expanded={showDetail}
      >
        {showDetail ? '▴ 收合' : '▾ 詳細'}
      </button>

      {/* ── Total-collection chips, folded into the card in its cream theme
            (fix-neurons-dashboard-card-rwd). Wraps on narrow widths. ── */}
      <div style={collectionRowStyle} aria-label="收藏進度">
        <span style={collectionChipStyle}>
          🧬 變體 <b style={collectionValStyle}>{variants}</b> 隻
        </span>
        <span style={collectionChipStyle}>
          💎 DMN <b style={collectionValStyle}>{dmnOwned}</b> / 20
        </span>
        <span style={collectionChipStyle}>
          📖 累積閱讀 <b style={collectionValStyle}>{totalStudyMin}</b> min
        </span>
      </div>
    </section>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#fbf5ea',
  border: '2px solid #d8c4a8',
  borderRadius: '8px',
  padding: '0.85rem 1rem',
  marginBottom: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
}

// ⚔️ 錯題出征 = the prominent primary connectome-building CTA. Terracotta base + a
// static synaptic-cyan glow ring signals "this wires the brain"; the glow is a
// box-shadow (no animation) so it degrades cleanly under prefers-reduced-motion.
const ctaStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: '0.18rem',
  width: '100%',
  padding: '0.6rem 1rem',
  borderRadius: '6px',
  border: '2px solid #e0a44a',
  background: 'linear-gradient(135deg, #c06a3a 0%, #a85530 100%)',
  color: '#fff',
  fontFamily: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 0 0 2px rgba(255,255,255,0.18), 0 0 14px 1px rgba(64, 210, 200, 0.55)',
}

const ctaDisabledStyle: React.CSSProperties = {
  ...ctaStyle,
  background: '#cbb89f',
  border: '2px solid #b8a07a',
  boxShadow: 'none',
  opacity: 0.7,
  cursor: 'not-allowed',
}

const ctaMainStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  fontSize: '1.02rem',
}

const ctaSubStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  opacity: 0.92,
  letterSpacing: '0.2px',
}

const ctaBadgeStyle: React.CSSProperties = {
  padding: '0.1rem 0.45rem',
  background: 'rgba(255,255,255,0.25)',
  borderRadius: '999px',
  fontSize: '0.78em',
  fontWeight: 600,
}

const ctaGuidanceStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  width: '100%',
  padding: '0.6rem 1rem',
  borderRadius: '6px',
  border: '2px dashed #d8a06a',
  background: '#fdf2e8',
  color: '#8a4a2a',
  fontWeight: 700,
  fontSize: '1.02rem',
}

const ctaGuidanceSubStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#a06a47',
}

// Stage visuals only; flex/direction/wrap + the per-stage basis are driven by the
// `.neurons-stat-stages` / `.neurons-stat-stage` CSS classes (responsive, styles.css).
const stageStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '0.25rem',
  padding: '0.5rem 0.6rem',
  background: '#fffdf8',
  border: '1px solid #e6d6b8',
  borderRadius: '6px',
}

const signalStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#5a3f29',
  fontWeight: 600,
}

const arrowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  alignSelf: 'center',
  color: '#b08a5a',
  fontWeight: 800,
  fontSize: '1.1rem',
}

const emptyHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  color: '#7a5c3a',
  lineHeight: 1.5,
}

const detailRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.3rem',
  fontSize: '0.8rem',
  color: '#6b5640',
}

const detailToggleStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#9a7a52',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

// Total-collection chips folded into the card (cream theme, wraps on narrow).
const collectionRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.3rem 0.7rem',
  paddingTop: '0.55rem',
  marginTop: '0.1rem',
  borderTop: '1px solid #e6d6b8',
  fontSize: '0.82rem',
  color: '#6b5640',
  fontWeight: 600,
}

const collectionChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '0.28rem',
  whiteSpace: 'nowrap',
}

const collectionValStyle: React.CSSProperties = {
  fontFamily: 'var(--font-pixel-num)',
  fontSize: '1.05rem',
  color: '#a85530',
  fontWeight: 400,
}
