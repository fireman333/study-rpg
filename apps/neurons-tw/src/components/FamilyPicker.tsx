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

import { Fragment } from 'react'
import type { ContentPack, Subject } from '@study-rpg/core'
import { EXAM_PAPER_ORDER, FAMILY_EXAM_PAPER, type ExamPaper } from '@study-rpg/content-neurons-tw'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import type { FamilyModeCounts, QuizMode } from '../lib/services/srs-scheduler'
import MasteryChip from './MasteryChip'
import VariantCollectionChip from './VariantCollectionChip'
import { EmojiIcon } from './EmojiIcon'
import { YearFilterBar } from './YearFilterBar'

const SPRITE_MAP = THEME_PIXEL_NEURONS.sprites

/** Per-family connectome accrual the card surfaces (AP / unlocked slots / fired-today). */
export interface FamilyAccrual {
  ap: number
  unlockedSlots: number[]
  firedToday: boolean
}

/** Per-family maze-progress hint (deep card↔maze integration): a derived snapshot of the
 * family's tract on the ONE maze canvas — lit node count, total nodes (both laps), the
 * first-route node count (lap split) and whether the tract is fully lit. Rendered as a small
 * node-dot track on each card so the card visually IS a slice of the maze (same accent colour,
 * same lit nodes), without a second canvas. */
export interface MazeFamilyHint {
  lit: number
  total: number
  firstRouteCount: number
  complete: boolean
}

interface Props {
  pack: ContentPack
  onStartQuiz: (familyId: string, mode: QuizMode) => void
  /** Per-family connectome accrual; when present each card shows AP + next-slot + variant chip + fired-today badge. */
  accrualByFamily?: Map<string, FamilyAccrual>
  /** Per-family 新題 (unseen) + 錯題 (due) counts for the two mode-chip badges. */
  modeCountsByFamily?: Map<string, FamilyModeCounts>
  /** Tapping a family card focuses the maze camera on that family (add-neurons-maze-zoom-and-focus). */
  onFocusFamily?: (familyId: string) => void
  /** The per-family 📖 閱讀 entry toggles that subject's reading session. */
  onToggleReading?: (familyId: string) => void
  /** The family currently in a reading session (drives the 📖 button's active state). */
  readingFamilyId?: string | null
  /** Dynamic label for the actively-reading card (status / pause-reason feedback). */
  readingActiveLabel?: string
  /** Master-detail selection: the family whose card is currently focused on the embedded maze.
   * On desktop (≥768px) a non-null value puts the box into FULL-WIDTH detail mode (C′): DockHeader +
   * maze, the 2-col grid hidden, a FamilyChipRail below. */
  selectedFamilyId?: string | null
  /** Mobile-only (A2) dock anchor: which card the maze panel is CSS-docked under. Drives the
   * `is-docked` class on the detail + the `is-dock-anchor` margin on the tapped card. Ephemeral. */
  dockFamilyId?: string | null
  /** The embedded maze (teaser when collapsed, full panel when expanded) — rendered as the
   * master-detail's detail surface INSIDE this box (reposition-neurons-maze-master-detail). */
  mazeSlot?: React.ReactNode
  /** Drives the two-column (desktop) vs stacked (mobile/collapsed) master-detail layout. */
  mazeExpanded?: boolean
  /** Per-family maze tract progress → each card's derived axon node-track (no extra canvas). */
  mazeHintByFamily?: Map<string, MazeFamilyHint>
}

