/**
 * Ng0717BranchBuds — the「NG-0717 分支印記」layer (add-neurons-ng0717-lineage-imprints).
 * As the player methodically completes each subject's daily prescription, NG-0717
 * grows a per-subject dendritic bud. Buds accumulate around the mascot; a subject
 * that recurs warms its existing bud (sprout → warm → myelinated) rather than adding
 * a second one.
 *
 * Anti-anxiety contract (spec: neurons-daily-prescription「lineage imprint UI」):
 *   - Renders ONLY grown buds. An un-grown subject is NOT shown at all — no empty
 *     slot, no grey placeholder, no gap. There is NO denominator anywhere (no X/11,
 *     no remaining-count, no completion %).
 *   - Copy is accumulate-positive only (長出／新生分支／已固化); never 收集完成／尚缺.
 *
 * Presentation only — every value comes from the imprint service via useNg0717Imprints.
 * Per-subject colour tint is a CSS multiply-mask over one shared bud sprite, so the
 * dark outline + gloss survive while each bud takes its subject's colour.
 */

import { useState } from 'react'
import type { Ng0717Imprint, ImprintStage } from '../lib/services/prescription'
import { imprintStage } from '../lib/services/prescription'
import { useRespectsReducedMotion } from '../lib/motion/useRespectsReducedMotion'
import budSprite from '../assets/ng0717/bud.png'

/** Imprint enriched with its subject's display colour + label + NT branch (built by the caller). */
export interface EnrichedImprint extends Ng0717Imprint {
  color: string
  displayName: string
  /** Neurotransmitter branch (`DA` / `5HT` / `GABA` / `Glu`) — drives the accent motif. */
  group: string
}

// Per-NT-branch accent motif — a purely-decorative glyph layered on a grown bud to
// deepen its identity (the neurotransmitter family of that subject). Programmatic (no
// sprite); renders ONLY on grown buds; introduces NO legend / tally /完整集 implication.
type AccentKind = 'spark' | 'dot' | 'bar' | 'triangle'
const BRANCH_ACCENT: Record<string, AccentKind> = {
  DA: 'spark', // 多巴胺 — vesicle-release spark
  '5HT': 'dot', // 血清素 — soma dot
  GABA: 'bar', // GABA — inhibitory bar
  Glu: 'triangle', // 麩胺酸 — excitatory up-tick
}

/** Pure map from NT branch → accent motif kind (null for an unknown branch → no accent). */
export function branchAccentKind(group: string): AccentKind | null {
  return BRANCH_ACCENT[group] ?? null
}

const ACCENT_FILL = '#fff6e0'
const ACCENT_EDGE = '#3a2a1a'
function accentGlyph(kind: AccentKind): JSX.Element {
  const p = { fill: ACCENT_FILL, stroke: ACCENT_EDGE, strokeWidth: 0.9, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'spark':
      return <path d="M6 0.6 L7.1 4.9 L11.4 6 L7.1 7.1 L6 11.4 L4.9 7.1 L0.6 6 L4.9 4.9 Z" {...p} />
    case 'dot':
      return <circle cx="6" cy="6" r="3" {...p} />
    case 'bar':
      return <rect x="1.6" y="4.6" width="8.8" height="2.8" rx="1.3" {...p} />
    case 'triangle':
      return <path d="M6 1.8 L10.6 9.6 L1.4 9.6 Z" {...p} />
  }
}

const STAGE_WORD: Record<Exclude<ImprintStage, 'absent'>, string> = {
  sprout: '新生分支',
  warm: '分支變暖',
  myelinated: '已髓鞘化',
}

// Per-stage bud treatment (brightness / glow / scale) — qualitative warming only.
const STAGE_STYLE: Record<Exclude<ImprintStage, 'absent'>, { scale: number; glow: number; opacity: number }> = {
  sprout: { scale: 0.86, glow: 0, opacity: 0.9 },
  warm: { scale: 0.95, glow: 3, opacity: 1 },
  myelinated: { scale: 1, glow: 6, opacity: 1 },
}

