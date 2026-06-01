/**
 * CollectionPage — the /collection variant dex.
 *
 * Pokédex-style browse of all 11 families × 5 slots: collected cards +
 * uncollected silhouettes (with AP unlock threshold). Family-filter chips
 * default to all-shown. Tapping a collected card sets it as that family's
 * representative. Each collected card reserves an (empty) caption row that a
 * later capability (add-neurons-variant-provenance) fills.
 *
 * Capability spec: openspec/specs/neurons-variant-collection-view/spec.md
 */

import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { NEURON_VARIANT_CATALOG, type NeuronVariantDef } from '@study-rpg/content-neurons-tw'
import { SPRITE_MAP } from '@study-rpg/theme-pixel-neurons'
import { db, type NeuronVariantRow, type VariantRarity } from '../lib/db'
import { AP_THRESHOLDS } from '../lib/connectome/ap-counter'
import {
  getRepresentativesRaw,
  filterStaleRepresentatives,
  setRepresentative,
  type RepresentativeMap,
} from '../lib/services/representatives'
import { FamilyFilterChips, type FamilyChipOption } from '../components/FamilyFilterChips'

const RARITY_LABEL: Record<VariantRarity, string> = {
  P1: 'P1 夯',
  P2: 'P2 頂級',
  P3: 'P3 人上人',
  P4: 'P4 NPC',
  P5: 'P5 拉完了',
}

const RARITY_COLOR: Record<VariantRarity, string> = {
  P1: '#d4a04d',
  P2: '#c44d4d',
  P3: '#6a8c3f',
  P4: '#6a9bc4',
  P5: '#9b9b9b',
}

const slotKey = (familyId: string, slotIndex: number): string => `${familyId}:${slotIndex}`

/** Strip the "— English persona" suffix used in connectome family displayNames. */
const shortFamilyLabel = (displayName: string): string => displayName.replace(/\s*—.+$/, '')

interface PageState {
  collected: Map<string, NeuronVariantRow>
  collectedKeys: Set<string>
  representatives: RepresentativeMap
}

export default function CollectionPage({ pack }: { pack: ContentPack }): JSX.Element {
  const [state, setState] = useState<PageState>({
    collected: new Map(),
    collectedKeys: new Set(),
    representatives: {},
  })

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [rows, repRaw] = await Promise.all([
        db.neuronVariants.toArray(),
        getRepresentativesRaw(),
      ])
      const collected = new Map<string, NeuronVariantRow>()
      const collectedKeys = new Set<string>()
      for (const r of rows) {
        const k = slotKey(r.familyId, r.slotIndex)
        collected.set(k, r)
        collectedKeys.add(k)
      }
      return {
        collected,
        collectedKeys,
        representatives: filterStaleRepresentatives(repRaw, collectedKeys),
      }
    }).subscribe({
      next: (val) => setState(val),
      error: (err) => console.error('[CollectionPage] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  // Families come from the content pack subjects (canonical family list + order).
  const families: FamilyChipOption[] = useMemo(
    () => pack.subjects.map((s) => ({ id: s.id, label: shortFamilyLabel(s.displayName) })),
    [pack.subjects],
  )

  // Slots per family from the catalog, sorted by slot index.
  const slotsByFamily = useMemo(() => {
    const map = new Map<string, NeuronVariantDef[]>()
    for (const entry of NEURON_VARIANT_CATALOG) {
      const list = map.get(entry.familyId) ?? []
      list.push(entry)
      map.set(entry.familyId, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.slotIndex - b.slotIndex)
    return map
  }, [])

  const [visible, setVisible] = useState<Set<string>>(() => new Set())
  // Initialise visible = all families once the pack subjects resolve.
  useEffect(() => {
    setVisible(new Set(families.map((f) => f.id)))
  }, [families])

  const toggleFamily = (familyId: string): void => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(familyId)) next.delete(familyId)
      else next.add(familyId)
      return next
    })
  }
  const selectAll = (): void => setVisible(new Set(families.map((f) => f.id)))

  const collectedCount = state.collectedKeys.size
  const total = NEURON_VARIANT_CATALOG.length
  const shownFamilies = families.filter((f) => visible.has(f.id))

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>神經元圖鑑</h1>
        <p style={subtitleStyle}>
          11 科 × 5 階變體，共 {total} 隻。已收集 <strong>{collectedCount}</strong> 隻。
          答對該科題目累積放電跨過門檻即解鎖新變體。
        </p>
      </header>

      <FamilyFilterChips
        families={families}
        visible={visible}
        onToggle={toggleFamily}
        onSelectAll={selectAll}
      />

      {shownFamilies.length === 0 ? (
        <p style={emptyHintStyle}>（已隱藏所有科別，點「全部」恢復顯示）</p>
      ) : (
        shownFamilies.map((family) => {
          const slots = slotsByFamily.get(family.id) ?? []
          const repSlot = state.representatives[family.id]
          return (
            <section key={family.id} style={familySectionStyle} aria-label={family.label}>
              <h2 style={familyTitleStyle}>{family.label}</h2>
              <div style={slotRowStyle}>
                {slots.map((slot) => {
                  const row = state.collected.get(slotKey(family.id, slot.slotIndex))
                  if (row) {
                    return (
                      <VariantSlotCard
                        key={slot.slotIndex}
                        row={row}
                        description={slot.description}
                        isRepresentative={repSlot === slot.slotIndex}
                        onSetRepresentative={() =>
                          void setRepresentative(family.id, slot.slotIndex)
                        }
                      />
                    )
                  }
                  return (
                    <VariantSlotSilhouette
                      key={slot.slotIndex}
                      threshold={AP_THRESHOLDS[slot.slotIndex - 1] ?? 0}
                    />
                  )
                })}
              </div>
            </section>
          )
        })
      )}
    </section>
  )
}

