/**
 * Per-family quiz entry grid — flat portrait cards. Each card
 * carries TWO quiz-mode chips (per add-neurons-quiz-mode-chips-and-srs):
 *   🆕 新題 — only never-answered questions (badge = unseen count)
 *   🔄 錯題 — SRS-scheduled due review (badge = today's due count)
 * replacing the prior single 「🎯 答題」 button. The player picks a family AND a
 * mode in one click.
 *
 * Spec: openspec/specs/neurons-quiz-modes/spec.md + neurons-homepage (MODIFIED).
 * The neurons-mode family-picker contract is still upheld — the picker scopes
 * the active quiz pool and is the action surface itself.
 */

import type { ContentPack, Subject } from '@study-rpg/core'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import type { FamilyModeCounts, QuizMode } from '../lib/services/srs-scheduler'
import MasteryChip from './MasteryChip'
import VariantCollectionChip from './VariantCollectionChip'

const SPRITE_MAP = THEME_PIXEL_NEURONS.sprites

/** Per-family connectome accrual the card surfaces (AP / unlocked slots / fired-today). */
export interface FamilyAccrual {
  ap: number
  unlockedSlots: number[]
  firedToday: boolean
}

interface Props {
  pack: ContentPack
  onStartQuiz: (familyId: string, mode: QuizMode) => void
  /** Per-family connectome accrual; when present each card shows AP + next-slot + variant chip + fired-today badge. */
  accrualByFamily?: Map<string, FamilyAccrual>
  /** Per-family 新題 (unseen) + 錯題 (due) counts for the two mode-chip badges. */
  modeCountsByFamily?: Map<string, FamilyModeCounts>
}

export function FamilyPicker({ pack, onStartQuiz, accrualByFamily, modeCountsByFamily }: Props): JSX.Element {
  return (
    <section style={pickerSectionStyle} aria-label="選 family 直接答題">
      <header style={headerRowStyle}>
        <h2 style={pickerHeaderStyle}>📚 選 family 直接練習</h2>
        <span style={headerHintStyle}>
          {pack.subjects.length} family · 同日跨 family 答對 5 題 → wire synapse
        </span>
      </header>

      <div style={branchRowStyle} className="neurons-family-grid">
        {pack.subjects.map((s) => (
          <FamilyCard
            key={s.id}
            family={s}
            accrual={accrualByFamily?.get(s.id)}
            counts={modeCountsByFamily?.get(s.id)}
            onStartQuiz={(mode) => onStartQuiz(s.id, mode)}
          />
        ))}
      </div>
    </section>
  )
}

function FamilyCard({
  family,
  accrual,
  counts,
  onStartQuiz,
}: {
  family: Subject
  accrual?: FamilyAccrual
  counts?: FamilyModeCounts
  onStartQuiz: (mode: QuizMode) => void
}): JSX.Element {
  const accent = family.color ?? '#8c6d4a'
  const spriteUrl = SPRITE_MAP[`subject:${family.id}`] ?? ''
  const isEmpty = family.totalQuestions === 0
  const ap = accrual?.ap ?? 0
  const freshCount = counts?.fresh ?? (isEmpty ? 0 : family.totalQuestions)
  const dueCount = counts?.due ?? 0
  const freshDisabled = isEmpty || freshCount === 0
  const reviewDisabled = dueCount === 0
  return (
    <article style={familyCardStyle(accent)} aria-label={`${family.id} · ${family.displayName}`}>
      <header style={cardHeaderStyle}>
        <div style={spriteFrameStyle(accent)}>
          {spriteUrl ? (
            <img src={spriteUrl} alt="" width={48} height={48} className="neuron-sprite--alive" style={spriteStyle} />
          ) : (
            <span style={{ fontSize: '1.4rem', color: accent }} aria-hidden>🧬</span>
          )}
        </div>
        <div style={cardHeadTextStyle}>
          <div style={primaryNameStyle(accent)}>
            {accrual?.firedToday && <span title="今日已激發" aria-label="今日已激發">🔥 </span>}
            {family.id}
          </div>
          <div style={personaNameStyle}>{family.displayName}</div>
        </div>
      </header>

      <div style={apLineStyle}>
        AP <strong style={{ color: accent }}>{ap}</strong>
      </div>

      <div style={chipRowStyle}>
        <MasteryChip familyId={family.id} displayName={family.displayName} />
        <VariantCollectionChip familyId={family.id} />
        <span style={countChipStyle(accent)}>{family.totalQuestions} 題</span>
      </div>

      <div style={modeChipRowStyle}>
        <button
          type="button"
          onClick={() => onStartQuiz('fresh')}
          disabled={freshDisabled}
          style={freshDisabled ? modeChipDisabledStyle : modeChipFreshStyle(accent)}
          title={
            isEmpty
              ? '本 family 目前無題目'
              : freshCount === 0
                ? '本 family 已全部答過'
                : `從 ${family.id} 出沒答過的新題（${freshCount} 題）`
          }
        >
          🆕 新題
          <span style={modeChipBadgeStyle}>{freshCount === 0 && !isEmpty ? '全部答過' : freshCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onStartQuiz('review')}
          disabled={reviewDisabled}
          style={reviewDisabled ? modeChipDisabledStyle : modeChipReviewStyle(accent)}
          title={reviewDisabled ? '今日沒有到期的複習題' : `複習 ${family.id} 今日到期的 ${dueCount} 題`}
        >
          🔄 錯題
          <span style={modeChipBadgeStyle}>{reviewDisabled ? '今日無到期' : dueCount}</span>
        </button>
      </div>
    </article>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pickerSectionStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  padding: '0.85rem 1rem 1rem',
  marginBottom: '1rem',
  borderRadius: '4px',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.75rem',
  borderBottom: '1px solid #c4a878',
  paddingBottom: '0.35rem',
  gap: '0.5rem',
  flexWrap: 'wrap',
}

const pickerHeaderStyle: React.CSSProperties = {
  fontSize: '1rem',
  margin: 0,
  color: '#3a2a1a',
}

const headerHintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#8c6d4a',
  letterSpacing: '0.02em',
}

