/**
 * DailyPrescriptionCard — 今日處方箋 (the "open" half of the daily one-open-one-close
 * ritual). The homepage's TOPMOST surface, mounted directly ABOVE the merged stat
 * card. It kills decision-paralysis in the final exam sprint: two small lines and
 * ONE primary CTA that always routes to the next incomplete line, so the player
 * never has to choose a mode.
 *
 * Presentation only — every value comes from the prescription service via
 * usePrescriptionStatus; this card never computes or mutates prescription state.
 *
 * Anti-anxiety contract (Decision 5 / neurons-daily-prescription spec):
 *   - 醫囑語氣, non-punishing microcopy.
 *   - NO red / broken / "behind" / streak-break / guilt states anywhere.
 *   - 已固化 X 天 has NO fixed denominator (never renders an unreachable X/N).
 *   - Exam countdown is ambient chrome only; after the exam it switches to a
 *     non-punishing「考試結束 · 繼續固化」and never gates maturation.
 *   - Degrades under prefers-reduced-motion (no transitions).
 *
 * Spec: openspec/specs/neurons-daily-prescription/spec.md
 */

import { Link } from 'react-router-dom'
import type { PrescriptionStatus } from '../lib/services/prescription'
import {
  daysUntilExam,
  NG0717_FULL_MATURITY,
} from '../lib/services/prescription'
import { todayISO } from '../lib/db'
import { useRespectsReducedMotion } from '../lib/motion/useRespectsReducedMotion'
import { EmojiIcon } from './EmojiIcon'
import { Ng0717BranchBuds, type EnrichedImprint } from './Ng0717BranchBuds'
import ng0717Stage1 from '../assets/ng0717/stage1.png'
import ng0717Stage2 from '../assets/ng0717/stage2.png'
import ng0717Stage3 from '../assets/ng0717/stage3.png'
import ng0717Stage4 from '../assets/ng0717/stage4.png'

// stage 1→4 map; stage 0 (no completions yet) → show stage1 at reduced opacity.
const STAGE_SPRITE = [ng0717Stage1, ng0717Stage1, ng0717Stage2, ng0717Stage3, ng0717Stage4] as const
const STAGE_LABEL = [
  '新生神經元的種子',
  '新生幹細胞',
  '遷移中的神經母細胞',
  '正在佈線的未成熟神經元',
  '成熟整合的神經元 ✓',
] as const

/** Compact 民國-year scope label: contiguous → "113–114", else "114、112". */
function formatYearScope(years: number[]): string {
  const sorted = [...years].sort((a, b) => a - b)
  const contiguous = sorted.every((y, i) => i === 0 || y === sorted[i - 1] + 1)
  return contiguous && sorted.length > 1
    ? `${sorted[0]}–${sorted[sorted.length - 1]}`
    : [...sorted].reverse().join('、')
}

interface Props {
  /** Engine-computed prescription status; null while loading. */
  status: PrescriptionStatus | null
  /** Device-local collapse state (default expanded). */
  collapsed: boolean
  onToggleCollapse: () => void
  /** Single primary CTA — routes to the next incomplete line (wrong → breadth). */
  onStartPrescription: () => void
  /** Grown NG-0717 lineage imprints, enriched with per-subject colour + label. */
  branchImprints: EnrichedImprint[]
}