interface Props {
  imprints: EnrichedImprint[]
}

export function Ng0717BranchBuds({ imprints }: Props): JSX.Element | null {
  const prefersReduced = useRespectsReducedMotion()
  const [expanded, setExpanded] = useState(false)

  // Absent: nothing grown yet → render nothing (no placeholder, no gap).
  if (imprints.length === 0) return null

  return (
    <section style={sectionStyle} aria-label="NG-0717 分支印記">
      <button
        type="button"
        style={headerBtnStyle}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? '收合分支印記' : '展開分支印記'}
      >
        <span style={leadStyle}>NG-0717 長出的分支</span>
        <span style={budsRowStyle}>
          {imprints.map((im) => (
            <Bud key={im.subjectId} imprint={im} prefersReduced={prefersReduced} />
          ))}
        </span>
        <span style={chevStyle} aria-hidden>{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <ul style={detailListStyle}>
          {imprints.map((im) => {
            const stage = imprintStage(im.touches) as Exclude<ImprintStage, 'absent'>
            return (
              <li key={im.subjectId} style={detailRowStyle}>
                <Bud imprint={im} prefersReduced={prefersReduced} size={20} />
                <span style={detailNameStyle}>
                  {im.subjectId} · {im.displayName}
                </span>
                <span style={{ ...detailStageStyle, color: im.color }}>{STAGE_WORD[stage]}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Bud({
  imprint,
  prefersReduced,
  size = 24,
}: {
  imprint: EnrichedImprint
  prefersReduced: boolean
  size?: number
}): JSX.Element {
  const stage = imprintStage(imprint.touches) as Exclude<ImprintStage, 'absent'>
  const { scale, glow, opacity } = STAGE_STYLE[stage]
  const px = Math.round(size * scale)
  const accentKind = branchAccentKind(imprint.group)
  const accentPx = Math.max(7, Math.round(px * 0.44))
  const accentInset = Math.round(px * 0.06)
  return (
    <span
      title={`${imprint.subjectId}（${STAGE_WORD[stage]}）`}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: px,
        height: px,
        opacity,
        transition: prefersReduced ? 'none' : 'opacity 0.4s ease',
        flexShrink: 0,
      }}
    >
      <img
        src={budSprite}
        alt=""
        width={px}
        height={px}
        style={{
          display: 'block',
          width: px,
          height: px,
          imageRendering: 'pixelated',
          filter: glow > 0 ? `drop-shadow(0 0 ${glow}px ${imprint.color})` : 'none',
        }}
      />
      {/* Per-subject colour tint: multiply the family colour within the bud shape,
          preserving the shared sprite's outline + gloss. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: imprint.color,
          mixBlendMode: 'multiply',
          WebkitMaskImage: `url(${budSprite})`,
          maskImage: `url(${budSprite})`,
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
      {/* Per-NT-branch accent motif (top-right) — decorative branch identity only. */}
      {accentKind && (
        <svg
          viewBox="0 0 12 12"
          width={accentPx}
          height={accentPx}
          aria-hidden
          style={{ position: 'absolute', top: -accentInset, right: -accentInset }}
        >
          {accentGlyph(accentKind)}
        </svg>
      )}
    </span>
  )
}

// ── Styles (cream theme, matches DailyPrescriptionCard) ──
const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
}

const headerBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.5rem 0.6rem',
  background: '#fffdf8',
  border: '1px solid #e6d6b8',
  borderRadius: '6px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
}

const leadStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#7a5c3a',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const budsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.15rem 0.25rem',
  flex: 1,
  minWidth: 0,
}

const chevStyle: React.CSSProperties = {
  color: '#8a6a3a',
  fontWeight: 800,
  fontSize: '0.85rem',
  flexShrink: 0,
}

const detailListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: '0.1rem 0.2rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
}

const detailRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const detailNameStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#5a3f29',
}

const detailStageStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}
