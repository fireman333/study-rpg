import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  MOCK_VARIANT_CATALOG,
  MOCK_RARITY_COLOR,
  MOCK_RARITY_LABEL,
  type MockVariantDef,
} from '@study-rpg/content-neurons-tw'
import { db, type MockExamVariantRow } from '../lib/db'

// Mock-exam variant collection (add-neurons-exam-set-mock-variants). Closed-cap
// dex of the 模擬考收藏 line — owned tiles show a placeholder glyph until the
// follow-up `generate-mock-variant-sprites` ships real art (spriteKey stable).

export default function MockVariantCollectionPage(): JSX.Element {
  const [owned, setOwned] = useState<Map<string, MockExamVariantRow>>(new Map())

  useEffect(() => {
    const sub = liveQuery(async () => {
      const rows = (await db.mockExamVariants.toArray()) as MockExamVariantRow[]
      return new Map(rows.map((r) => [r.variantId, r]))
    }).subscribe({
      next: (val) => setOwned(val),
      error: (err) => console.error('[MockVariantCollectionPage] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  const ownedCount = owned.size
  const total = MOCK_VARIANT_CATALOG.length

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>模擬考收藏</h1>
        <p style={subtitleStyle}>
          每次完成一卷模擬考試（每卷每天一次），依分數抽一隻考試腦力神經元。已收藏{' '}
          <strong>{ownedCount}</strong> / {total} 種。
        </p>
      </header>

      <div style={gridStyle}>
        {MOCK_VARIANT_CATALOG.map((def) => (
          <VariantTile key={def.variantId} def={def} row={owned.get(def.variantId)} />
        ))}
      </div>
    </section>
  )
}

function VariantTile({ def, row }: { def: MockVariantDef; row?: MockExamVariantRow }): JSX.Element {
  const color = MOCK_RARITY_COLOR[def.rarity]
  if (row) {
    return (
      <div style={{ ...tileStyle, borderColor: color }}>
        <div style={{ ...rarityChipStyle, color, borderColor: color }}>{MOCK_RARITY_LABEL[def.rarity]}</div>
        <div style={{ ...spriteWrapStyle, borderColor: color }}>
          <span style={{ fontSize: '2.4rem' }} aria-hidden>
            🧬
          </span>
        </div>
        <div style={tileNameStyle}>
          {def.displayName}
          {row.copies > 1 && <span style={copiesStyle}>×{row.copies}</span>}
        </div>
        <p style={tileDescStyle}>{def.blurb}</p>
      </div>
    )
  }
  return (
    <div style={{ ...tileStyle, borderColor: '#c9b48f', opacity: 0.55 }}>
      <div style={{ ...rarityChipStyle, color: '#a89074', borderColor: '#c9b48f' }}>?</div>
      <div style={{ ...spriteWrapStyle, background: '#f4ecd8' }}>
        <span style={silhouetteStyle}>?</span>
      </div>
      <div style={{ ...tileNameStyle, color: '#8c6d4a' }}>未收藏</div>
      <p style={tileDescStyle}>考一卷模擬考、依分數抽抽看</p>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  padding: '1.5rem 1rem 3rem',
  fontFamily: 'var(--font-pixel-cjk)',
  color: '#3a2a1a',
}

const headerStyle: React.CSSProperties = { marginBottom: '1.5rem', textAlign: 'center' }

const titleStyle: React.CSSProperties = {
  margin: '0 0 0.4rem',
  fontSize: '1.6rem',
  color: '#5a3e1a',
  letterSpacing: '0.1em',
}

const subtitleStyle: React.CSSProperties = { margin: 0, fontSize: '0.85rem', color: '#8c6d4a' }

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '0.85rem',
  maxWidth: '1100px',
  margin: '0 auto',
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

const rarityChipStyle: React.CSSProperties = {
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

const silhouetteStyle: React.CSSProperties = { fontSize: '2.5rem', color: '#c9b48f', fontWeight: 700 }

const tileNameStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#3a2a1a',
  textAlign: 'center',
}

const copiesStyle: React.CSSProperties = { marginLeft: 4, fontSize: '0.75rem', color: '#8c6d4a' }

const tileDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.7rem',
  color: '#8c6d4a',
  textAlign: 'center',
  lineHeight: 1.4,
}
