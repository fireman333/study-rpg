/**
 * ConnectorSection — the「連結神經元」collection section on /collection
 * (add-neurons-connector-neuron-family).
 *
 * A flat grid (NOT grouped by family) of the closed 55-connector set. Each entry
 * is a connector hub bridging two subject families, unlocked the first time that
 * pair's synaptic wire reaches `strong`. Unlocked = a colored card; locked = a grey
 * silhouette. Visual is PROCEDURAL — a split-color bridge glyph derived from the two
 * families' FAMILY_COLOR (no per-pair art ships this change); a `connector:<pairKey>`
 * sprite, when present (follow-up generate-connector-sprites), overrides it.
 *
 * Spec: openspec/specs/neurons-connector-family/spec.md
 */

import { useMemo } from 'react'
import type { ContentPack } from '@study-rpg/core'
import { connectorColors, connectorSpriteKey } from '@study-rpg/content-neurons-tw'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { useConnectors, type ConnectorEntry } from '../lib/services/connector'
import { EmojiIcon } from './EmojiIcon'

/** Strip the "— English persona" suffix used in connectome family displayNames. */
const shortFamilyLabel = (displayName: string): string => displayName.replace(/\s*—.+$/, '')

export default function ConnectorSection({ pack }: { pack: ContentPack }): JSX.Element {
  const { entries, unlockedCount, total } = useConnectors()

  const labelOf = useMemo(() => {
    const byId = new Map(pack.subjects.map((s) => [s.id, shortFamilyLabel(s.displayName)]))
    return (id: string): string => byId.get(id) ?? id
  }, [pack.subjects])

  return (
    <section style={sectionStyle} aria-label="連結神經元">
      <div style={headerRowStyle}>
        <h2 style={titleStyle}>
          <EmojiIcon char="🔗" size={16} /> 連結神經元
          <span style={countStyle}>{unlockedCount} / {total}</span>
        </h2>
      </div>
      <p style={blurbStyle}>
        兩科的突觸連線首次達到「強連結」時，會長出一隻橋接這兩科的<strong>連結神經元</strong>（connector hub）。永久收藏，連線衰退也不會消失。
      </p>
      <div style={gridStyle}>
        {entries.map((entry) => (
          <ConnectorCard key={entry.pairKey} entry={entry} labelOf={labelOf} />
        ))}
      </div>
    </section>
  )
}

function ConnectorCard({
  entry,
  labelOf,
}: {
  entry: ConnectorEntry
  labelOf: (id: string) => string
}): JSX.Element {
  const { pairKey, familyA, familyB, unlocked } = entry
  const [colorA, colorB] = connectorColors(pairKey)
  const spriteUrl = SPRITE_MAP[connectorSpriteKey(pairKey)]
  const labelA = labelOf(familyA)
  const labelB = labelOf(familyB)

  return (
    <div
      style={{
        ...cardStyle,
        opacity: unlocked ? 1 : 0.55,
        background: unlocked
          ? `linear-gradient(135deg, ${colorA}22, ${colorB}22)`
          : '#f1ead9',
        borderColor: unlocked ? '#c9a44d' : '#cdbfa2',
      }}
      aria-label={
        unlocked
          ? `連結神經元：${labelA} × ${labelB}（已解鎖）`
          : `連結神經元：${labelA} × ${labelB}（未解鎖）`
      }
    >
      <div style={glyphWrapStyle}>
        {spriteUrl ? (
          <img
            src={spriteUrl}
            width={56}
            height={56}
            alt=""
            style={{ imageRendering: 'pixelated', filter: unlocked ? 'none' : 'grayscale(1)' }}
          />
        ) : (
          <ConnectorGlyph colorA={colorA} colorB={colorB} size={56} locked={!unlocked} />
        )}
      </div>
      <div style={pairLabelStyle}>
        <span style={{ color: unlocked ? '#3a2a1a' : '#9b8c70' }}>{labelA}</span>
        <span style={bridgeArrowStyle}>⇌</span>
        <span style={{ color: unlocked ? '#3a2a1a' : '#9b8c70' }}>{labelB}</span>
      </div>
    </div>
  )
}

/**
 * Procedural bridge-axon glyph: two somata (the two family colors) joined by an
 * axon with a synaptic glow at the junction. Locked → grey silhouette, glow off.
 */
function ConnectorGlyph({
  colorA,
  colorB,
  size,
  locked,
}: {
  colorA: string
  colorB: string
  size: number
  locked: boolean
}): JSX.Element {
  const a = locked ? '#c2b290' : colorA
  const b = locked ? '#c2b290' : colorB
  const axon = locked ? '#bfb091' : '#8c6d4a'
  return (
    <svg width={size} height={Math.round(size * 0.62)} viewBox="0 0 64 40" aria-hidden="true">
      <line x1="16" y1="20" x2="48" y2="20" stroke={axon} strokeWidth="3" strokeLinecap="round" />
      {!locked && <circle cx="32" cy="20" r="7" fill="#fff7d6" opacity="0.9" />}
      <circle cx="32" cy="20" r="3.2" fill={locked ? '#bfb091' : '#d4a04d'} />
      <line x1="16" y1="20" x2="6" y2="12" stroke={a} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="20" x2="6" y2="28" stroke={a} strokeWidth="2" strokeLinecap="round" />
      <line x1="48" y1="20" x2="58" y2="12" stroke={b} strokeWidth="2" strokeLinecap="round" />
      <line x1="48" y1="20" x2="58" y2="28" stroke={b} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="20" r="8" fill={a} stroke="#3a2a1a" strokeWidth="1.2" />
      <circle cx="48" cy="20" r="8" fill={b} stroke="#3a2a1a" strokeWidth="1.2" />
    </svg>
  )
}

// ─── Styles (matches CollectionPage cream/brown pixel aesthetic) ─────────────

const sectionStyle: React.CSSProperties = { marginTop: '2rem' }

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.6rem',
  margin: '0 0 0.4rem',
  borderBottom: '2px solid #d8c7a0',
  paddingBottom: '0.2rem',
}

const titleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
  color: '#5a3e1a',
}

const countStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#8c6d4a',
}

const blurbStyle: React.CSSProperties = {
  margin: '0 0 0.8rem',
  fontSize: '0.74rem',
  color: '#8c6d4a',
  lineHeight: 1.5,
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '0.6rem',
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderRadius: '8px',
  padding: '0.7rem 0.5rem 0.5rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.35rem',
  textAlign: 'center',
}

const glyphWrapStyle: React.CSSProperties = {
  width: '64px',
  height: '46px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const pairLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '0.72rem',
  fontWeight: 700,
  lineHeight: 1.2,
  flexWrap: 'wrap',
  justifyContent: 'center',
}

const bridgeArrowStyle: React.CSSProperties = { color: '#b8893a', fontWeight: 400 }
