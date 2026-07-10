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
import { EXAM_PAPER_ORDER, FAMILY_EXAM_PAPER, type ExamPaper } from '@study-rpg/content-neurons-tw'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import type { FamilyModeCounts, QuizMode } from '../lib/services/srs-scheduler'
import type { WeaknessPressure } from '../lib/services/weakness-pressure'
import { useRepresentativeRows } from '../lib/services/representatives'
import { useRespectsReducedMotion } from '../lib/motion/useRespectsReducedMotion'
import type { NeuronVariantRow } from '../lib/db'
import MasteryChip from './MasteryChip'
import VariantCollectionChip from './VariantCollectionChip'
import VariantSprite from './VariantSprite'
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
  /** Per-family weakness-pressure (add-neurons-weakness-radar-and-error-repair, Feature 1):
   *  a forward-looking「該複習」colour scale, visually + semantically DISTINCT from the
   *  MasteryChip accuracy display + the variant chips (never replaces them). Undiagnosed
   *  families render neutral. Undefined map ⇒ no indicator (feature off / no data). */
  weaknessByFamily?: Map<string, WeaknessPressure>
  /** 一鍵特訓: launch a family-scoped ≤10-Q targeted drill of high-weakness questions. */
  onTargetedDrill?: (familyId: string) => void
  /** The card's explicit 🔍 聚焦 button flies the maze camera to that family (camera-only; the grid
   * never collapses — redesign-neurons-homepage-squad-and-maze-focus). */
  onFocusFamily?: (familyId: string) => void
  /** The per-family 📖 閱讀 entry toggles that subject's reading session. */
  onToggleReading?: (familyId: string) => void
  /** The family currently in a reading session (drives the 📖 button's active state). */
  readingFamilyId?: string | null
  /** Dynamic label for the actively-reading card (status / pause-reason feedback). */
  readingActiveLabel?: string
  /** The family currently focused on the embedded maze camera. Drives ONLY the focused-card highlight
   * (the maze camera state lives in MazeGrid). It does NOT collapse the grid or enter a detail mode. */
  focusedFamilyId?: string | null
  /** Mobile-only (A2) dock anchor: which card the maze panel is CSS-docked under. Drives the
   * `is-docked` class on the detail + the `is-dock-anchor` margin on the tapped card. Ephemeral. */
  dockFamilyId?: string | null
  /** The embedded maze (teaser when collapsed, full panel when expanded) — rendered as the
   * master-detail's detail surface INSIDE this box (reposition-neurons-maze-master-detail). */
  mazeSlot?: React.ReactNode
  /** Drives the expanded (observation-well seam + stage band sizing) vs collapsed (teaser) detail
   * styling. Overview state stacks the maze ABOVE the card grid on ALL viewports
   * (stack-neurons-homepage-maze-desktop); only detail mode re-arranges further. */
  mazeExpanded?: boolean
  /** Per-family maze tract progress → each card's derived axon node-track (no extra canvas). */
  mazeHintByFamily?: Map<string, MazeFamilyHint>
  /** 考前救急 (add-neurons-multi-subject-rescue): per-family rescue chip data (countdown D +
   * RescueScore) for EVERY family with an active plan. Each such card replaces its
   * WeaknessIndicator row with its own rescue chip; a family absent from the map keeps its
   * normal weakness indicator. Multiple plans coexist — this is a per-family map, not one id. */
  rescueChipByFamily?: Map<string, { d: number; score: number }>
  /** Open the rescue scene — from the header entry (no family → overview list) or a card's
   * rescue chip (its family → that family's scene). */
  onOpenRescue?: (familyId?: string) => void
}

