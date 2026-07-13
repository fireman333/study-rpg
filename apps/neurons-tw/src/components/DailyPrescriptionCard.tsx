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

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PrescriptionStatus, TierRungStatus } from '../lib/services/prescription'
import { daysUntilExam, TIER_ENERGY } from '../lib/services/prescription'
import { todayISO } from '../lib/db'
import { useRespectsReducedMotion } from '../lib/motion/useRespectsReducedMotion'
import { EmojiIcon } from './EmojiIcon'
import { CramCalmView } from './CramCalmView'
import {
  DAY_COMPLETE_LINE,
  CRAM_RESCUE_INVITE,
  CRAM_RESCUE_DONE,
  CRAM_RESCUE_FLAVOR,
  NG0717_OPEN_HINT,
  NG0717_KEEPSAKE_LINE,
  TIER_PANEL_LEAD,
  TIER_T2_NAME,
  TIER_T3_NAME,
  TIER_T4_NAME,
  TIER_T2_INVITE_WRONG,
  TIER_T2_INVITE_BREADTH,
  TIER_T2_INVITE_CRAM,
  TIER_T3_INVITE,
  TIER_T4_INVITE,
  TIER_REACHED_MARK,
  TIER_ENERGY_LABEL,
} from '../lib/calm-copy'
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
  // 考前收斂 calm view expand state (device+session local; default collapsed). Only
  // used when dayComplete — mounting CramCalmView lazily loads cram.json on expand.
  const [calmOpen, setCalmOpen] = useState(false)
  // T3 ephemeral glow (add-neurons-prescription-tiers-and-sync): a transient
  // this-session-only effect fired when the DISPLAYED tier crosses ≥3 while the
  // card is mounted. Never persisted — a reload / pull-rendered T3 state shows
  // no glow (the ref seeds from the first observed value, so only a genuine
  // in-session crossing triggers it).
  const [t3Glow, setT3Glow] = useState(false)
  const prevDisplayTierRef = useRef<number | null>(null)
  const displayTier = status?.tier?.displayTier ?? null
  useEffect(() => {
    if (displayTier == null) return
    const prev = prevDisplayTierRef.current
    prevDisplayTierRef.current = displayTier
    if (prev != null && prev < 3 && displayTier >= 3) {
      setT3Glow(true)
      const t = setTimeout(() => setT3Glow(false), 2600)
      return () => clearTimeout(t)
    }
  }, [displayTier])

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
    cramRescueDone,
    tier,
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

      {/* Action row — two side-by-side buttons: 高頻考點 (→ /cram) + 今日處方
          (primary CTA; a non-routing completed state when both lines are done). The
          高頻考點 button carries no badge / count / countdown (anti-anxiety). */}
      <div style={actionRowStyle}>
        <Link to="/cram" style={halfCramBtnStyle}>高頻考點</Link>
        {dayComplete ? (
          <div style={halfDoneBtnStyle}>
            <EmojiIcon char="✅" size={15} decorative /> 今日完成
          </div>
        ) : (
          <button type="button" style={halfPrescBtnStyle} onClick={onStartPrescription}>
            今日處方
          </button>
        )}
      </div>

      {/* dayComplete → one coherent 收束 area: completion line + optional 考前救援
          bonus + 今天留下的連結 calm toggle. The bonus NEVER reads as 未完成/繼續 and does
          not affect dayComplete or NG-0717 (flavor reward only). Celebration-once
          (design D9): this whole area is a STATE render, not a celebration — the
          「今日處方箋完成」note plays only in QuizModal on the local `justCompleted`
          transition, so a device that learns of completion via a pulled bundle
          renders this completed state silently with no second celebration. */}
      {dayComplete && (
        <div style={completeAreaStyle}>
          <p style={completeLineStyle}>
            {scopeExhausted ? '範圍內今日已巡過 · 這樣就夠了' : DAY_COMPLETE_LINE}
          </p>
          {cramRescueDone ? (
            <p style={rescueDoneStyle}>
              {CRAM_RESCUE_DONE} · {CRAM_RESCUE_FLAVOR}
            </p>
          ) : (
            <p style={rescueInviteStyle}>{CRAM_RESCUE_INVITE}</p>
          )}
          <div style={calmWrapStyle}>
            <button
              type="button"
              style={calmToggleStyle}
              onClick={() => setCalmOpen((v) => !v)}
              aria-expanded={calmOpen}
            >
              {calmOpen ? '▴ 今天留下的連結' : '▾ 今天留下的連結'}
            </button>
            {calmOpen && <CramCalmView />}
          </div>
        </div>
      )}

      {/* Tier ladder panel (add-neurons-prescription-tiers-and-sync) — PROGRESSIVE
          DISCLOSURE: renders ONLY once T1 (dayComplete) is done; before that there
          are NO rows, NO locked placeholders, NO teasers (mirrors the 考前救援
          visibility gate above). Un-reached rungs use invite tone only; reached
          rungs use the claim-floor `displayTier` so a rung the player saw reached
          never reads as lost. T3 carries the ephemeral glow; T4's ✓ a purely
          cosmetic pulse (no power / stat — decoration only). */}
      {dayComplete && tier && (tier.t2 || tier.t3 || tier.t4) && (
        <div style={tierPanelStyle} aria-label="處方加深選項">
          <p style={tierLeadStyle}>{TIER_PANEL_LEAD}</p>
          {tier.t2 && (
            <TierRow
              emoji="🩹"
              name={TIER_T2_NAME}
              reached={tier.displayTier >= 2}
              energy={TIER_ENERGY[2]}
              rung={tier.t2}
              invite={
                tier.t2.kind === 'wrongOverflow'
                  ? TIER_T2_INVITE_WRONG
                  : tier.t2.kind === 'breadth'
                    ? TIER_T2_INVITE_BREADTH
                    : TIER_T2_INVITE_CRAM
              }
            />
          )}
          {tier.t3 && (
            <TierRow
              emoji="🔗"
              name={TIER_T3_NAME}
              reached={tier.displayTier >= 3}
              energy={TIER_ENERGY[3]}
              rung={tier.t3}
              invite={TIER_T3_INVITE}
              glow={t3Glow && !prefersReduced}
            />
          )}
          {tier.t4 && (
            <TierRow
              emoji="⛰"
              name={TIER_T4_NAME}
              reached={tier.displayTier >= 4}
              energy={TIER_ENERGY[4]}
              rung={{
                target: tier.t4.corrections.target,
                done: tier.t4.corrections.done,
                complete: tier.t4.complete,
              }}
              extraRung={tier.t4.synapses}
              invite={TIER_T4_INVITE}
              pulse={tier.displayTier >= 4 && !prefersReduced}
            />
          )}
        </div>
      )}

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
            <span style={keepsakeStyle}><EmojiIcon char="💠" size={13} decorative /> 成熟印記 · {NG0717_KEEPSAKE_LINE}</span>
          ) : (
            <span style={mascotHintStyle}>{NG0717_OPEN_HINT}</span>
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

/**
 * One tier rung row. Reached → acknowledgement + flat-energy note (claim-floor:
 * `reached` derives from displayTier, so it never regresses within the day).
 * Un-reached → capped progress numbers + invite-tone line (never a deficit).
 * `glow` = the T3 ephemeral this-session effect; `pulse` = T4's purely cosmetic
 * ✓ pulse (both suppressed under prefers-reduced-motion by the caller).
 */
function TierRow({
  emoji,
  name,
  reached,
  energy,
  rung,
  extraRung,
  invite,
  glow = false,
  pulse = false,
}: {
  emoji: string
  name: string
  reached: boolean
  energy: number
  rung: TierRungStatus
  /** T4's second condition (synapses) — rendered as a second progress chip. */
  extraRung?: TierRungStatus
  invite: string
  glow?: boolean
  pulse?: boolean
}): JSX.Element {
  const capped = (r: TierRungStatus): string => `${Math.min(r.done, r.target)}/${r.target}`
  return (
    <div style={glow ? { ...tierRowStyle, ...tierRowGlowStyle } : tierRowStyle}>
      <div style={tierRowMainStyle}>
        <span style={tierNameStyle}>
          <EmojiIcon char={emoji} size={13} decorative /> {name}
        </span>
        {reached ? (
          <span style={tierDoneStyle}>
            <span style={pulse ? tierPulseMarkStyle : undefined}>{TIER_REACHED_MARK}</span>{' '}
            {TIER_ENERGY_LABEL} +{energy}
          </span>
        ) : (
          <span style={tierProgStyle}>
            {capped(rung)}
            {extraRung ? ` · 連結 ${capped(extraRung)}` : ''}
          </span>
        )}
      </div>
      {!reached && <p style={tierInviteStyle}>{invite}</p>}
    </div>
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

// Two-button action row: 高頻考點 (left, secondary) + 今日處方 (right, primary CTA).
const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  width: '100%',
  boxSizing: 'border-box',
}

const halfBtnBase: React.CSSProperties = {
  flex: 1,
  boxSizing: 'border-box',
  padding: '0.6rem 0.5rem',
  borderRadius: '6px',
  fontFamily: 'inherit',
  fontSize: '0.95rem',
  fontWeight: 700,
  textAlign: 'center',
  cursor: 'pointer',
  textDecoration: 'none',
}

// Left — 高頻考點 exit (secondary; no badge/count/countdown per anti-anxiety contract).
const halfCramBtnStyle: React.CSSProperties = {
  ...halfBtnBase,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '2px solid #d8c39a',
  background: '#f4ecd8',
  color: '#7a5410',
}

// Right — primary 今日處方 CTA.
const halfPrescBtnStyle: React.CSSProperties = {
  ...halfBtnBase,
  border: '2px solid #e0a44a',
  background: 'linear-gradient(135deg, #c06a3a 0%, #a85530 100%)',
  color: '#fff',
  boxShadow: '0 0 0 2px rgba(255,255,255,0.18)',
}

// Right — completed (non-routing) state.
const halfDoneBtnStyle: React.CSSProperties = {
  ...halfBtnBase,
  cursor: 'default',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.3rem',
  border: '2px solid #a8c99a',
  background: '#eef6e8',
  color: '#3f6b34',
}

// dayComplete 收束 area — completion line + optional 考前救援 bonus + calm toggle.
const completeAreaStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
}

const completeLineStyle: React.CSSProperties = {
  margin: 0,
  textAlign: 'center',
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#3f6b34',
}

// Optional bonus — undone invite is muted/soft (never a deficit); done is positive.
const rescueInviteStyle: React.CSSProperties = {
  margin: 0,
  textAlign: 'center',
  fontSize: '0.8rem',
  color: '#8c6d4a',
}

const rescueDoneStyle: React.CSSProperties = {
  margin: 0,
  textAlign: 'center',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#4d8c4d',
}

// 考前收斂 calm view — neutral disclosure toggle + passive panel (dayComplete only).
const calmWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
}