const branchRowStyle: React.CSSProperties = {
  display: 'grid',
  // grid-template-columns moved to .neurons-family-grid (styles.css) so an
  // @media rule can collapse to a single column < 768px (Decision 1: inline
  // would otherwise beat the CSS @media).
  gap: '0.55rem',
}

function familyCardStyle(accent: string): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.6rem 0.65rem 0.65rem',
    background: '#fff',
    border: `2px solid ${accent}`,
    borderRadius: '6px',
    boxShadow: '0 1px 2px rgba(58, 42, 26, 0.08)',
    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
  }
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.55rem',
}

function spriteFrameStyle(accent: string): React.CSSProperties {
  return {
    width: 52,
    height: 52,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fdf6e3',
    border: `1px solid ${accent}`,
    borderRadius: '4px',
  }
}

const spriteStyle: React.CSSProperties = {
  imageRendering: 'pixelated',
  width: 48,
  height: 48,
}

const cardHeadTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.1rem',
  minWidth: 0,
  flex: 1,
}

function primaryNameStyle(color: string): React.CSSProperties {
  return {
    fontSize: '0.92rem',
    fontWeight: 700,
    color,
    lineHeight: 1.15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

const personaNameStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#5a3f29',
  lineHeight: 1.2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const apLineStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#5a3f29',
  letterSpacing: '0.01em',
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  flexWrap: 'wrap',
}

function countChipStyle(accent: string): React.CSSProperties {
  return {
    fontSize: '0.7rem',
    padding: '0.1rem 0.45rem',
    borderRadius: '999px',
    background: '#fdf6e3',
    color: accent,
    border: `1px solid ${accent}`,
    fontWeight: 600,
  }
}

const modeChipRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.4rem',
}

function modeChipBaseStyle(): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.12rem',
    padding: '0.4rem',
    borderRadius: '4px',
    fontSize: '0.82rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    lineHeight: 1.15,
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    minWidth: 0,
  }
}

function modeChipFreshStyle(accent: string): React.CSSProperties {
  return { ...modeChipBaseStyle(), background: accent, color: '#fff', border: `1px solid ${accent}` }
}

function modeChipReviewStyle(accent: string): React.CSSProperties {
  return { ...modeChipBaseStyle(), background: '#fff', color: accent, border: `1.5px solid ${accent}` }
}

const modeChipDisabledStyle: React.CSSProperties = {
  ...modeChipBaseStyle(),
  background: '#ece3d0',
  color: '#a89074',
  border: '1px solid #d3c4a4',
  cursor: 'not-allowed',
  boxShadow: 'none',
}

const modeChipBadgeStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  opacity: 0.92,
}