function VariantSlotCard({
  row,
  description,
  isRepresentative,
  onSetRepresentative,
}: {
  row: NeuronVariantRow
  description: string
  isRepresentative: boolean
  onSetRepresentative: () => void
}): JSX.Element {
  const color = RARITY_COLOR[row.rarity]
  const spriteUrl = SPRITE_MAP[row.spriteKey] ?? SPRITE_MAP['variant:default'] ?? ''
  return (
    <button
      type="button"
      onClick={onSetRepresentative}
      style={{ ...cardStyle, borderColor: isRepresentative ? '#d4a04d' : '#c9b48f' }}
      aria-label={`${row.displayName}（${RARITY_LABEL[row.rarity]}）${isRepresentative ? '，目前代表' : '，點選設為代表'}`}
      aria-pressed={isRepresentative}
    >
      {isRepresentative && <span style={repMarkerStyle} aria-hidden="true">★</span>}
      <div style={{ ...rarityChipStyle, color, borderColor: color }}>{RARITY_LABEL[row.rarity]}</div>
      <div style={spriteWrapStyle}>
        <img src={spriteUrl} alt={row.displayName} style={spriteStyle} />
      </div>
      <div style={cardNameStyle}>{row.displayName}</div>
      <p style={cardDescStyle}>{description}</p>
      {row.wasPityFloor && <div style={pityChipStyle}>保底</div>}
      {/* Reserved caption row — filled later by add-neurons-variant-provenance.
          min-height keeps layout stable when provenance text drops in. */}
      <div style={captionRowStyle} data-provenance-caption="" aria-hidden="true" />
    </button>
  )
}

function VariantSlotSilhouette({ threshold }: { threshold: number }): JSX.Element {
  return (
    <div style={{ ...cardStyle, borderColor: '#c9b48f', opacity: 0.55, cursor: 'default' }}>
      <div style={{ ...rarityChipStyle, color: '#a3946f', borderColor: '#c9b48f' }}>?</div>
      <div style={{ ...spriteWrapStyle, background: '#e7dcc0' }}>
        <span style={silhouetteStyle}>?</span>
      </div>
      <div style={{ ...cardNameStyle, color: '#a3946f' }}>未解鎖</div>
      <p style={cardDescStyle}>需累積放電 {threshold}</p>
      <div style={captionRowStyle} aria-hidden="true" />
    </div>
  )
}

// ─── Styles (cream/brown pixel aesthetic, matching OverviewPage / YearFilterBar) ─

const pageStyle: React.CSSProperties = {
  padding: '1.2rem 1rem 3rem',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  color: '#3a2a1a',
  maxWidth: 1100,
  margin: '0 auto',
}

const headerStyle: React.CSSProperties = { marginBottom: '0.4rem', textAlign: 'center' }

const titleStyle: React.CSSProperties = {
  margin: '0 0 0.3rem',
  fontSize: '1.5rem',
  color: '#5a3e1a',
  letterSpacing: '0.08em',
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.82rem',
  color: '#8c6d4a',
  lineHeight: 1.5,
}

const emptyHintStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  textAlign: 'center',
  fontSize: '0.85rem',
  color: '#8c6d4a',
}

const familySectionStyle: React.CSSProperties = { marginTop: '1.4rem' }

const familyTitleStyle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  fontSize: '1rem',
  fontWeight: 700,
  color: '#5a3e1a',
  borderBottom: '2px solid #d8c7a0',
  paddingBottom: '0.2rem',
}

const slotRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '0.75rem',
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  background: '#fbf6e9',
  border: '2px solid',
  borderRadius: '8px',
  padding: '1.2rem 0.6rem 0.6rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.3rem',
  textAlign: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'inherit',
}

const repMarkerStyle: React.CSSProperties = {
  position: 'absolute',
  top: '0.3rem',
  right: '0.4rem',
  fontSize: '0.95rem',
  color: '#d4a04d',
}

const rarityChipStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-0.6rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#fbf6e9',
  border: '2px solid',
  padding: '0.05rem 0.5rem',
  borderRadius: '999px',
  fontSize: '0.65rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const spriteWrapStyle: React.CSSProperties = {
  width: '78px',
  height: '78px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f4ecd8',
  border: '1px solid #c9b48f',
  borderRadius: '6px',
}

const spriteStyle: React.CSSProperties = {
  width: '64px',
  height: '64px',
  imageRendering: 'pixelated',
}

const silhouetteStyle: React.CSSProperties = {
  fontSize: '2.4rem',
  color: '#c9b48f',
  fontWeight: 700,
}

const cardNameStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#3a2a1a',
  lineHeight: 1.25,
}

const cardDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.68rem',
  color: '#8c6d4a',
  lineHeight: 1.4,
}

const pityChipStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 700,
  color: '#b8893a',
  border: '1px solid #d8c7a0',
  borderRadius: '999px',
  padding: '0 0.4rem',
}

const captionRowStyle: React.CSSProperties = {
  minHeight: '1.1rem',
  fontSize: '0.66rem',
  color: '#9c8a6a',
  lineHeight: 1.3,
  alignSelf: 'stretch',
}
