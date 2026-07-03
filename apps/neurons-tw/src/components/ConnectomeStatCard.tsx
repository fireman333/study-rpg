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
import { useDmnStatus } from '../lib/hooks/useDmnStatus'
import DmnDrawModal from './DmnDrawModal'

// Cap the「神經連結」list so a power player with many links doesn't flood the card;
// connections arrive strong→weak ranked, so the strongest survive the slice.
const MAX_CONNECTIONS_SHOWN = 6

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
  totalStudyMin: number
}

export function ConnectomeStatCard({
  status,
  hasEverAnsweredWrong,
  wrongCount,
  onExpedition,
  variants,
  totalStudyMin,
}: Props): JSX.Element {
  const todayCompleted = status?.todayCompleted ?? false
  const streak = status?.streak ?? 0
  const stableLinks = status?.stableLinks ?? 0
  const weeklyCount = status?.weeklyCount ?? 0
  const connections = status?.connections ?? []
  const todayConductionEnergy = status?.todayConductionEnergy ?? 0

  // DMN draw action, relocated from the retired top-nav DmnDrawButton into this card's DMN stage
  // (consolidate-neurons-dmn-draw-surface). Consumables are repeatable
  // (make-neurons-dmn-consumables-repeatable) → enabled iff a draw ticket is available.
  const dmn = useDmnStatus()
  const [dmnModalOpen, setDmnModalOpen] = useState(false)
  const canDraw = dmn.drawsAvailable >= 1

  return (
    // data-tutorial="connectome-status": stable onboarding-spotlight anchor (tutorial agent contract).
    <section style={cardStyle} aria-label="今日學習儀表板" data-tutorial="connectome-status">
      {/* ── Top band: ⚔️ primary CTA, or new-player guidance (one-way reveal) ── */}
      {hasEverAnsweredWrong ? (
        <button
          type="button"
          style={wrongCount > 0 ? ctaStyle : ctaDisabledStyle}
          onClick={onExpedition}
          disabled={wrongCount === 0}
          // data-tutorial="expedition": onboarding-spotlight anchor. NOTE: this button only mounts
          // once hasEverAnsweredWrong (one-way reveal) — absent for a never-wrong new player.
          data-tutorial="expedition"
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
          <span style={signalStyle}>📅 本週 {weeklyCount}/7</span>
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
          {canDraw ? (
            <button
              type="button"
              onClick={() => setDmnModalOpen(true)}
              style={dmnDrawCtaStyle}
              title={`你有 ${dmn.drawsAvailable} 次 DMN 抽卡可用`}
              aria-label={`抽 ${dmn.drawsAvailable} 張 DMN`}
            >
              ▶ 抽 {dmn.drawsAvailable} 張 DMN
            </button>
          ) : null}
        </div>
      </div>

      {hasEverAnsweredWrong && connections.length === 0 && (
        <p style={emptyHintStyle}>
          還沒有跨科連線——出征修復錯題滿門檻，就會在腦圖長出第一條突觸連線。
        </p>
      )}

      {/* 神經連結：列出玩家已建立的跨科連線（弱連結 / 強連結；dormant 早期連線不列）與其
          真實層級。目的是讓玩家看清每條連線離「連結神經元」還差多遠——weak 連線不會被誤讀成
          已達頂點卻沒拿到 connector（bug report 2026-07-03）。連結神經元只在連線升到「強連結」
          時長出；升級是逐日 gated（弱→強＝再完成一次合格共同出征），非題數累積，故不用 X/Y 進度。 */}
      {connections.length > 0 && (
        <div style={connectionsBlockStyle}>
          <span style={connectionsLabelStyle}>
            <EmojiIcon char="🔗" size={13} /> 神經連結
          </span>
          <span style={connectionsListStyle}>
            {connections.slice(0, MAX_CONNECTIONS_SHOWN).map((c) => (
              <span key={c.pairKey} style={connChipStyle(c.state)}>
                {c.pairKey.replace('|', '–')}（{c.state === 'strong' ? '強連結 ✓' : '弱連結'}）
              </span>
            ))}
            {connections.length > MAX_CONNECTIONS_SHOWN && (
              <span style={connMoreStyle}>＋{connections.length - MAX_CONNECTIONS_SHOWN} 條</span>
            )}
          </span>
        </div>
      )}

      {/* 只要還有 weak 連線就提示解鎖路徑（強連結 → 長出連結神經元）；全 strong 時不再提示。 */}
      {connections.some((c) => c.state === 'weak') && (
        <p style={emptyHintStyle}>
          弱連結：兩科再一起出征、當天各修 ≥2 題升級一次 → 強連結，就會長出這兩科的連結神經元。
        </p>
      )}

      {todayConductionEnergy > 0 && (
        <div style={detailRowStyle}>
          <span>⚡ 今日連線 +{todayConductionEnergy}</span>
        </div>
      )}

      {/* ── Total-collection chips, folded into the card in its cream theme
            (fix-neurons-dashboard-card-rwd). Wraps on narrow widths. ── */}
      <div style={collectionRowStyle} aria-label="收藏進度">
        <span style={collectionChipStyle}>
          🧬 變體 <b style={collectionValStyle}>{variants}</b> 隻
        </span>
        <span style={collectionChipStyle}>
          💎 DMN <b style={collectionValStyle}>{dmn.collectionOwned}</b> / {dmn.collectionTotal}
        </span>
        <span style={collectionChipStyle}>
          📖 累積閱讀 <b style={collectionValStyle}>{totalStudyMin}</b> min
        </span>
      </div>

      {dmnModalOpen && <DmnDrawModal onClose={() => setDmnModalOpen(false)} />}
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
  // box-sizing: width:100% + padding + border must stay inside the card; without
  // border-box the box bleeds ~36px past the card edge (visible "超出框框" on iPhone).
  boxSizing: 'border-box',
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
  boxSizing: 'border-box', // keep the guidance box inside the card (see ctaStyle)
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

// DMN draw action, hosted in the card's DMN stage (relocated from the retired top-nav button).
// Purple (#5d4ec4) matches the prior DmnDrawButton so the affordance reads the same; full-width
// inside the stage with border-box so padding+border never bleed past the stage edge.
const dmnDrawCtaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  marginTop: '0.1rem',
  padding: '0.35rem 0.6rem',
  border: '2px solid #2d2055',
  borderRadius: '6px',
  background: '#5d4ec4',
  color: '#fff',
  fontFamily: 'inherit',
  fontSize: '0.82rem',
  fontWeight: 700,
  letterSpacing: '0.03em',
  cursor: 'pointer',
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

// ── 神經連結 list (wire-connections tier chips) ──
const connectionsBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
}

const connectionsLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const connectionsListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.3rem',
}

// weak = neutral cream chip; strong = terracotta accent (matches the card's earned-state palette).
const connChipStyle = (state: 'weak' | 'strong'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.12rem 0.5rem',
  borderRadius: '999px',
  fontSize: '0.78rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  border: state === 'strong' ? '1px solid #c98a4a' : '1px solid #ddccae',
  background: state === 'strong' ? '#f6e3cd' : '#fffdf8',
  color: state === 'strong' ? '#8a4a2a' : '#6b5640',
})

const connMoreStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: '0.76rem',
  color: '#9a7c56',
  fontWeight: 600,
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