export function DailyPrescriptionCard({
  status,
  collapsed,
  onToggleCollapse,
  onStartPrescription,
  branchImprints,
}: Props): JSX.Element | null {
  const prefersReduced = useRespectsReducedMotion()

  // Loading / no-plan-yet: render nothing so the card never flashes an empty box.
  if (!status || !status.plan) return null

  const {
    plan,
    wrongDone,
    breadthDone,
    dayComplete,
    completedDayCount,
    ng0717Stage,
    keepsakeUnlocked,
  } = status
  const wrongAutoSatisfied = plan.wrongTarget <= 0
  // No eligible 開發新連結 family this day (e.g. all in-scope connections seen).
  const breadthEmpty = plan.breadthFamilyId == null
  const breadthLabel = plan.breadthFamilyLabel ?? '新連結科目'
  // Show the academic subject (breadthFamilyId, e.g. 微生物學) alongside the neuron
  // persona so the player knows which 科目 the 開發新連結 line targets. Only rendered
  // in the non-empty branch (breadthFamilyId guaranteed present there).
  const breadthTitle = `${plan.breadthFamilyId} · ${breadthLabel}`
  // Range chip: only when the frozen plan scope is a strict subset of all years.
  const yearScopeLabel = plan.yearScope ? formatYearScope(plan.yearScope) : null
  // Completed with nothing assignable inside a narrowed scope → point at the year bar.
  const scopeExhausted =
    plan.wrongTarget <= 0 && plan.breadthTarget <= 0 && plan.yearScope != null

  // Ambient exam countdown chrome (never gates progress).
  const days = daysUntilExam(todayISO())
  const countdownText =
    days > 0 ? `距考試還有 ${days} 天` : '考試結束 · 繼續固化'

  const spriteSrc = STAGE_SPRITE[ng0717Stage] ?? STAGE_SPRITE[0]
  const spriteLabel = STAGE_LABEL[ng0717Stage] ?? STAGE_LABEL[0]

  // ── Collapsed: a slim summary strip. ──
  if (collapsed) {
    return (
      <button
        type="button"
        style={summaryStripStyle}
        onClick={onToggleCollapse}
        aria-label="展開今日處方箋"
        aria-expanded={false}
      >
        <span style={stripMainStyle}>
          <EmojiIcon char="📋" size={15} /> 今日處方
        </span>
        <span style={stripPartsStyle}>
          <span>修補 {wrongAutoSatisfied ? '✓' : `${wrongDone}/${plan.wrongTarget}`}</span>
          <span>{breadthEmpty ? '新連結 ✓' : `新連結 ${breadthDone}/${plan.breadthTarget}`}</span>
          <span>已固化 {completedDayCount} 天</span>
        </span>
        <span style={stripChevStyle} aria-hidden>▾</span>
      </button>
    )
  }

  // ── Expanded: the full card. ──
  return (
    <section style={cardStyle} aria-label="今日處方箋">
      <header style={headerRowStyle}>
        <span style={titleStyle}>
          <EmojiIcon char="📋" size={17} /> 今日處方箋
        </span>
        <button
          type="button"
          style={collapseBtnStyle}
          onClick={onToggleCollapse}
          aria-label="收合今日處方箋"
          aria-expanded={true}
        >
          ▴ 收合
        </button>
      </header>

      <p style={leadStyle}>今天做這兩件小事就好，其餘交給每天一點的累積。</p>

      {yearScopeLabel && (
        <p style={rangeChipStyle} aria-label={`今日處方範圍：民國 ${yearScopeLabel} 年`}>
          <EmojiIcon char="🗂" size={12} /> 依目前年份範圍穩定練習 · {yearScopeLabel}
        </p>
      )}

      {/* Two prescription lines. */}
      <div style={linesWrapStyle}>
        <div style={lineRowStyle}>
          <span style={lineLabelStyle}>
            <EmojiIcon char="🩹" size={14} /> 修補連結
          </span>
          <span style={wrongAutoSatisfied ? lineDoneStyle : lineProgStyle}>
            {wrongAutoSatisfied ? '今日無待修補連結 ✓' : `${wrongDone}/${plan.wrongTarget}`}
          </span>
        </div>
        {breadthEmpty ? (
          <div style={lineRowStyle}>
            <span style={lineLabelStyle}>
              <EmojiIcon char="🔍" size={14} /> 開發新連結
            </span>
            <span style={lineDoneStyle}>範圍內連結已巡過 ✓</span>
          </div>
        ) : (
          <div style={lineRowStyle}>
            <span style={lineLabelStyle}>
              <EmojiIcon char="🔍" size={14} /> 開發新連結：{breadthTitle}
            </span>
            <span style={breadthDone >= plan.breadthTarget ? lineDoneStyle : lineProgStyle}>
              {breadthDone}/{plan.breadthTarget}
            </span>
          </div>
        )}
      </div>

      {/* Single primary CTA — routes to the next incomplete line, or a calm
          completed state (no route). */}
      {dayComplete ? (
        <div style={completedStyle}>
          <EmojiIcon char="✅" size={16} />{' '}
          {scopeExhausted
            ? '範圍內今日已巡過 · 可於上方放寬年份，或今日到此為止'
            : '今日處方已完成 · 好好收工'}
        </div>
      ) : (
        <button
          type="button"
          style={ctaStyle}
          onClick={onStartPrescription}
        >
          開始今日處方
        </button>
      )}

      {/* Low-salience exit to 考前猜題 — optional exam-eve resource, secondary to the
          primary CTA; no badge / count / countdown (anti-anxiety contract). */}
      <Link to="/cram" style={cramLinkStyle}>考前？看高頻考點 →</Link>

      {/* NG-0717 mascot + cumulative「已固化 X 天」(no fixed denominator). */}
      <div style={mascotRowStyle}>
        <img
          src={spriteSrc}
          alt={`NG-0717 · ${spriteLabel}`}
          width={56}
          height={56}
          style={{
            ...mascotImgStyle,
            imageRendering: 'pixelated',
            opacity: ng0717Stage === 0 ? 0.45 : 1,
            transition: prefersReduced ? 'none' : 'opacity 0.4s ease',
          }}
        />
        <div style={mascotTextStyle}>
          <span style={mascotNameStyle}>NG-0717 · {spriteLabel}</span>
          <span style={mascotCountStyle}>已固化 {completedDayCount} 天</span>
          {keepsakeUnlocked ? (
            <span style={keepsakeStyle}>💠 完全體 · 永久紀念 2026.07.17</span>
          ) : (
            <span style={mascotHintStyle}>
              完成處方讓 NG-0717 逐步成熟（第 {NG0717_FULL_MATURITY} 天完全體）
            </span>
          )}
        </div>
      </div>

      {/* NG-0717 分支印記 — dendritic buds grown by covering subjects (only grown
          buds render; no denominator/gap). */}
      <Ng0717BranchBuds imprints={branchImprints} />

      {/* Ambient exam countdown — chrome only, never a deficit. */}
      <p style={countdownStyle} aria-label="考試倒數（僅供參考）">
        <EmojiIcon char="🗓" size={13} decorative /> {countdownText}
      </p>
    </section>
  )
}

