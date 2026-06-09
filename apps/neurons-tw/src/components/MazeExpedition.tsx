/**
 * MazeExpedition — 神經元遠征隊動畫帶 (rework-neurons-squads)
 *
 * A 3-layer side-scrolling parallax band — each layer loops via background-position
 * at a different speed so the squad reads as marching forward into the brain:
 *   1. 遠景腦溝 sky   — rolling gyri/sulci, slowest (depth backdrop)
 *   2. 可愛組織 ground — pastel neural tissue the squad walks on, medium speed
 *   3. 突觸顆粒        — drifting synapse sparkles, fastest (foreground depth)
 * Plus the bobbing squad on top. Pure CSS transform / background-position (60fps,
 * battery-friendly, not rAF-throttled in backgrounded tabs).
 *
 * Squad source = the player's active squad「神經元遠征隊」(useActiveSquad); when the
 * squad is empty it falls back to the five rarest collected variants, and to
 * growth-cone marchers when the collection itself is empty. Sprites render as clean
 * transparent images (deliberately NOT <VariantSprite> — skips its context-art decor
 * so the busy parallax stays readable).
 *
 * Two render contexts via CSS-variable-driven dimensions (so two instances — the
 * homepage band + a compact band in QuizModal — never collide on global classes):
 *   - full (homepage): large band, animates while reading-active (`paused` toggles it)
 *   - compact (QuizModal upper background): smaller + translucent + non-interactive
 *
 * Self-contained — injects its own @keyframes (var-driven, so duplicate injection
 * across instances is harmless).
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { liveQuery } from 'dexie'
import { db, type NeuronVariantRow } from '../lib/db'
import { useActiveSquad } from '../lib/services/study-squad'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { livingCompanions, type EquipmentDef } from '@study-rpg/content-neurons-tw'
import { EmojiIcon } from './EmojiIcon'
import { useRespectsReducedMotion, SYNAPSE_TIMINGS } from '../lib/motion'
import { onAnswerCorrect, onAnswerWrong } from '../lib/maze/answer-feedback'

const skyUrl = new URL('../assets/maze/expedition-sky.png', import.meta.url).href
const groundUrl = new URL('../assets/maze/expedition-bg.png', import.meta.url).href

const SQUAD_MAX = 5

/** Branch colours for the empty-collection growth-cone fallback marchers. */
const FALLBACK_COLORS = ['#ffb33e', '#ff5da2', '#46d27a', '#43c6ff']

/** Glia companions march smaller than the squad — they're little tagalongs, not
 * equals of the neuron party (dogfood-tunable). */
const COMPANION_MARCHER_SCALE = 0.6

/** Per-context dimensions, fed to the band as CSS variables. */
interface BandDims {
  h: number
  groundH: number
  skyTile: number
  groundTile: number
  particleTile: number
  gap: number
  near: number
  far: number
  maxW: number | string
  opacity: number
}
const FULL_DIMS: BandDims = {
  h: 180, groundH: 120, skyTile: 360, groundTile: 240, particleTile: 110,
  gap: 22, near: 96, far: 78, maxW: 760, opacity: 1,
}
const COMPACT_DIMS: BandDims = {
  h: 92, groundH: 60, skyTile: 184, groundTile: 120, particleTile: 70,
  gap: 12, near: 54, far: 44, maxW: '100%', opacity: 0.5,
}

function rarityRank(r: NeuronVariantRow['rarity']): number {
  return Number(r.slice(1)) // 'P0' → 0 (apex/rarest first)
}

/** Fallback squad = up to SQUAD_MAX rarest collected variants (P0 first, older tiebreak). */
function useRarestFallbackSquad(): NeuronVariantRow[] {
  const [rows, setRows] = useState<NeuronVariantRow[]>([])
  useEffect(() => {
    const sub = liveQuery(() => db.neuronVariants.toArray()).subscribe({
      next: (all) => {
        const sorted = [...all].sort((a, b) => {
          const ra = rarityRank(a.rarity)
          const rb = rarityRank(b.rarity)
          if (ra !== rb) return ra - rb
          return a.rolledAt - b.rolledAt
        })
        setRows(sorted.slice(0, SQUAD_MAX))
      },
      error: () => setRows([]),
    })
    return () => sub.unsubscribe()
  }, [])
  return rows
}

/** Pure: the active squad drives the band; empty squad → rarest-collected fallback. */
export function resolveBandSquad(
  active: NeuronVariantRow[],
  fallback: NeuronVariantRow[],
): NeuronVariantRow[] {
  return active.length > 0 ? active : fallback
}

/** Live band squad = active squad「神經元遠征隊」, falling back to the rarest collected. */
function useBandSquad(): NeuronVariantRow[] {
  const active = useActiveSquad()
  const fallback = useRarestFallbackSquad()
  return resolveBandSquad(active, fallback)
}

