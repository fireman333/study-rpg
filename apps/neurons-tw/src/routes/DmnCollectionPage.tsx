import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { DMN_CARD_CATALOG, type DmnCardDef, type DmnRarity } from '@study-rpg/content-neurons-tw'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { db } from '../lib/db'
import type { DmnCardRow } from '@study-rpg/content-neurons-tw'
import { readHiddenRevealedArtworkIds } from '../lib/services/dmn-event-dispatcher'

const RARITY_LABEL: Record<DmnRarity, string> = {
  P1: 'P1 鑽石',
  P2: 'P2 金',
  P3: 'P3 銀',
  P4: 'P4 銅',
}

const RARITY_COLOR: Record<DmnRarity, string> = {
  P1: '#d4a04d',
  P2: '#c4a04d',
  P3: '#8c8c8c',
  P4: '#a87c4d',
}

interface PageState {
  ownedSet: Set<string>
  revealedArtworkIds: Set<string>
}

export default function DmnCollectionPage(): JSX.Element {
  const [state, setState] = useState<PageState>({
    ownedSet: new Set(),
    revealedArtworkIds: new Set(),
  })

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [owned, revealed] = await Promise.all([
        db.dmnCards.toArray() as Promise<DmnCardRow[]>,
        readHiddenRevealedArtworkIds(),
      ])
      return {
        ownedSet: new Set(owned.map((r) => r.cardId)),
        revealedArtworkIds: revealed,
      }
    }).subscribe({
      next: (val) => setState(val),
      error: (err) => console.error('[DmnCollectionPage] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  const ownedCount = state.ownedSet.size
  const total = DMN_CARD_CATALOG.length

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>DMN 圖鑑</h1>
        <p style={subtitleStyle}>
          Default Mode Network — 大腦休息態自發產生的靈感卡。共 {total} 張，已收藏{' '}
          <strong>{ownedCount}</strong> 張。
        </p>
      </header>

      <div style={gridStyle}>
        {DMN_CARD_CATALOG.map((card) => (
          <CardTile
            key={card.cardId}
            card={card}
            owned={state.ownedSet.has(card.cardId)}
            spoilered={state.revealedArtworkIds.has(card.artworkId)}
          />
        ))}
      </div>
    </section>
  )
}

function CardTile({
  card,
  owned,
  spoilered,
}: {
  card: DmnCardDef
  owned: boolean
  spoilered: boolean
}): JSX.Element {
  const color = RARITY_COLOR[card.rarity]
  const spriteUrl = SPRITE_MAP[card.artworkId] ?? SPRITE_MAP['variant:default'] ?? ''

  // Render priority: owned > spoilered > unknown-silhouette
  if (owned) {
    return (
      <div style={{ ...tileStyle, borderColor: color }}>
        <div style={{ ...rarityChipStyle, color, borderColor: color }}>
          {RARITY_LABEL[card.rarity]}
        </div>
        <div style={spriteWrapStyle}>
          <img src={spriteUrl} alt={card.displayName} style={spriteStyle} />
        </div>
        <div style={tileNameStyle}>{card.displayName}</div>
        <p style={tileDescStyle}>{card.description}</p>
      </div>
    )
  }

  if (spoilered) {
    return (
      <div style={{ ...tileStyle, borderColor: color, opacity: 0.7 }}>
        <div style={{ ...rarityChipStyle, color, borderColor: color }}>
          {RARITY_LABEL[card.rarity]}
        </div>
        <div style={{ ...spriteWrapStyle, filter: 'brightness(0.4) blur(2px)' }}>
          <img src={spriteUrl} alt="silhouette hint" style={spriteStyle} />
        </div>
        <div style={tileNameStyle}>???</div>
        <p style={tileDescStyle}>DMN 已透露這張卡的輪廓…</p>
      </div>
    )
  }

  return (
    <div style={{ ...tileStyle, borderColor: '#3d3270', opacity: 0.5 }}>
      <div style={{ ...rarityChipStyle, color: '#9b9b9b', borderColor: '#3d3270' }}>?</div>
      <div style={{ ...spriteWrapStyle, background: '#0a081a' }}>
        <span style={silhouetteStyle}>?</span>
      </div>
      <div style={{ ...tileNameStyle, color: '#5d5878' }}>未收藏</div>
      <p style={tileDescStyle}>抽到才能解鎖</p>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  padding: '1.5rem 1rem 3rem',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  color: '#e6e6fa',
  background: '#0f0c24',
  minHeight: '100vh',
}

const headerStyle: React.CSSProperties = {
  marginBottom: '1.5rem',
  textAlign: 'center',
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 0.4rem',
  fontSize: '1.6rem',
  color: '#d4c4ff',
  letterSpacing: '0.1em',
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#b8b3d4',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  // 4 columns at 920px+, 3 at ~700-919, 2 at ~470-699, 1 at narrow mobile.
  // Tile minmax tightened from 180px → 150px so locked silhouettes feel
  // compact (less empty visual space) — major polish reduction of the
  // previous「卡片太大、半成品感」symptom.
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '0.85rem',
  maxWidth: '1100px',
  margin: '0 auto',
}

const tileStyle: React.CSSProperties = {
  position: 'relative',
  background: '#1c1838',
  border: '2px solid',
  borderRadius: '8px',
  padding: '1.3rem 0.65rem 0.7rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.35rem',
  // Removed prior `minHeight: 240px` — let content drive height so locked
  // tiles don't have ~80px of empty space below the silhouette.
}

const rarityChipStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-0.6rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#1c1838',
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
  background: '#0f0c24',
  border: '1px solid #3d3270',
  borderRadius: '6px',
}

const spriteStyle: React.CSSProperties = {
  width: '68px',
  height: '68px',
  imageRendering: 'pixelated',
}

const silhouetteStyle: React.CSSProperties = {
  fontSize: '2.5rem',
  color: '#3d3270',
  fontWeight: 700,
}

const tileNameStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#fff',
  textAlign: 'center',
}

const tileDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.7rem',
  color: '#9b9b9b',
  textAlign: 'center',
  lineHeight: 1.4,
}
