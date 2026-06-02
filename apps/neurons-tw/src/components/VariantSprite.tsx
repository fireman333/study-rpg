/**
 * Shared composer: base variant sprite over a semi-transparent context backdrop
 * (context-driven-variant-art). Used at every collected-variant render site (dex
 * card / unlock modal / family-section representative) so composition is identical
 * everywhere.
 *
 * All context art sits BEHIND the neuron as faint background layers, so the neuron
 * is never occluded and there is no badge alignment to get wrong (design pivot
 * 2026-06-02 — foreground corner badges crowded the soma):
 *   1. band colour wash (full cell)
 *   2. band Greek-letter watermark (δ/θ/α/β), faint, corner
 *   3. decor neuro-symbol watermark(s) (spike / myelin / Cajal), faint, centered
 *   4. base sprite on top (static <img> default, or `children` e.g. hero evolve sheet)
 */

import type { CSSProperties, ReactNode } from 'react'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import type { NeuronVariantRow } from '../lib/db'
import { variantContextArt, BAND_META } from '../lib/variant-decor'

interface VariantSpriteProps {
  row: NeuronVariantRow
  size: number
  alt?: string
  /** Optional base layer (e.g. animated SpriteSheetPlayer); defaults to a static <img>. */
  children?: ReactNode
}

export default function VariantSprite({ row, size, alt, children }: VariantSpriteProps): JSX.Element {
  const { decor, band } = variantContextArt(row)
  const baseUrl = SPRITE_MAP[row.spriteKey] ?? SPRITE_MAP['variant:default'] ?? ''
  const m = BAND_META[band]
  const stacked = decor.length > 1

  return (
    <div
      style={{ position: 'relative', width: size, height: size, overflow: 'hidden' }}
      title={`${m.label}誕生 · ${m.hz}`}
    >
      {/* 1. decor full-bleed neuro-field watermark(s), faint, behind neuron.
            No full-cell colour wash — cards keep a consistent neutral background;
            the band's only colour accent is the corner letter below. */}
      {decor.map((key) => {
        const style: CSSProperties = {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: stacked ? 0.07 : 0.11,
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }
        return <img key={key} src={SPRITE_MAP[key] ?? ''} alt="" aria-hidden="true" style={style} />
      })}
      {/* 2. band Greek-letter watermark, bottom-right corner, behind neuron —
            the sole band colour accent. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: '4%',
          bottom: '0%',
          color: m.color,
          opacity: 0.75,
          fontSize: size * 0.32,
          fontWeight: 800,
          lineHeight: 1,
          pointerEvents: 'none',
        }}
      >
        {m.greek}
      </span>
      {/* 4. base sprite on top */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {children ?? (
          <img
            src={baseUrl}
            alt={alt ?? row.displayName}
            style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
          />
        )}
      </div>
    </div>
  )
}