/**
 * Owned living-cell glial companions (oligodendrocyte / astrocyte) that march
 * with the expedition squad (add-neurons-living-companion-render). Derived live
 * from the already-synced `equipment` table — the glia only appear here, riding
 * along with the squad parade, never as a permanent brain-map fixture.
 */
function useOwnedCompanions(): readonly EquipmentDef[] {
  const [defs, setDefs] = useState<readonly EquipmentDef[]>([])
  useEffect(() => {
    const sub = liveQuery(() => db.equipment.toArray()).subscribe({
      next: (rows) => setDefs(livingCompanions(rows.map((r) => r.equipmentId))),
      error: () => setDefs([]),
    })
    return () => sub.unsubscribe()
  }, [])
  return defs
}

/** Companion sprite — placeholder-first: real animated `companion:<id>` frames
 * (generate-companion-animation-frames follow-up) → static `equipment:<id>` art. */
function companionSpriteUrl(def: EquipmentDef): string {
  return (
    SPRITE_MAP[`companion:${def.equipmentId}`] ??
    SPRITE_MAP[def.artworkId] ??
    SPRITE_MAP['variant:default'] ??
    ''
  )
}

/** Inline growth-cone glyph (empty-collection fallback marcher). */
function ConeMarcher({ size, color }: { size: number; color: string }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <g stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.85}>
        <line x1="12" y1="13" x2="6" y2="5" />
        <line x1="12" y1="13" x2="12" y2="3" />
        <line x1="12" y1="13" x2="18" y2="5" />
        <line x1="12" y1="13" x2="20" y2="11" />
      </g>
      <circle cx="12" cy="15" r="4" fill={color} stroke="#fff2cf" strokeWidth={1} />
    </svg>
  )
}

interface Props {
  /** Quick-hide control (homepage band). Omitted on the compact quiz band. */
  onHide?: () => void
  /** Compact + translucent + non-interactive variant for the QuizModal upper background. */
  compact?: boolean
  /** Freeze the animation to a static scene (homepage band when reading is not active). */
  paused?: boolean
}

