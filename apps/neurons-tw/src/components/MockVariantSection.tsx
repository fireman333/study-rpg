/**
 * MockVariantSection — the「模擬考收藏」collection section on /collection
 * (finalize-mock-variant-catalog; relocated from the standalone /mock-collection).
 *
 * An open collection (mirrors ConnectorSection + the per-family variant sections):
 * renders ONLY the variants the player has collected — no locked silhouettes, no
 * denominator, no closed-set total surfaced (per the neurons-mock-variant-gacha
 * collection-view requirement). Each owned variant shows its real sprite from
 * SPRITE_MAP, falling back to a 🧬 glyph when no sprite file is registered.
 *
 * Spec: openspec/specs/neurons-mock-variant-gacha/spec.md
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  MOCK_VARIANT_CATALOG,
  MOCK_RARITY_COLOR,
  MOCK_RARITY_LABEL,
  type MockVariantDef,
} from '@study-rpg/content-neurons-tw'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { db, type MockExamVariantRow } from '../lib/db'
import { EmojiIcon } from './EmojiIcon'

const CATALOG_BY_ID = new Map(MOCK_VARIANT_CATALOG.map((d) => [d.variantId, d]))

export default function MockVariantSection(): JSX.Element {
  const [owned, setOwned] = useState<MockExamVariantRow[]>([])

  useEffect(() => {
    const sub = liveQuery(async () =>
      (await db.mockExamVariants.orderBy('lastRolledAt').reverse().toArray()) as MockExamVariantRow[],
    ).subscribe({
      next: (rows) => setOwned(rows),
      error: (err) => console.error('[MockVariantSection] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  return (
    <section style={sectionStyle} id="mock-variants" aria-label="模擬考收藏">
      <div style={headerRowStyle}>
        <h2 style={titleStyle}>
          <EmojiIcon char="🧬" size={16} /> 模擬考收藏
          <span style={countStyle}>{owned.length} 隻</span>
        </h2>
      </div>
      <p style={blurbStyle}>
        每完成一卷<strong>模擬考試</strong>（每卷每天一次），依分數抽一隻考試腦力神經元。獨立收藏線，與迷宮蒐集無關。
      </p>
      {owned.length === 0 ? (
        <p style={emptyHintStyle}>尚未收集 —— 去題庫考一卷模擬考、全部送出後就會依分數抽一隻。</p>
      ) : (
        <div style={gridStyle}>
          {owned.map((row) => {
            const def = CATALOG_BY_ID.get(row.variantId)
            if (!def) return null
            return <OwnedTile key={row.variantId} def={def} row={row} />
          })}
        </div>
      )}
    </section>
  )
}

function OwnedTile({ def, row }: { def: MockVariantDef; row: MockExamVariantRow }): JSX.Element {
  const color = MOCK_RARITY_COLOR[def.rarity]
  const spriteUrl = SPRITE_MAP[def.spriteKey]
  return (
    <div style={{ ...cardStyle, borderColor: color }} aria-label={`模擬考收藏：${def.displayName}`}>
      <div style={{ ...rarityChipStyle, color, borderColor: color }}>{MOCK_RARITY_LABEL[def.rarity]}</div>
      <div style={spriteWrapStyle}>
        {spriteUrl ? (
          <img src={spriteUrl} width={64} height={64} alt={def.displayName} style={{ imageRendering: 'pixelated' }} />
        ) : (
          <span aria-hidden>
            <EmojiIcon char="🧬" size={35} decorative />
          </span>
        )}
      </div>
      <div style={tileNameStyle}>
        {def.displayName}
        {row.copies > 1 && <span style={copiesStyle}>×{row.copies}</span>}
      </div>
      <p style={tileDescStyle}>{def.blurb}</p>
    </div>
  )
}

// ─── Styles (match ConnectorSection / CollectionPage cream-brown aesthetic) ───

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

const countStyle: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 600, color: '#8c6d4a' }

const blurbStyle: React.CSSProperties = {
  margin: '0 0 0.8rem',
  fontSize: '0.74rem',
  color: '#8c6d4a',
  lineHeight: 1.5,
}

const emptyHintStyle: React.CSSProperties = {
  margin: '0.4rem 0 0',
  fontSize: '0.78rem',
  color: '#9c8a6a',
  lineHeight: 1.5,
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
  gap: '0.6rem',
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  background: '#fbf6e9',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderRadius: '8px',
  padding: '1rem 0.5rem 0.55rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.3rem',
}

const rarityChipStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-0.6rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#fbf6e9',
  border: '2px solid',
  padding: '0.1rem 0.5rem',
  borderRadius: '999px',
  fontSize: '0.66rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const spriteWrapStyle: React.CSSProperties = {
  width: '72px',
  height: '72px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f4ecd8',
  border: '1px solid #c9b48f',
  borderRadius: '6px',
}

const tileNameStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#3a2a1a',
  textAlign: 'center',
}

const copiesStyle: React.CSSProperties = { marginLeft: 4, fontSize: '0.72rem', color: '#8c6d4a' }

const tileDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.66rem',
  color: '#8c6d4a',
  textAlign: 'center',
  lineHeight: 1.4,
}
