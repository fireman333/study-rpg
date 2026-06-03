/**
 * SpriteSheetPlayer — plays a named multi-state animation for a neuron variant
 * via a horizontal sprite sheet + CSS `steps()` (no per-frame JS; compositor
 * friendly, survives backgrounded-tab rAF throttle).
 *
 * Per `add-neurons-sprite-animation-slice`. Sheets register in SPRITE_MAP under
 * `variant:<family>:<slot>:<state>`. Only the hero (藥理學 slot 3) ships sheets
 * in this slice — any variant without a sheet falls back to its static <img>,
 * so this component is safe to use anywhere.
 *
 * - `idle`   → loops (steps(N))
 * - `correct` / `evolve` → one-shot, holds last frame (steps(N, jump-none) forwards),
 *   fires `onComplete` on animationend. Remount with a changing `key` to replay.
 * - prefers-reduced-motion → static first frame (no animation).
 */
import { useId } from 'react'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { useRespectsReducedMotion } from '../lib/motion'

export type SpriteState = 'idle' | 'correct' | 'evolve'

// Frame counts + loop durations must match the assembled sheets
// (scripts/render_hero_frames.py + assemble_hero.lua).
const STATE_META: Record<SpriteState, { frames: number; ms: number; loop: boolean }> = {
  idle: { frames: 8, ms: 1040, loop: true },
  correct: { frames: 9, ms: 750, loop: false },
  evolve: { frames: 11, ms: 1125, loop: false },
}

interface SpriteSheetPlayerProps {
  /** base variant key without state, e.g. `variant:藥理學:3` */
  spriteKeyBase: string
  state: SpriteState
  /** rendered square size in px */
  size: number
  /** fired on one-shot completion (not for looping idle) */
  onComplete?: () => void
  className?: string
}

export function SpriteSheetPlayer({
  spriteKeyBase,
  state,
  size,
  onComplete,
  className,
}: SpriteSheetPlayerProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const uid = useId().replace(/:/g, '')
  const sheetUrl = SPRITE_MAP[`${spriteKeyBase}:${state}`]
  const baseUrl = SPRITE_MAP[spriteKeyBase] ?? SPRITE_MAP['variant:default']
  const meta = STATE_META[state]

  // No sheet for this variant/state → static fallback (every non-hero variant)
  if (!sheetUrl) {
    return (
      <img
        src={baseUrl}
        width={size}
        height={size}
        className={className}
        alt=""
        style={{ imageRendering: 'pixelated', display: 'block' }}
      />
    )
  }

  const sheetStyle: React.CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${sheetUrl})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${meta.frames * size}px ${size}px`,
    imageRendering: 'pixelated',
  }

  // reduced-motion → hold first frame, no animation
  if (reduced) {
    return <div className={className} style={{ ...sheetStyle, backgroundPosition: '0 0' }} />
  }

  const kf = `sheet-${uid}-${state}`
  const endX = meta.loop ? meta.frames * size : (meta.frames - 1) * size
  const steps = meta.loop ? `steps(${meta.frames})` : `steps(${meta.frames}, jump-none)`
  const tail = meta.loop ? 'infinite' : '1 forwards'
  const css = `@keyframes ${kf} { from { background-position: 0 0; } to { background-position: -${endX}px 0; } }`

  return (
    <>
      <style>{css}</style>
      <div
        className={className}
        onAnimationEnd={meta.loop ? undefined : onComplete}
        style={{ ...sheetStyle, animation: `${kf} ${meta.ms}ms ${steps} ${tail}` }}
      />
    </>
  )
}