export default function MazeExpedition({ onHide, compact = false, paused = false }: Props): JSX.Element {
  const squad = useBandSquad()
  const companions = useOwnedCompanions()
  const d = compact ? COMPACT_DIMS : FULL_DIMS

  // Answer-feedback (neurons-juice-animations): correct → companion pulse glow;
  // wrong → one-shot band synapse-decay dim. Both nonces key a one-shot element
  // so each answer replays. Reduced-motion skips both (gated at render).
  const reduced = useRespectsReducedMotion()
  const [correctNonce, setCorrectNonce] = useState(0)
  const [decayNonce, setDecayNonce] = useState(0)
  useEffect(() => {
    const offCorrect = onAnswerCorrect(() => setCorrectNonce((n) => n + 1))
    const offWrong = onAnswerWrong(() => setDecayNonce((n) => n + 1))
    return () => {
      offCorrect()
      offWrong()
    }
  }, [])

  // depth-stagger: alternate near (bigger, lower, opaque) / far (smaller, higher, faded)
  const squadMembers =
    squad.length > 0
      ? squad.map((row, i) => ({ key: `${row.familyId}-${row.slotIndex}`, row, i }))
      : FALLBACK_COLORS.map((c, i) => ({ key: `cone-${i}`, color: c, i }))
  // Owned glia companions march at the BACK of the parade (glia follow the
  // neurons); the index continues so depth-stagger + bob offsets stay coherent.
  const companionMembers = companions.map((def, j) => ({
    key: `companion-${def.equipmentId}`,
    companion: def,
    i: squadMembers.length + j,
  }))
  const members = [...squadMembers, ...companionMembers]

  const wrapStyle: CSSProperties = {
    position: compact ? 'absolute' : 'relative',
    ...(compact ? { left: 0, right: 0, top: 0 } : {}),
    width: '100%',
    maxWidth: d.maxW,
    height: d.h,
    margin: compact ? 0 : '0.75rem auto 0',
    borderRadius: compact ? 0 : 12,
    overflow: 'hidden',
    background: compact ? 'transparent' : '#0a0820',
    boxShadow: compact ? 'none' : '0 0 0 1px #1d1b3a, 0 8px 30px #0008',
    opacity: d.opacity,
    pointerEvents: compact ? 'none' : 'auto',
    // CSS variables drive the parallax dimensions so both instances share one
    // (var-based) stylesheet without colliding.
    ['--exp-h' as string]: `${d.h}px`,
    ['--exp-ground-h' as string]: `${d.groundH}px`,
    ['--exp-sky-tile' as string]: `${d.skyTile}px`,
    ['--exp-ground-tile' as string]: `${d.groundTile}px`,
    ['--exp-particle-tile' as string]: `${d.particleTile}px`,
    ['--exp-gap' as string]: `${d.gap}px`,
  }

  return (
    <div
      style={wrapStyle}
      className={paused ? 'exp-paused' : undefined}
      aria-label="神經元遠征隊動畫"
      aria-hidden={compact ? true : undefined}
    >
      <style>{KEYFRAMES}</style>

      {/* 1. far sky — rolling brain sulci, slowest */}
      <div className="exp-sky" />
      {/* 2. tissue ground — pastel neural floor, medium */}
      <div className="exp-ground" />
      {/* 3. foreground synapse particles — fastest */}
      <div className="exp-particles" />
      {/* vignette — soft edge depth */}
      <div className="exp-vignette" />

      {/* one-shot synapse-decay dim on a wrong answer (neurons-juice-animations);
          duration reuses SYNAPSE_TIMINGS.decay. Skipped under reduced-motion. */}
      {decayNonce > 0 && !reduced && (
        <div
          key={`decay-${decayNonce}`}
          className="exp-decay"
          aria-hidden
          style={{ animationDuration: `${SYNAPSE_TIMINGS.decay}ms` }}
        />
      )}

      {/* squad — bobbing marchers, spread + front-to-back staggered */}
      <div className="exp-squad">
        {members.map((m) => {
          const near = m.i % 2 === 0
          const size = near ? d.near : d.far
          const memberStyle: CSSProperties = {
            animation: `exp-bob ${1.5 + (m.i % 3) * 0.18}s ease-in-out ${m.i * 0.16}s infinite`,
            marginBottom: near ? 0 : (compact ? 8 : 16),
            opacity: near ? 1 : 0.9,
            zIndex: near ? 2 : 1,
            filter: near ? 'none' : 'brightness(0.86)',
            position: 'relative',
          }
          return (
            <div key={m.key} className="exp-marcher" style={memberStyle}>
              {'row' in m ? (
                <img
                  src={SPRITE_MAP[m.row.spriteKey] ?? SPRITE_MAP['variant:default'] ?? ''}
                  width={size}
                  height={size}
                  alt={m.row.displayName}
                  draggable={false}
                  style={{
                    imageRendering: 'pixelated',
                    filter:
                      'drop-shadow(0 2px 3px rgba(0,0,0,0.55)) drop-shadow(0 0 8px rgba(255,255,255,0.5)) drop-shadow(0 0 15px rgba(255,255,255,0.3))',
                  }}
                />
              ) : 'companion' in m ? (
                <>
                  <img
                    src={companionSpriteUrl(m.companion)}
                    width={Math.round(size * COMPANION_MARCHER_SCALE)}
                    height={Math.round(size * COMPANION_MARCHER_SCALE)}
                    alt={m.companion.displayName}
                    draggable={false}
                    style={{
                      imageRendering: 'pixelated',
                      // cyan-tinted glia glow — reads as a glial companion, distinct
                      // from the variant marchers' white aura.
                      filter:
                        'drop-shadow(0 2px 3px rgba(0,0,0,0.55)) drop-shadow(0 0 7px rgba(150,235,255,0.5))',
                    }}
                  />
                  {/* one-shot pulse glow on correct answer (companion reaction) */}
                  {correctNonce > 0 && !reduced && (
                    <span key={`cpulse-${correctNonce}`} className="exp-comp-pulse" aria-hidden />
                  )}
                </>
              ) : (
                <ConeMarcher size={size - 12} color={m.color} />
              )}
              <span className="exp-shadow" />
            </div>
          )
        })}
      </div>

      {/* caption — homepage only (the compact quiz band stays unobtrusive).
          Reading-time framing: the squad is exploring the maze as you study. */}
      {!compact && (
        <span className="exp-caption">
          <EmojiIcon char="🧠" size={16} /> 神經元遠征隊・探索迷宮中…
        </span>
      )}

      {/* quick-hide — kill the animation when it distracts from reading / answering.
          Restore path is the ❓ Help menu (the on-maze toggle chip was removed). */}
      {onHide && !compact && (
        <button
          type="button"
          className="exp-hide"
          onClick={onHide}
          aria-label="隱藏遠征動畫"
          title="隱藏遠征動畫（旅程仍持續；可於說明選單 ❓ 恢復）"
        >
          −
        </button>
      )}
    </div>
  )
}

