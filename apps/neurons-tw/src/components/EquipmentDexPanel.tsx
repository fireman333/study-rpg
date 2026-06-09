import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  EQUIPMENT_CATALOG,
  type EquipmentDef,
  type EquipmentLane,
  type EquipmentRarity,
} from '@study-rpg/content-neurons-tw'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { db } from '../lib/db'

/**
 * Permanent equipment/companion dex (add-neurons-acceleration-system §6.2). A
 * P1–P5 collectible grid — owned items show art + lane + bonus; unowned show a
 * rarity-coded silhouette. Acquired via low-probability DMN draws.
 */

const RARITY_LABEL: Record<EquipmentRarity, string> = {
  P1: 'P1 鑽石',
  P2: 'P2 金',
  P3: 'P3 銀',
  P4: 'P4 銅',
  P5: 'P5 鐵',
}

const RARITY_COLOR: Record<EquipmentRarity, string> = {
  P1: '#7fd4ff',
  P2: '#d4a04d',
  P3: '#8c8c8c',
  P4: '#a87c4d',
  P5: '#6b6b6b',
}

const LANE_LABEL: Record<EquipmentLane, string> = { speed: '⚡ 傳導速度', energy: '🔋 神經能量' }

// Display P1→P5 (rarest first) so the grid reads strong→negligible top-down.
const RARITY_ORDER: Record<EquipmentRarity, number> = { P1: 0, P2: 1, P3: 2, P4: 3, P5: 4 }
const SORTED_CATALOG = [...EQUIPMENT_CATALOG].sort(
  (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity],
)

export default function EquipmentDexPanel(): JSX.Element {
  const [owned, setOwned] = useState<Set<string>>(new Set())

  useEffect(() => {
    const sub = liveQuery(async () => db.equipment.toArray()).subscribe({
      next: (rows) => setOwned(new Set(rows.map((r) => r.equipmentId))),
      error: (err) => console.error('[EquipmentDexPanel] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  return (
    <section style={panelStyle}>
      <h2 style={headingStyle}>
        ⚙ 永久裝備 · {owned.size}/{EQUIPMENT_CATALOG.length}
      </h2>
      <p style={subtitleStyle}>髓鞘與代謝基礎設施 — 永久加成（DMN 抽卡低機率取得）。</p>
      <div style={gridStyle}>
        {SORTED_CATALOG.map((def) => (
          <EquipmentTile key={def.equipmentId} def={def} owned={owned.has(def.equipmentId)} />
        ))}
      </div>
    </section>
  )
}

function EquipmentTile({ def, owned }: { def: EquipmentDef; owned: boolean }): JSX.Element {
  const color = RARITY_COLOR[def.rarity]
  const spriteUrl = SPRITE_MAP[def.artworkId] ?? SPRITE_MAP['variant:default'] ?? ''

  if (!owned) {
    return (
      <div style={{ ...tileStyle, borderColor: '#c9b48f', opacity: 0.55 }}>
        <div style={{ ...chipStyle, color: '#a89074', borderColor: '#c9b48f' }}>
          {RARITY_LABEL[def.rarity]}
        </div>
        <div style={{ ...spriteWrapStyle, background: '#f4ecd8' }}>
          <span style={silhouetteStyle}>?</span>
        </div>
        <div style={{ ...nameStyle, color: '#8c6d4a' }}>未取得</div>
        <p style={descStyle}>{LANE_LABEL[def.lane]} · +{Math.round(def.bonus * 100)}%</p>
      </div>
    )
  }

  return (
    <div style={{ ...tileStyle, borderColor: color }}>
      <div style={{ ...chipStyle, color, borderColor: color }}>{RARITY_LABEL[def.rarity]}</div>
      <div style={spriteWrapStyle}>
        <img src={spriteUrl} alt={def.displayName} style={spriteStyle} />
      </div>
      <div style={nameStyle}>{def.displayName}</div>
      <div style={laneChipStyle}>
        {LANE_LABEL[def.lane]} · +{Math.round(def.bonus * 100)}%
      </div>
      <p style={descStyle}>{def.description}</p>
    </div>
  )
}

const panelStyle: React.CSSProperties = { maxWidth: '1100px', margin: '2rem auto 0' }

const headingStyle: React.CSSProperties = {
  margin: '0 0 0.3rem',
  fontSize: '1.2rem',
  color: '#5a3e1a',
  letterSpacing: '0.06em',
  textAlign: 'center',
}

const subtitleStyle: React.CSSProperties = {
  margin: '0 0 1rem',
  fontSize: '0.82rem',
  color: '#8c6d4a',
  textAlign: 'center',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '0.85rem',
}

const tileStyle: React.CSSProperties = {
  position: 'relative',
  background: '#fbf6e9',
  border: '2px solid',
  borderRadius: '8px',
  padding: '1.3rem 0.65rem 0.7rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.35rem',
}

const chipStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-0.6rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#fbf6e9',
  border: '2px solid',
  padding: '0.1rem 0.55rem',
  borderRadius: '999px',
  fontSize: '0.7rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const spriteWrapStyle: React.CSSProperties = {
  width: '82px',
  height: '82px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f4ecd8',
  border: '1px solid #c9b48f',
  borderRadius: '6px',
}

const spriteStyle: React.CSSProperties = { width: '68px', height: '68px', imageRendering: 'pixelated' }

const silhouetteStyle: React.CSSProperties = { fontSize: '2.5rem', color: '#c9b48f', fontWeight: 700 }

const nameStyle: React.CSSProperties = { fontSize: '0.9rem', fontWeight: 700, color: '#3a2a1a', textAlign: 'center' }

const laneChipStyle: React.CSSProperties = {
  background: '#f0e6cf',
  border: '1px solid #c9b48f',
  borderRadius: '999px',
  padding: '0.15rem 0.6rem',
  fontSize: '0.68rem',
  color: '#5a3e1a',
}

const descStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.7rem',
  color: '#8c6d4a',
  textAlign: 'center',
  lineHeight: 1.4,
}