const calmToggleStyle: React.CSSProperties = {
  alignSelf: 'center',
  border: 'none',
  background: 'transparent',
  color: '#8c6d4a',
  fontFamily: 'inherit',
  fontSize: '0.8rem',
  cursor: 'pointer',
  padding: '0.15rem 0.3rem',
}

// ── Tier ladder panel (rendered only after dayComplete — progressive disclosure) ──
const tierPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '0.5rem 0.6rem',
  background: '#fbf3df',
  border: '1px dashed #d8c39a',
  borderRadius: '6px',
}

const tierLeadStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  color: '#8c6d4a',
  lineHeight: 1.4,
}

const tierRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  padding: '0.35rem 0.5rem',
  background: '#fffdf8',
  border: '1px solid #e6d6b8',
  borderRadius: '6px',
  transition: 'box-shadow 0.6s ease',
}

// T3 ephemeral glow — transient box-shadow only (fades out via the row's
// transition when the state clears; never persisted).
const tierRowGlowStyle: React.CSSProperties = {
  boxShadow: '0 0 10px 2px rgba(212, 160, 77, 0.75)',
}

const tierRowMainStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
}

const tierNameStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#5a3f29',
}

const tierProgStyle: React.CSSProperties = {
  fontFamily: 'var(--font-pixel-num)',
  fontSize: '0.9rem',
  color: '#a85530',
  whiteSpace: 'nowrap',
}

const tierDoneStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#4d8c4d',
  whiteSpace: 'nowrap',
}

// T4 cosmetic pulse — purely decorative (keyframes in styles.css); carries no
// exclusive power or stat.
const tierPulseMarkStyle: React.CSSProperties = {
  display: 'inline-block',
  animation: 'tier-pulse 2.4s ease-in-out infinite',
}

const tierInviteStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.74rem',
  color: '#8c6d4a',
  lineHeight: 1.4,
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
