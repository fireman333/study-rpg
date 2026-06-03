/**
 * MazeExpedition — 神經元小隊遠征動畫帶 (prototype spike)
 *
 * A 3-layer side-scrolling parallax band — each layer loops via background-position
 * at a different speed so the squad reads as marching forward into the brain:
 *   1. 遠景腦溝 sky   — rolling gyri/sulci, slowest (depth backdrop)
 *   2. 可愛組織 ground — pastel neural tissue the squad walks on, medium speed
 *   3. 突觸顆粒        — drifting synapse sparkles, fastest (foreground depth)
 * Plus the bobbing squad on top. Pure CSS transform / background-position (60fps,
 * battery-friendly, not rAF-throttled in backgrounded tabs).
 *
 * Squad = the rarest collected variants (P0 first), rendered as clean transparent
 * sprites via SPRITE_MAP[spriteKey] (deliberately NOT <VariantSprite> — skips its
 * context-art decor so the busy parallax stays readable). Empty collection →
 * growth-cone marchers so the band still reads.
 *
 * Shown alongside the maze when the player presses 「顯示遠征動畫」. Self-contained —
 * injects its own @keyframes.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { liveQuery } from 'dexie'
import { db, type NeuronVariantRow } from '../lib/db'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'

const skyUrl = new URL('../assets/maze/expedition-sky.png', import.meta.url).href
const groundUrl = new URL('../assets/maze/expedition-bg.png', import.meta.url).href

// Each layer scrolls by exactly its own background-size width → seamless loop
// regardless of band width (repeat-x tiles it; shifting by one tile = identical frame).
const BAND_H = 180
const GROUND_H = 120 // bottom tissue band height
const SKY_TILE = 360 // sky image squished to 2:1 tile
const GROUND_TILE = 240 // tissue 2:1 tile (GROUND_H × 2)
const PARTICLE_TILE = 110

const SQUAD_MAX = 5

/** Branch colours for the empty-collection growth-cone fallback marchers. */
const FALLBACK_COLORS = ['#ffb33e', '#ff5da2', '#46d27a', '#43c6ff']

function rarityRank(r: NeuronVariantRow['rarity']): number {
  return Number(r.slice(1)) // 'P0' → 0 (apex/rarest first)
}

/** Live squad = up to SQUAD_MAX rarest collected variants (P0 first, older as tiebreak). */
function useExpeditionSquad(): NeuronVariantRow[] {
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

/** Inline growth-cone glyph (empty-team fallback marcher). */
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

const wrapStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 760,
  height: BAND_H,
  margin: '0.75rem auto 0',
  borderRadius: 12,
  overflow: 'hidden',
  background: '#0a0820',
  boxShadow: '0 0 0 1px #1d1b3a, 0 8px 30px #0008',
}

export default function MazeExpedition({ onHide }: { onHide?: () => void }): JSX.Element {
  const squad = useExpeditionSquad()

  // depth-stagger: alternate near (bigger, lower, opaque) / far (smaller, higher, faded)
  const members =
    squad.length > 0
      ? squad.map((row, i) => ({ key: `${row.familyId}-${row.slotIndex}`, row, i }))
      : FALLBACK_COLORS.map((c, i) => ({ key: `cone-${i}`, color: c, i }))

  return (
    <div style={wrapStyle} aria-label="神經元小隊遠征動畫">
      <style>{KEYFRAMES}</style>

      {/* 1. far sky — rolling brain sulci, slowest */}
      <div className="exp-sky" />
      {/* 2. tissue ground — pastel neural floor, medium */}
      <div className="exp-ground" />
      {/* 3. foreground synapse particles — fastest */}
      <div className="exp-particles" />
      {/* vignette — soft edge depth */}
      <div className="exp-vignette" />

      {/* squad — bobbing marchers, spread + front-to-back staggered */}
      <div className="exp-squad">
        {members.map((m) => {
          const near = m.i % 2 === 0
          const size = near ? 96 : 78
          const memberStyle: CSSProperties = {
            animation: `exp-bob ${1.5 + (m.i % 3) * 0.18}s ease-in-out ${m.i * 0.16}s infinite`,
            marginBottom: near ? 0 : 16,
            opacity: near ? 1 : 0.9,
            zIndex: near ? 2 : 1,
            filter: near ? 'none' : 'brightness(0.86)',
            position: 'relative',
          }
          return (
            <div key={m.key} className="exp-marcher" style={memberStyle}>
              {'row' in m ? (
                // clean transparent sprite — no context-art backdrop (the parallax IS the
                // background); soft shadow grounds it + faint halo feathers the edge.
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
              ) : (
                <ConeMarcher size={size - 12} color={m.color} />
              )}
              <span className="exp-shadow" />
            </div>
          )
        })}
      </div>

      {/* caption */}
      <span className="exp-caption">🧠 小隊遠征中…</span>

      {/* quick-hide — kill the animation when it distracts from reading / answering */}
      {onHide && (
        <button
          type="button"
          className="exp-hide"
          onClick={onHide}
          aria-label="隱藏遠征動畫"
          title="隱藏遠征動畫（閱讀／答題時不干擾；旅程仍持續）"
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
  background-size: ${SKY_TILE}px ${BAND_H}px;
  image-rendering: pixelated;
  opacity: 0.92;
  animation: exp-scroll-sky 34s linear infinite;
}

.exp-ground {
  position: absolute; left: 0; right: 0; bottom: 0; height: ${GROUND_H}px; z-index: 1;
  background-image: url(${groundUrl});
  background-repeat: repeat-x;
  background-position: bottom left;
  background-size: ${GROUND_TILE}px ${GROUND_H}px;
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
  background-size: ${PARTICLE_TILE}px ${PARTICLE_TILE}px;
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
  display: flex; align-items: flex-end; gap: 22px;
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
  font-family: 'Cubic 11', 'Noto Sans TC', sans-serif;
}

.exp-hide {
  position: absolute; right: 8px; top: 7px; z-index: 5;
  width: 22px; height: 22px; padding: 0; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #2a2750; border-radius: 999px;
  background: rgba(10,8,30,0.55); color: #cfc8ff;
  font-size: 1rem; font-weight: 700; cursor: pointer;
  font-family: 'Cubic 11', 'Noto Sans TC', sans-serif;
}
.exp-hide:hover { background: rgba(40,30,70,0.85); color: #fff; }

/* Respect OS reduced-motion: freeze every layer + the bob (static scene, no churn). */
@media (prefers-reduced-motion: reduce) {
  .exp-sky, .exp-ground, .exp-particles, .exp-marcher { animation: none !important; }
}

@keyframes exp-scroll-sky { to { background-position-x: -${SKY_TILE}px; } }
@keyframes exp-scroll-ground { to { background-position-x: -${GROUND_TILE}px; } }
@keyframes exp-scroll-particles { to { background-position-x: -${PARTICLE_TILE}px; } }
@keyframes exp-bob {
  0%, 100% { transform: translateY(0) rotate(-1.5deg); }
  50%      { transform: translateY(-10px) rotate(1.5deg); }
}
`