export function FamilyPicker({
  pack,
  onStartQuiz,
  accrualByFamily,
  modeCountsByFamily,
  onFocusFamily,
  onToggleReading,
  readingFamilyId,
  readingActiveLabel,
  selectedFamilyId,
  dockFamilyId,
  mazeSlot,
  mazeExpanded,
  mazeHintByFamily,
}: Props): JSX.Element {
  const selectedSubject =
    selectedFamilyId != null ? pack.subjects.find((s) => s.id === selectedFamilyId) ?? null : null
  const accent = selectedSubject?.color ?? '#8c6d4a'
  // .neurons-md modifier classes: is-expanded (maze open) + is-detail (DESKTOP full-width detail mode,
  // C′ — driven by selectedFamilyId). is-docked on the detail (MOBILE A2). The accent custom prop
  // drives the family-tinted observation-well seam.
  const mdClass = [
    'neurons-md',
    mazeExpanded ? 'is-expanded' : '',
    selectedFamilyId != null ? 'is-detail' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const mdStyle = selectedSubject ? ({ ['--family-accent' as string]: accent } as React.CSSProperties) : undefined

  return (
    <section style={pickerSectionStyle} aria-label="選 family 直接答題">
      <header style={headerRowStyle}>
        <h2 style={pickerHeaderStyle}><EmojiIcon char="📚" size={16} /> 選 family 直接練習</h2>
        <span style={headerHintStyle}>
          {pack.subjects.length} family · 出征一起修復跨科錯題 → wire 連線
        </span>
      </header>

      {/* Exam-year filter scopes the per-family quiz pool (relocated here from the
          old CTA toolbar by redesign-neurons-homepage-cta; reads global
          quiz.yearFilter meta, no props needed). */}
      <YearFilterBar />

      {/* Master-detail INSIDE this box (reposition-neurons-maze-master-detail → C′ desktop / A2 mobile).
          DESKTOP detail mode (is-detail): the detail region expands FULL-WIDTH with a DockHeader (the
          enlarged selected card) above the ONE maze, the 2-col grid is display:none (stays MOUNTED so
          its liveQuery chips stay warm), and a FamilyChipRail renders below for one-tap family switching.
          MOBILE (A2): the detail CSS-docks under the tapped card (is-docked). The canvas NEVER leaves
          .neurons-md__detail — every layout change is class-toggle + grid-template only, no re-parent. */}
      <div className={mdClass} style={mdStyle}>
        {mazeSlot != null && (
          <div className={dockFamilyId != null ? 'neurons-md__detail is-docked' : 'neurons-md__detail'}>
            {selectedSubject && (
              <DockHeader
                family={selectedSubject}
                accrual={accrualByFamily?.get(selectedSubject.id)}
                counts={modeCountsByFamily?.get(selectedSubject.id)}
                mazeHint={mazeHintByFamily?.get(selectedSubject.id)}
                onStartQuiz={(mode) => onStartQuiz(selectedSubject.id, mode)}
                onToggleReading={onToggleReading ? () => onToggleReading(selectedSubject.id) : undefined}
                isReading={readingFamilyId === selectedSubject.id}
                readingActiveLabel={readingFamilyId === selectedSubject.id ? readingActiveLabel : undefined}
              />
            )}
            {mazeSlot}
          </div>
        )}
        <div className="neurons-md__master">
          {groupSubjectsByPaper(pack.subjects).map((group) => (
            <div key={group.id} style={paperGroupStyle}>
              <div style={paperHeaderStyle}>
                <span><EmojiIcon char={group.emoji} size={16} /> {group.label}</span>
                <span style={paperCountStyle}>{group.subjects.length} 科</span>
              </div>
              <div style={branchRowStyle} className="neurons-family-grid">
                {group.subjects.map((s) => (
                  <FamilyCard
                    key={s.id}
                    family={s}
                    accrual={accrualByFamily?.get(s.id)}
                    counts={modeCountsByFamily?.get(s.id)}
                    mazeHint={mazeHintByFamily?.get(s.id)}
                    onStartQuiz={(mode) => onStartQuiz(s.id, mode)}
                    onFocus={onFocusFamily ? () => onFocusFamily(s.id) : undefined}
                    onToggleReading={onToggleReading ? () => onToggleReading(s.id) : undefined}
                    isReading={readingFamilyId === s.id}
                    readingActiveLabel={readingFamilyId === s.id ? readingActiveLabel : undefined}
                    selected={selectedFamilyId === s.id}
                    isDockAnchor={dockFamilyId === s.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Single-row family switcher (C′ desktop): only in detail mode, CSS-hidden on mobile (the
            cards stay the switch surface there). Reuses onFocusFamily → zero-layout-shift switch. */}
        {selectedSubject && onFocusFamily && (
          <FamilyChipRail
            subjects={pack.subjects}
            selectedFamilyId={selectedFamilyId ?? null}
            modeCountsByFamily={modeCountsByFamily}
            onSelect={onFocusFamily}
          />
        )}
      </div>
    </section>
  )
}

/**
 * DockHeader — the C′ desktop detail-mode banner: the FULL enlarged selected card duplicated as a
 * horizontal header above the embedded maze, so practice-entry (🆕/🔄/📖) stays intact when the 2-col
 * grid is collapsed. Mirrors `FamilyCard`'s affordances + reuses the same callbacks; CSS-hidden on
 * mobile (where the card itself stays on-screen above the docked maze). Plain DOM — no canvas.
 */
function DockHeader({
  family,
  accrual,
  counts,
  mazeHint,
  onStartQuiz,
  onToggleReading,
  isReading,
  readingActiveLabel,
}: {
  family: Subject
  accrual?: FamilyAccrual
  counts?: FamilyModeCounts
  mazeHint?: MazeFamilyHint
  onStartQuiz: (mode: QuizMode) => void
  onToggleReading?: () => void
  isReading?: boolean
  readingActiveLabel?: string
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
    <div className="neurons-md__dock-header" style={dockHeaderStyle(accent)}>
      <div style={dockIdentityStyle}>
        <div style={spriteFrameStyle(accent)}>
          {spriteUrl ? (
            <img src={spriteUrl} alt="" width={48} height={48} className="neuron-sprite--alive" style={spriteStyle} />
          ) : (
            <EmojiIcon char="🧬" size={22} decorative />
          )}
        </div>
        <div style={cardHeadTextStyle}>
          <div style={primaryNameStyle(accent)}>
            {accrual?.firedToday && <span title="今日已激發" aria-label="今日已激發">🔥 </span>}
            {family.id}
          </div>
          <div style={personaNameStyle}>{family.displayName}</div>
        </div>
      </div>

      <div style={dockBodyStyle}>
        {mazeHint && mazeHint.total > 0 && (
          <AxonProgressStrip hint={mazeHint} accent={accent} familyId={family.id} />
        )}
        <div style={dockMetaRowStyle}>
          <span style={apLineStyle}>
            AP <strong style={{ color: accent }}>{ap}</strong>
          </span>
          <MasteryChip familyId={family.id} displayName={family.displayName} />
          <VariantCollectionChip familyId={family.id} />
          <span style={countChipStyle(accent)}>{family.totalQuestions} 題</span>
        </div>
        <div style={dockActionRowStyle}>
          <button
            type="button"
            onClick={() => onStartQuiz('fresh')}
            disabled={freshDisabled}
            style={{ ...(freshDisabled ? modeChipDisabledStyle : modeChipFreshStyle(accent)), flex: '1 1 130px' }}
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
            style={{ ...(reviewDisabled ? modeChipDisabledStyle : modeChipReviewStyle(accent)), flex: '1 1 130px' }}
            title={reviewDisabled ? '今日沒有到期的複習題' : `複習 ${family.id} 今日到期的 ${dueCount} 題`}
          >
            🔄 錯題
            <span style={modeChipBadgeStyle}>{reviewDisabled ? '今日無到期' : dueCount}</span>
          </button>
          {onToggleReading && (
            <button
              type="button"
              onClick={onToggleReading}
              aria-pressed={!!isReading}
              style={{ ...(isReading ? readingChipActiveStyle(accent) : readingChipStyle(accent)), width: 'auto', flex: '1 1 100%' }}
              title={isReading ? `結束 ${family.id} 的閱讀` : `開始閱讀 ${family.id}（能量全進此科）`}
            >
              {isReading ? (readingActiveLabel ?? '🟢 閱讀中 · 點擊結束') : '📖 閱讀此科'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * FamilyChipRail — the single horizontal row of all 11 family chips below the maze in C′ detail mode.
 * One tap switches the focused family with NO 返回 step and (taps 2..n) zero layout shift. The
 * 醫學一/醫學二 grouping is flattened to a thin divider. CSS-hidden on mobile.
 */
function FamilyChipRail({
  subjects,
  selectedFamilyId,
  modeCountsByFamily,
  onSelect,
}: {
  subjects: Subject[]
  selectedFamilyId: string | null
  modeCountsByFamily?: Map<string, FamilyModeCounts>
  onSelect: (familyId: string) => void
}): JSX.Element {
  const groups = groupSubjectsByPaper(subjects)
  return (
    <div className="neurons-md__rail" role="tablist" aria-label="切換科目">
      {groups.map((group, gi) => (
        <Fragment key={group.id}>
          {gi > 0 && <span className="neurons-md__rail-divider" aria-hidden />}
          {group.subjects.map((s) => {
            const chipAccent = s.color ?? '#8c6d4a'
            const spriteUrl = SPRITE_MAP[`subject:${s.id}`] ?? ''
            const fresh = modeCountsByFamily?.get(s.id)?.fresh ?? 0
            const selected = selectedFamilyId === s.id
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(s.id)}
                className="neurons-md__rail-chip"
                style={railChipStyle(chipAccent, selected)}
                title={`${s.id} · ${s.displayName}`}
              >
                {spriteUrl ? (
                  <img src={spriteUrl} alt="" width={22} height={22} style={railChipSpriteStyle} />
                ) : (
                  <EmojiIcon char="🧬" size={16} decorative />
                )}
                <span style={railChipNameStyle}>{s.id}</span>
                {fresh > 0 && <span style={railChipBadgeStyle(chipAccent)}>🆕{fresh}</span>}
              </button>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}

/**
 * Exam-paper sections for the picker (decouple-neurons-subjects-from-nt-branches):
 * cards group by the two 國考第一階 papers (醫學一 / 醫學二) in 試題順序 instead of by
 * NT branch. Any subject a fork ships that isn't mapped to a paper falls into a
 * defensive 「其他」 group so it is never silently dropped.
 */
const PAPER_META: { id: ExamPaper; emoji: string; label: string }[] = [
  { id: '醫學一', emoji: '🧠', label: '醫學一' },
  { id: '醫學二', emoji: '🔬', label: '醫學二' },
]

interface PaperGroup {
  id: string
  emoji: string
  label: string
  subjects: Subject[]
}

function groupSubjectsByPaper(subjects: Subject[]): PaperGroup[] {
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const groups: PaperGroup[] = PAPER_META.map(({ id, emoji, label }) => {
    const ordered = (EXAM_PAPER_ORDER[id] ?? [])
      .map((sid) => byId.get(sid))
      .filter((s): s is Subject => Boolean(s))
    const seen = new Set(ordered.map((s) => s.id))
    const extras = subjects.filter((s) => FAMILY_EXAM_PAPER[s.id] === id && !seen.has(s.id))
    return { id, emoji, label, subjects: [...ordered, ...extras] }
  })
  const placed = new Set(groups.flatMap((g) => g.subjects.map((s) => s.id)))
  const unplaced = subjects.filter((s) => !placed.has(s.id))
  if (unplaced.length > 0) groups.push({ id: '其他', emoji: '🧬', label: '其他', subjects: unplaced })
  return groups.filter((g) => g.subjects.length > 0)
}

function FamilyCard({
  family,
  accrual,
  counts,
  mazeHint,
  onStartQuiz,
  onFocus,
  onToggleReading,
  isReading,
  readingActiveLabel,
  selected,
  isDockAnchor,
}: {
  family: Subject
  accrual?: FamilyAccrual
  counts?: FamilyModeCounts
  mazeHint?: MazeFamilyHint
  onStartQuiz: (mode: QuizMode) => void
  onFocus?: () => void
  onToggleReading?: () => void
  isReading?: boolean
  readingActiveLabel?: string
  selected?: boolean
  /** Mobile A2: this card is the maze dock anchor — opens a margin gap for the absolutely-positioned
   * panel (rule lives in the `@media (max-width:767px)` block; no-op on desktop). */
  isDockAnchor?: boolean
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
    <article
      id={`family-card-${family.id}`}
      className={isDockAnchor ? 'is-dock-anchor' : undefined}
      style={selected ? { ...familyCardStyle(accent), boxShadow: `0 0 0 2px ${accent}, 0 2px 10px rgba(0,0,0,0.18)` } : familyCardStyle(accent)}
      aria-current={selected ? 'true' : undefined}
      aria-label={`${family.id} · ${family.displayName}`}
    >
      <header
        style={onFocus ? { ...cardHeaderStyle, cursor: 'pointer' } : cardHeaderStyle}
        onClick={onFocus}
        onKeyDown={
          onFocus
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onFocus()
                }
              }
            : undefined
        }
        role={onFocus ? 'button' : undefined}
        tabIndex={onFocus ? 0 : undefined}
        title={onFocus ? `在腦圖上聚焦 ${family.id}` : undefined}
      >
        <div style={spriteFrameStyle(accent)}>
          {spriteUrl ? (
            <img src={spriteUrl} alt="" width={48} height={48} className="neuron-sprite--alive" style={spriteStyle} />
          ) : (
            <EmojiIcon char="🧬" size={22} decorative />
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

      {/* Derived axon node-track (deep card↔maze integration): the card's slice of the maze —
          this family's tract progress in its own accent colour. Tap = same focus as the header. */}
      {mazeHint && mazeHint.total > 0 && (
        <AxonProgressStrip hint={mazeHint} accent={accent} familyId={family.id} onFocus={onFocus} />
      )}

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

      {onToggleReading && (
        <button
          type="button"
          onClick={onToggleReading}
          aria-pressed={!!isReading}
          style={isReading ? readingChipActiveStyle(accent) : readingChipStyle(accent)}
          title={isReading ? `結束 ${family.id} 的閱讀` : `開始閱讀 ${family.id}（能量全進此科）`}
        >
          {isReading ? (readingActiveLabel ?? '🟢 閱讀中 · 點擊結束') : '📖 閱讀此科'}
        </button>
      )}
    </article>
  )
}

/**
 * AxonProgressStrip — the card's derived「腦圖切片」: a node-dot track mirroring this family's
 * tract on the single maze canvas (lit nodes filled in the family accent, the frontier node
 * pulsing, 二週目 shown as the second lap of dots with a ↻ marker). Pure derived DOM/CSS — NOT a
 * canvas — so the ONE-MazeGrid-instance invariant holds. Tapping it focuses the maze on this
 * family (duplicate affordance of the card header; not separately keyboard-focusable).
 */
function AxonProgressStrip({
  hint,
  accent,
  familyId,
  onFocus,
}: {
  hint: MazeFamilyHint
  accent: string
  familyId: string
  onFocus?: () => void
}): JSX.Element {
  const first = hint.firstRouteCount > 0 ? hint.firstRouteCount : hint.total
  // Current lap: route 1 until its nodes are all lit, then route 2 (二週目) when the graph has one.
  const onSecondLap = hint.lit >= first && hint.total > first
  const lapTotal = onSecondLap ? hint.total - first : first
  const lapLit = onSecondLap ? hint.lit - first : Math.min(hint.lit, first)
  const dots = Array.from({ length: lapTotal }, (_, i) => {
    const isLit = i < lapLit
    const isFrontier = !hint.complete && i === lapLit
    const cls = `neurons-axon-dot${isLit ? ' is-lit' : ''}${isFrontier ? ' is-frontier' : ''}`
    return <span key={i} className={cls} />
  })
  const lapLabel = onSecondLap ? '（二週目）' : ''
  return (
    <div
      className="neurons-axon-strip"
      style={{ ['--axon-accent' as string]: accent, cursor: onFocus ? 'pointer' : undefined }}
      onClick={onFocus}
      role="img"
      aria-label={`${familyId} 腦圖進度 ${hint.lit}/${hint.total} 節點${lapLabel}`}
      title={
        onFocus
          ? `腦圖進度 ${hint.lit}/${hint.total} 節點${lapLabel} — 點擊在腦圖上聚焦 ${familyId}`
          : `腦圖進度 ${hint.lit}/${hint.total} 節點${lapLabel}`
      }
    >
      <span className="neurons-axon-strip__track" aria-hidden>{dots}</span>
      <span className="neurons-axon-strip__count" style={{ color: accent }} aria-hidden>
        {hint.complete ? '✦ ' : onSecondLap ? '↻ ' : ''}{hint.lit}/{hint.total}
      </span>
    </div>
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

const paperGroupStyle: React.CSSProperties = {
  marginBottom: '0.85rem',
}

const paperHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.5rem',
  margin: '0 0 0.45rem',
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#3a2a1a',
}

const paperCountStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 400,
  color: '#8c6d4a',
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

function readingChipStyle(accent: string): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: '0.38rem',
    borderRadius: '4px',
    fontSize: '0.78rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    background: '#fdf6e3',
    color: accent,
    border: `1.5px dashed ${accent}`,
  }
}

function readingChipActiveStyle(accent: string): React.CSSProperties {
  return {
    ...readingChipStyle(accent),
    background: '#1f7a3d',
    color: '#fff',
    border: '1.5px solid #1f7a3d',
  }
}

// ─── C′ DockHeader styles (desktop full-width detail-mode banner) ───────────────

function dockHeaderStyle(accent: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    flexWrap: 'wrap',
    padding: '0.6rem 0.7rem',
    background: '#fff',
    border: `2px solid ${accent}`,
    borderRadius: '8px',
    marginBottom: '0.55rem',
  }
}

const dockIdentityStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.55rem',
  flex: '0 0 auto',
}

const dockBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.45rem',
  flex: '1 1 280px',
  minWidth: 0,
}

const dockMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
}

const dockActionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: '0.45rem',
  flexWrap: 'wrap',
}

// ─── C′ FamilyChipRail styles (single horizontal switcher below the maze) ───────

function railChipStyle(accent: string, selected: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    flex: '0 0 auto',
    padding: '0.28rem 0.5rem',
    borderRadius: '999px',
    background: selected ? accent : '#fff',
    color: selected ? '#fff' : '#5a3f29',
    border: `1.5px solid ${accent}`,
    fontFamily: 'inherit',
    fontSize: '0.74rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: selected ? `0 0 0 2px ${accent}55` : 'none',
    whiteSpace: 'nowrap',
  }
}

const railChipSpriteStyle: React.CSSProperties = {
  imageRendering: 'pixelated',
  width: 22,
  height: 22,
  flexShrink: 0,
}

const railChipNameStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
}

function railChipBadgeStyle(accent: string): React.CSSProperties {
  return {
    fontSize: '0.64rem',
    fontWeight: 700,
    padding: '0 0.25rem',
    borderRadius: '999px',
    background: '#fdf6e3',
    color: accent,
    border: `1px solid ${accent}`,
  }
}