const KEYFRAMES = `
.exp-sky {
  position: absolute; inset: 0; z-index: 0;
  background-image: url(${skyUrl});
  background-repeat: repeat-x;
  background-size: var(--exp-sky-tile) var(--exp-h);
  image-rendering: pixelated;
  opacity: 0.92;
  animation: exp-scroll-sky 34s linear infinite;
}

.exp-ground {
  position: absolute; left: 0; right: 0; bottom: 0; height: var(--exp-ground-h); z-index: 1;
  background-image: url(${groundUrl});
  background-repeat: repeat-x;
  background-position: bottom left;
  background-size: var(--exp-ground-tile) var(--exp-ground-h);
  image-rendering: pixelated;
  -webkit-mask-image: linear-gradient(to top, #000 62%, transparent 100%);
  mask-image: linear-gradient(to top, #000 62%, transparent 100%);
  animation: exp-scroll-ground 17s linear infinite;
}

.exp-particles {
  position: absolute; inset: 0; z-index: 2;
  background-image:
    radial-gradient(circle at 10px 22px, rgba(255,230,180,0.6) 0 1.6px, transparent 2.4px),
    radial-gradient(circle at 50px 72px, rgba(150,235,255,0.55) 0 1.6px, transparent 2.4px),
    radial-gradient(circle at 84px 38px, rgba(255,170,220,0.55) 0 1.6px, transparent 2.4px);
  background-repeat: repeat;
  background-size: var(--exp-particle-tile) var(--exp-particle-tile);
  filter: blur(0.4px);
  opacity: 0.7;
  animation: exp-scroll-particles 6.5s linear infinite;
}

.exp-vignette {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background:
    linear-gradient(to bottom, rgba(10,8,32,0.5) 0%, transparent 20%, transparent 70%, rgba(10,8,32,0.7) 100%);
}

.exp-squad {
  position: absolute; left: 50%; bottom: 12px;
  transform: translateX(-50%);
  display: flex; align-items: flex-end; gap: var(--exp-gap);
  z-index: 3; pointer-events: none;
}
.exp-marcher { display: flex; flex-direction: column; align-items: center; }
.exp-shadow {
  display: block; width: 64%; height: 7px; margin-top: -5px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%);
}

.exp-caption {
  position: absolute; left: 10px; top: 8px; z-index: 4;
  font-size: 0.72rem; color: #efeaff;
  background: rgba(10,8,30,0.5); border: 1px solid #2a2750;
  border-radius: 999px; padding: 2px 9px;
  font-family: var(--font-pixel-cjk);
}

.exp-hide {
  position: absolute; right: 8px; top: 7px; z-index: 5;
  width: 22px; height: 22px; padding: 0; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #2a2750; border-radius: 999px;
  background: rgba(10,8,30,0.55); color: #cfc8ff;
  font-size: 1rem; font-weight: 700; cursor: pointer;
  font-family: var(--font-pixel-cjk);
}
.exp-hide:hover { background: rgba(40,30,70,0.85); color: #fff; }

/* Auto-trigger: when paused (homepage band while reading is not active), freeze
   every layer + the bob to a static scene. */
.exp-paused .exp-sky,
.exp-paused .exp-ground,
.exp-paused .exp-particles,
.exp-paused .exp-marcher { animation-play-state: paused !important; }

/* one-shot synapse-decay dim overlay (wrong answer). Duration set inline from
   SYNAPSE_TIMINGS.decay; longhands here so the shorthand doesn't reset it. */
.exp-decay {
  position: absolute; inset: 0; z-index: 4; pointer-events: none; opacity: 0;
  background: radial-gradient(circle at 50% 55%, rgba(150,46,46,0.42), rgba(10,8,32,0.5) 75%);
  animation-name: exp-decay-dim;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}
@keyframes exp-decay-dim {
  0% { opacity: 0; }
  28% { opacity: 1; }
  100% { opacity: 0; }
}

/* one-shot companion pulse glow (correct answer). */
.exp-comp-pulse {
  position: absolute; left: 50%; top: 45%; width: 0; height: 0; z-index: 4;
  pointer-events: none; border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(150,235,255,0.85), 0 0 16px 6px rgba(150,235,255,0.5);
  animation: exp-comp-pulse-anim 0.6s ease-out forwards;
}
@keyframes exp-comp-pulse-anim {
  0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
  35%  { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.6); }
}

/* Respect OS reduced-motion: freeze every layer + the bob (static scene, no churn).
   The decay / pulse one-shots are already render-gated by useRespectsReducedMotion,
   but disable them here too as belt-and-suspenders. */
@media (prefers-reduced-motion: reduce) {
  .exp-sky, .exp-ground, .exp-particles, .exp-marcher { animation: none !important; }
  .exp-decay, .exp-comp-pulse { animation: none !important; opacity: 0 !important; }
}

@keyframes exp-scroll-sky { to { background-position-x: calc(-1 * var(--exp-sky-tile)); } }
@keyframes exp-scroll-ground { to { background-position-x: calc(-1 * var(--exp-ground-tile)); } }
@keyframes exp-scroll-particles { to { background-position-x: calc(-1 * var(--exp-particle-tile)); } }
@keyframes exp-bob {
  0%, 100% { transform: translateY(0) rotate(-1.5deg); }
  50%      { transform: translateY(-10px) rotate(1.5deg); }
}
`