export function FamilyPicker({
  pack,
  onStartQuiz,
  accrualByFamily,
  modeCountsByFamily,
  weaknessByFamily,
  onTargetedDrill,
  onFocusFamily,
  onToggleReading,
  readingFamilyId,
  readingActiveLabel,
  focusedFamilyId,
  dockFamilyId,
  mazeSlot,
  mazeExpanded,
  mazeHintByFamily,
  rescueChipByFamily,
  onOpenRescue,
}: Props): JSX.Element {
  const reducedMotion = useRespectsReducedMotion()
  // Each family card's header sprite shows that family's REPRESENTATIVE variant (the one the player
  // picked in 圖鑑), kept in sync via the shared `representativeVariants` meta key; falls back to the
  // generic subject sprite when no representative is set.
  const repByFamily = useRepresentativeRows()
  const focusedSubject =
    focusedFamilyId != null ? pack.subjects.find((s) => s.id === focusedFamilyId) ?? null : null
  const accent = focusedSubject?.color ?? '#8c6d4a'
  // .neurons-md modifier classes: is-expanded (maze open). There is NO detail mode — focusing a family
  // only moves the maze camera + highlights the card; the grid never collapses. is-docked on the detail
  // is the MOBILE A2 accordion. The accent custom prop tints the observation-well seam when focused.
  const mdClass = ['neurons-md', mazeExpanded ? 'is-expanded' : ''].filter(Boolean).join(' ')
  const mdStyle = focusedSubject ? ({ ['--family-accent' as string]: accent } as React.CSSProperties) : undefined

  return (
    <section style={pickerSectionStyle} aria-label="選 family 直接答題">
      <header style={headerRowStyle}>
        <h2 style={pickerHeaderStyle}><EmojiIcon char="📚" size={16} /> 選 family 直接練習</h2>
        <div style={headerRightStyle}>
          <span style={headerHintStyle}>
            {pack.subjects.length} family · 出征一起修復跨科錯題 → wire 連線
          </span>
          {/* 考前救急 header entry — always-on, NOT gated by the per-card pressure≥0.45 drill
              threshold (neurons-homepage delta): the subjects most needing rescue (thin history
              / exam-imminent) must still be reachable. One header-level entry naturally carries
              the "one rescue at a time" constraint. */}
          {onOpenRescue && (
            <button
              type="button"
              style={rescueEntryBtnStyle}
              onClick={() => onOpenRescue()}
              title="鎖定一科、綁定考試日，考前聚焦最大化單科分數"
            >
              <EmojiIcon char="⏱️" size={13} decorative /> 考前救急
            </button>
          )}
        </div>
      </header>

      {/* The ONE embedded maze stacks ABOVE the year-filter chips + card grid on ALL viewports
          (redesign-neurons-homepage-squad-and-maze-focus). Focusing a family is camera-only: the
          card grid NEVER collapses, there is NO DockHeader / chip rail / detail mode. MOBILE (A2):
          the detail CSS-docks under the tapped card (is-docked). The canvas NEVER leaves
          .neurons-md__detail — every layout change is a class-toggle only, no re-parent/remount. */}
      <div className={mdClass} style={mdStyle}>
        {mazeSlot != null && (
          <div className={dockFamilyId != null ? 'neurons-md__detail is-docked' : 'neurons-md__detail'}>
            {mazeSlot}
          </div>
        )}

        {/* Exam-year filter — below the brain map, above the 醫學一 card grid (owner request).
            Scopes the per-family quiz pool; reads global quiz.yearFilter meta, no props needed
            (relocated from above the maze by redesign-neurons-homepage-cta). */}
        <YearFilterBar />

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
                    repRow={repByFamily.get(s.id)}
                    accrual={accrualByFamily?.get(s.id)}
                    counts={modeCountsByFamily?.get(s.id)}
                    weakness={weaknessByFamily?.get(s.id)}
                    onTargetedDrill={onTargetedDrill ? () => onTargetedDrill(s.id) : undefined}
                    rescueChip={rescueChipByFamily?.get(s.id)}
                    onOpenRescue={onOpenRescue ? () => onOpenRescue(s.id) : undefined}
                    reducedMotion={reducedMotion}
                    mazeHint={mazeHintByFamily?.get(s.id)}
                    onStartQuiz={(mode) => onStartQuiz(s.id, mode)}
                    onFocus={onFocusFamily ? () => onFocusFamily(s.id) : undefined}
                    onToggleReading={onToggleReading ? () => onToggleReading(s.id) : undefined}
                    isReading={readingFamilyId === s.id}
                    readingActiveLabel={readingFamilyId === s.id ? readingActiveLabel : undefined}
                    focused={focusedFamilyId === s.id}
                    isDockAnchor={dockFamilyId === s.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
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
  repRow,
  accrual,
  counts,
  weakness,
  onTargetedDrill,
  rescueChip,
  onOpenRescue,
  reducedMotion,
  mazeHint,
  onStartQuiz,
  onFocus,
  onToggleReading,
  isReading,
  readingActiveLabel,
  focused,
  isDockAnchor,
}: {
  family: Subject
  /** This family's representative variant (picked in 圖鑑) → header sprite, kept in sync with /collection. */
  repRow?: NeuronVariantRow
  accrual?: FamilyAccrual
  counts?: FamilyModeCounts
  /** This family's weakness-pressure (Feature 1) → colour-scale indicator + 特訓 affordance. */
  weakness?: WeaknessPressure
  /** 一鍵特訓 launcher for this family (scoped ≤10-Q high-weakness drill). */
  onTargetedDrill?: () => void
  /** Rescue chip data when this family has an active rescue plan (replaces the weakness row). */
  rescueChip?: { d: number; score: number }
  /** Open the rescue scene for this family (the chip's 今日佇列 CTA = the absorbed drill entry). */
  onOpenRescue?: () => void
  reducedMotion?: boolean
  mazeHint?: MazeFamilyHint
  onStartQuiz: (mode: QuizMode) => void
  /** The explicit 🔍 聚焦 button's handler — flies the maze camera to this family (camera-only). */
  onFocus?: () => void
  onToggleReading?: () => void
  isReading?: boolean
  readingActiveLabel?: string
  /** This card's family is the currently-focused maze camera target → accent-ring highlight. */
  focused?: boolean
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
      style={focused ? { ...familyCardStyle(accent), boxShadow: `0 0 0 2px ${accent}, 0 2px 10px rgba(0,0,0,0.18)` } : familyCardStyle(accent)}
      aria-current={focused ? 'true' : undefined}
      aria-label={`${family.id} · ${family.displayName}`}
    >
      {/* Header is presentational only — the name gets the full width (the 🔍 聚焦 trigger moved down to
          the AP row so it no longer squeezes the subject name into an ellipsis). */}
      <header style={cardHeaderStyle}>
        <div style={spriteFrameStyle(accent)}>
          {repRow ? (
            <VariantSprite row={repRow} size={48} />
          ) : spriteUrl ? (
            <img src={spriteUrl} alt="" width={48} height={48} className="neuron-sprite--alive" style={spriteStyle} />
          ) : (
            <EmojiIcon char="🧬" size={22} decorative />
          )}
        </div>
        <div style={cardHeadTextStyle}>
          <div style={primaryNameStyle(accent)}>
            {accrual?.firedToday && <span title="今日已激發" aria-label="今日已激發"><EmojiIcon char="🔥" size={12} decorative /> </span>}
            {family.id}
          </div>
          <div style={personaNameStyle}>{family.displayName}</div>
        </div>
      </header>

      {/* Derived axon node-track (deep card↔maze integration): the card's slice of the maze —
          this family's tract progress in its own accent colour. Non-interactive (focus is the
          explicit 🔍 聚焦 button above). */}
      {mazeHint && mazeHint.total > 0 && (
        <AxonProgressStrip hint={mazeHint} accent={accent} familyId={family.id} />
      )}

      {/* AP + 🔍 聚焦 on one row, right below the X/20 axon bar (owner): the 聚焦 button sits opposite
          the AP readout so it never steals header width from the subject name. */}
      <div style={apLineStyle}>
        <span>AP <strong style={{ color: accent }}>{ap}</strong></span>
        {onFocus && (
          <button
            type="button"
            onClick={onFocus}
            style={focused ? focusBtnActiveStyle(accent) : focusBtnStyle(accent)}
            aria-pressed={!!focused}
            aria-label={`在腦圖上聚焦 ${family.id}`}
            title={`在腦圖上聚焦 ${family.id}`}
            // data-tutorial="maze-focus": onboarding-spotlight anchor for the guided tour's 🔍 聚焦 step
            // (on every family card's 聚焦 entry — the tour targets the first visible match).
            data-tutorial="maze-focus"
          >
            <EmojiIcon char="🔍" size={13} decorative />
            <span className="neurons-focus-label" style={focusBtnLabelStyle}>聚焦</span>
          </button>
        )}
      </div>

      <div style={chipRowStyle}>
        <MasteryChip familyId={family.id} displayName={family.displayName} />
        <VariantCollectionChip familyId={family.id} />
      </div>

      {/* Card 變身 (add-neurons-single-subject-rescue): an active rescue plan replaces this
          family's WeaknessIndicator row (and its absorbed one-tap 特訓) with a rescue chip
          surfacing the countdown + RescueScore + 今日佇列 CTA. Only the active-plan family;
          every other card keeps its normal weakness indicator. Reverts on archive/abandon. */}
      {rescueChip ? (
        <RescueChip d={rescueChip.d} score={rescueChip.score} accent={accent} onOpen={onOpenRescue} />
      ) : (
        weakness && (
          <WeaknessIndicator
            weakness={weakness}
            accent={accent}
            onTargetedDrill={onTargetedDrill}
            reducedMotion={reducedMotion}
          />
        )
      )}

      <div style={modeChipRowStyle}>
        <button
          type="button"
          onClick={() => onStartQuiz('fresh')}
          disabled={freshDisabled}
          style={freshDisabled ? modeChipDisabledStyle : modeChipFreshStyle(accent)}
          // data-tutorial="quiz-start": onboarding-spotlight anchor for the guided tour's 答題 step
          // when the quiz modal is closed (frames the 🆕 新題 answer-opening entry; the in-modal
          // [data-tutorial="quiz-answer"] grid takes priority once the modal is open).
          data-tutorial="quiz-start"
          title={
            isEmpty
              ? '本 family 目前無題目'
              : freshCount === 0
                ? '本 family 已全部答過'
                : `從 ${family.id} 出沒答過的新題（${freshCount} 題）`
          }
        >
          <EmojiIcon char="🆕" size={13} decorative /> 新題
          <span style={modeChipBadgeStyle}>
            {isEmpty ? '—' : freshCount === 0 ? '全部答過' : `${freshCount}/${family.totalQuestions}`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onStartQuiz('review')}
          disabled={reviewDisabled}
          style={reviewDisabled ? modeChipDisabledStyle : modeChipReviewStyle(accent)}
          title={reviewDisabled ? '今日沒有到期的複習題' : `複習 ${family.id} 今日到期的 ${dueCount} 題`}
        >
          <EmojiIcon char="🔄" size={13} decorative /> 錯題
          <span style={modeChipBadgeStyle}>{reviewDisabled ? '今日無到期' : dueCount}</span>
        </button>
      </div>

      {onToggleReading && (
        <button
          type="button"
          onClick={onToggleReading}
          aria-pressed={!!isReading}
          // data-tutorial="reading": onboarding-spotlight anchor (on every family card's 📖 entry —
          // the tutorial agent targets the first match).
          data-tutorial="reading"
          style={isReading ? readingChipActiveStyle(accent) : readingChipStyle(accent)}
          title={isReading ? `結束 ${family.id} 的閱讀` : `開始閱讀 ${family.id}（能量全進此科）`}
        >
          {isReading ? (
            readingActiveLabel ?? '🟢 閱讀中 · 點擊結束'
          ) : (
            <><EmojiIcon char="📖" size={13} decorative /> 閱讀此科</>
          )}
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

/**
 * WeaknessIndicator — the family card's weakness-pressure colour scale + 一鍵特訓
 * (add-neurons-weakness-radar-and-error-repair, Feature 1). A small bar whose
 * fill colour interpolates weak (red/dim) → strong (green/bright) by the derived
 * pressure, with a 特訓 button on the weak end. Deliberately visually distinct
 * from the MasteryChip (a tier pill) so the two never read as the same number.
 * Undiagnosed families render a neutral grey「未診斷」chip, NOT the weakest colour.
 * `prefers-reduced-motion` drops the pulse on the weak state.
 */
function WeaknessIndicator({
  weakness,
  accent,
  onTargetedDrill,
  reducedMotion,
}: {
  weakness: WeaknessPressure
  accent: string
  onTargetedDrill?: () => void
  reducedMotion?: boolean
}): JSX.Element {
  if (weakness.undiagnosed || weakness.pressure === undefined) {
    return (
      <div style={weaknessRowStyle}>
        <span style={weaknessUndiagnosedChipStyle} title="尚無答題紀錄 — 先答幾題才能診斷弱點">
          未診斷
        </span>
      </div>
    )
  }
  const pressure = Math.min(1, Math.max(0, weakness.pressure))
  // Strong (pressure→0) = bright green; weak (pressure→1) = dim red. Hue 130→8.
  const hue = Math.round(130 - pressure * 122)
  const light = Math.round(62 - pressure * 20) // dimmer as it weakens
  const fillColor = `hsl(${hue}, 62%, ${light}%)`
  // "Weak enough" to nudge a targeted drill (dogfood-tunable local threshold).
  const isWeak = pressure >= 0.45
  const pulse = isWeak && !reducedMotion
  return (
    <div style={weaknessRowStyle}>
      <div
        style={weaknessBarTrackStyle}
        role="img"
        aria-label={`弱點壓力 ${Math.round(pressure * 100)}%（越高越該複習）`}
        title={`弱點壓力 ${Math.round(pressure * 100)}% · 越暗紅越弱、越亮綠越穩（與熟練度分開）`}
      >
        <div
          className={pulse ? 'neurons-weakness-fill is-weak' : 'neurons-weakness-fill'}
          style={{ ...weaknessBarFillStyle, width: `${Math.round(pressure * 100)}%`, background: fillColor }}
        />
      </div>
      {isWeak && onTargetedDrill && (
        <button
          type="button"
          onClick={onTargetedDrill}
          style={weaknessDrillBtnStyle(accent)}
          aria-label="一鍵特訓 — 針對這科最弱的題目開 10 題"
          title="一鍵特訓 · 針對這科最弱的 ≤10 題（優先錯題 / 低熟練 / 逾期）"
        >
          <EmojiIcon char="🎯" size={12} decorative /> 特訓
        </button>
      )}
    </div>
  )
}

/**
 * RescueChip — replaces the WeaknessIndicator row on the family with an active rescue
 * plan (add-neurons-single-subject-rescue). Surfaces the countdown, RescueScore, and a
 * 今日佇列 CTA; tapping it opens the rescue scene (its 今日佇列 = the absorbed targeted-
 * drill entry, so the family never runs two selection algorithms at once).
 */
function RescueChip({
  d,
  score,
  accent,
  onOpen,
}: {
  d: number
  score: number
  accent: string
  onOpen?: () => void
}): JSX.Element {
  const countdown = d <= 0 ? '考試日' : `D-${d}`
  return (
    <button
      type="button"
      style={rescueChipStyle(accent)}
      onClick={onOpen}
      aria-label={`考前救急進行中 · ${countdown} · RescueScore ${score} · 開啟今日佇列`}
      title="考前救急進行中 — 開啟今日佇列"
    >
      <EmojiIcon char="⏱️" size={12} decorative />
      <span style={rescueChipStrongStyle}>{countdown}</span>
      <span style={rescueChipDimStyle}>· RescueScore {score} ·</span>
      <span style={rescueChipCtaStyle(accent)}>今日佇列 →</span>
    </button>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const headerRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  flexWrap: 'wrap',
}

const rescueEntryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.3rem 0.7rem',
  borderRadius: 999,
  border: '1px solid #d4a04d',
  background: '#fdf2e0',
  color: '#8a5a1f',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1,
}

const rescueChipStyle = (accent: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  flexWrap: 'wrap',
  width: '100%',
  padding: '0.4rem 0.6rem',
  borderRadius: 8,
  border: `1px solid ${accent}`,
  background: '#fdf2e0',
  color: '#5a3f29',
  fontSize: '0.8rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
})
const rescueChipStrongStyle: React.CSSProperties = {
  fontWeight: 800,
  color: '#8a5a1f',
  fontVariantNumeric: 'tabular-nums',
}
const rescueChipDimStyle: React.CSSProperties = { color: '#8c7a55', fontVariantNumeric: 'tabular-nums' }
const rescueChipCtaStyle = (accent: string): React.CSSProperties => ({
  marginLeft: 'auto',
  fontWeight: 700,
  color: accent,
})

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
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  fontSize: '0.72rem',
  color: '#5a3f29',
  letterSpacing: '0.01em',
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  flexWrap: 'wrap',
}

// ── Weakness-pressure indicator (Feature 1) ──────────────────────────────────
const weaknessRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
}

const weaknessBarTrackStyle: React.CSSProperties = {
  flex: 1,
  height: 8,
  borderRadius: 999,
  background: '#ece3d0',
  overflow: 'hidden',
  border: '1px solid #d3c4a4',
}

const weaknessBarFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 999,
  transition: 'width 0.3s ease',
}

const weaknessUndiagnosedChipStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 600,
  color: '#8c8375',
  background: '#f0ece2',
  border: '1px dashed #c4b89e',
  borderRadius: 999,
  padding: '0.08rem 0.5rem',
}

function weaknessDrillBtnStyle(accent: string): React.CSSProperties {
  return {
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    padding: '0.16rem 0.44rem',
    borderRadius: '6px',
    border: `1px solid ${accent}`,
    background: accent,
    color: '#fff',
    fontSize: '0.7rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    lineHeight: 1.1,
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

// ─── 🔍 聚焦 button (explicit per-card maze-camera focus; secondary action) ──────
// Sits at the right of the card header; pushed right by the flex:1 name block. The「聚焦」label is
// hidden < 768px (icon-only on phones) via `.neurons-focus-label` in styles.css.

function focusBtnStyle(accent: string): React.CSSProperties {
  return {
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.2rem',
    padding: '0.18rem 0.4rem',
    borderRadius: '6px',
    border: `1px solid ${accent}`,
    background: '#fdf6e3',
    color: accent,
    fontSize: '0.72rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    lineHeight: 1.1,
  }
}

function focusBtnActiveStyle(accent: string): React.CSSProperties {
  return { ...focusBtnStyle(accent), background: accent, color: '#fff' }
}

const focusBtnLabelStyle: React.CSSProperties = {
  // class handles the < 768px hide; this keeps the label from wrapping when shown.
  whiteSpace: 'nowrap',
}

