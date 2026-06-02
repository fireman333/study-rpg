/**
 * Per-family quiz entry grid — NT-branch-grouped portrait cards with an
 * embedded 「🎯 答題」 button per family. Mirrors the 二階 hospital app
 * `RecruitmentBanner` pattern: every subject card is its own quiz entry,
 * so the player picks a family AND starts answering in one click instead
 * of selecting a filter then hitting a separate global CTA.
 *
 * Spec parity: openspec/specs/neurons-mode/spec.md still upheld — Overview
 * still surfaces a family subject picker that scopes the active quiz pool;
 * the picker is now the action surface itself.
 *
 * Visual baseline: 二階 hospital `RecruitmentBanner` (per-subject card with
 * 「📚 學習」 + 「🎫 招募」 action row). Neurons keeps NT-branch grouping
 * (DA / 5-HT / GABA / Glu) since that's a teaching anchor the player needs.
 */

import type { ContentPack, Subject } from '@study-rpg/core'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import MasteryChip from './MasteryChip'
import VariantCollectionChip from './VariantCollectionChip'

const SPRITE_MAP = THEME_PIXEL_NEURONS.sprites

/** Per-family connectome accrual the card surfaces (AP / unlocked slots / fired-today). */
export interface FamilyAccrual {
  ap: number
  unlockedSlots: number[]
  firedToday: boolean
}

const NT_BRANCHES = ['DA', '5HT', 'GABA', 'Glu'] as const
const BRANCH_LABEL: Record<typeof NT_BRANCHES[number], string> = {
  DA: 'DA · 多巴胺',
  '5HT': '5-HT · 血清素',
  GABA: 'GABA · γ-胺基丁酸',
  Glu: 'Glu · 麩胺酸',
}
const BRANCH_ACCENT: Record<typeof NT_BRANCHES[number], string> = {
  DA: '#d4a04d',
  '5HT': '#c44d4d',
  GABA: '#6a9bc4',
  Glu: '#6a8c3f',
}

interface Props {
  pack: ContentPack
  onStartQuiz: (familyId: string) => void
  /** Per-family connectome accrual; when present each card shows AP + next-slot + variant chip + fired-today badge. */
  accrualByFamily?: Map<string, FamilyAccrual>
}

export function FamilyPicker({ pack, onStartQuiz, accrualByFamily }: Props): JSX.Element {
  return (
    <section style={pickerSectionStyle} aria-label="選 family 直接答題">
      <header style={headerRowStyle}>
        <h2 style={pickerHeaderStyle}>📚 選 family 直接練習</h2>
        <span style={headerHintStyle}>
          {pack.subjects.length} family · 4 NT 分支 · 同日跨 family 答對 5 題 → wire synapse
        </span>
      </header>

      <div style={branchListStyle}>
        {NT_BRANCHES.map((branch) => {
          const families = pack.subjects.filter((s) => s.group === branch)
          if (families.length === 0) return null
          const accent = BRANCH_ACCENT[branch]
          return (
            <div key={branch}>
              <div style={branchHeaderStyle}>
                <span style={{ ...branchDotStyle, background: accent }} aria-hidden />
                <span style={branchLabelTextStyle}>{BRANCH_LABEL[branch]}</span>
                <span style={branchCountStyle}>{families.length} family</span>
              </div>
              <div style={branchRowStyle} className="neurons-family-grid">
                {families.map((s) => (
                  <FamilyCard
                    key={s.id}
                    family={s}
                    accrual={accrualByFamily?.get(s.id)}
                    onStartQuiz={() => onStartQuiz(s.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function FamilyCard({
  family,
  accrual,
  onStartQuiz,
}: {
  family: Subject
  accrual?: FamilyAccrual
  onStartQuiz: () => void
}): JSX.Element {
  const accent = family.color ?? '#8c6d4a'
  const spriteUrl = SPRITE_MAP[`subject:${family.id}`] ?? ''
  const isEmpty = family.totalQuestions === 0
  const ap = accrual?.ap ?? 0
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

      <button
        type="button"
        onClick={onStartQuiz}
        disabled={isEmpty}
        style={isEmpty ? quizButtonDisabledStyle : quizButtonStyle(accent)}
        title={isEmpty ? '本 family 目前無題目' : `從 ${family.id} 抽題答題`}
      >
        🎯 答題
      </button>
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

const branchListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.9rem',
}

const branchHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  marginBottom: '0.45rem',
}

const branchDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
}

const branchLabelTextStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#3a2a1a',
  letterSpacing: '0.02em',
}

const branchCountStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#8c6d4a',
  marginLeft: 'auto',
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

function quizButtonStyle(accent: string): React.CSSProperties {
  return {
    width: '100%',
    padding: '0.45rem 0.5rem',
    background: accent,
    color: '#fff',
    border: `1px solid ${accent}`,
    borderRadius: '4px',
    fontSize: '0.9rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
  }
}

const quizButtonDisabledStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.45rem 0.5rem',
  background: '#e8dcc0',
  color: '#a89074',
  border: '1px solid #c4a878',
  borderRadius: '4px',
  fontSize: '0.9rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'not-allowed',
}