// ── Styles (vanilla CSS-in-JS, cream theme to match ConnectomeStatCard) ──

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fdf6e3 0%, #f6ecd6 100%)',
  border: '2px solid #c9a86a',
  borderRadius: '8px',
  padding: '0.85rem 1rem',
  marginBottom: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
}

const titleStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '1.02rem',
  fontWeight: 700,
  color: '#3a2a1a',
}

const collapseBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#8a6a3a',
  fontFamily: 'inherit',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: '0.15rem 0.3rem',
}

const leadStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#5a3f29',
  lineHeight: 1.5,
}

const rangeChipStyle: React.CSSProperties = {
  margin: 0,
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.15rem 0.5rem',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#7a5c3a',
  background: '#f3e7cc',
  border: '1px solid #e0cfa8',
  borderRadius: '999px',
}

const linesWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
}

const lineRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  padding: '0.45rem 0.6rem',
  background: '#fffdf8',
  border: '1px solid #e6d6b8',
  borderRadius: '6px',
}

const lineLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '0.9rem',
  fontWeight: 600,
  color: '#5a3f29',
  minWidth: 0,
}

const lineProgStyle: React.CSSProperties = {
  fontFamily: 'var(--font-pixel-num)',
  fontSize: '1rem',
  color: '#a85530',
  whiteSpace: 'nowrap',
}

const lineDoneStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#4d8c4d',
  whiteSpace: 'nowrap',
}

const ctaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.65rem 1rem',
  borderRadius: '6px',
  border: '2px solid #e0a44a',
  background: 'linear-gradient(135deg, #c06a3a 0%, #a85530 100%)',
  color: '#fff',
  fontFamily: 'inherit',
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 0 0 2px rgba(255,255,255,0.18)',
}

const completedStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.35rem',
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.6rem 1rem',
  borderRadius: '6px',
  border: '2px solid #a8c99a',
  background: '#eef6e8',
  color: '#3f6b34',
  fontWeight: 700,
  fontSize: '0.95rem',
}

// Low-salience 考前猜題 exit — subtle, secondary to the primary CTA (anti-anxiety).
const cramLinkStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '0.5rem',
  textAlign: 'center',
  fontSize: '0.8rem',
  color: '#8c6d4a',
  textDecoration: 'none',
}

const mascotRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.7rem',
  padding: '0.55rem 0.6rem',
  background: '#fffdf8',
  border: '1px solid #e6d6b8',
  borderRadius: '6px',
}

const mascotImgStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 56,
  height: 56,
}

const mascotTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  minWidth: 0,
}

const mascotNameStyle: React.CSSProperties = {
  fontSize: '0.86rem',
  fontWeight: 700,
  color: '#5a3f29',
}

const mascotCountStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#a85530',
}

const mascotHintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#7a5c3a',
  lineHeight: 1.4,
}

const keepsakeStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#7a5aa8',
}

const countdownStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  color: '#8a6a48',
  fontWeight: 600,
}

// ── Collapsed summary strip ──
const summaryStripStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.55rem 0.85rem',
  marginBottom: '1rem',
  background: 'linear-gradient(135deg, #fdf6e3 0%, #f6ecd6 100%)',
  border: '2px solid #c9a86a',
  borderRadius: '8px',
  color: '#5a3f29',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
}

const stripMainStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#3a2a1a',
  whiteSpace: 'nowrap',
}

const stripPartsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.3rem 0.7rem',
  flex: 1,
  minWidth: 0,
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#6b5640',
}

const stripChevStyle: React.CSSProperties = {
  color: '#8a6a3a',
  fontWeight: 800,
  fontSize: '0.9rem',
}
