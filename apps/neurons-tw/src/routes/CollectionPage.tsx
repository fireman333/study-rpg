/**
 * CollectionPage — the /collection variant dex (Collection 2.0).
 *
 * Pokédex-style browse of all 11 families × 6 tiers (P0–P5): collected cards +
 * uncollected rarity-labeled silhouettes. A neural-energy balance HUD + a
 * per-family PULL control drive the gacha (study earns energy → spend to pull).
 * Tapping a collected card sets it as that family's representative. Each collected
 * card shows a `× N` dupe badge + a provenance birth caption.
 *
 * Capability spec: openspec/specs/neurons-variant-collection-view/spec.md
 */

import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { NEURON_VARIANT_CATALOG, PULL_COST, type NeuronVariantDef } from '@study-rpg/content-neurons-tw'
import { db, type NeuronVariantRow, type VariantRarity } from '../lib/db'
import {
  getRepresentativesRaw,
  filterStaleRepresentatives,
  setRepresentative,
  type RepresentativeMap,
} from '../lib/services/representatives'
import { pullVariant, SLOTS_PER_FAMILY } from '../lib/services/variant-gacha'
import { useEnergyBalance } from '../lib/services/currency'
import { FamilyFilterChips, type FamilyChipOption } from '../components/FamilyFilterChips'
import { variantBirthCaption } from '../lib/variant-caption'
import VariantSprite from '../components/VariantSprite'

const RARITY_LABEL: Record<VariantRarity, string> = {
  P0: 'P0 始源',
  P1: 'P1 夯',
  P2: 'P2 頂級',
  P3: 'P3 人上人',
  P4: 'P4 NPC',
  P5: 'P5 拉完了',
}

const RARITY_COLOR: Record<VariantRarity, string> = {
  P0: '#a64dd4',
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
  const balance = useEnergyBalance()
  const [pulling, setPulling] = useState<string | null>(null)

  const resolveName = useMemo(() => {
    const byId = new Map(pack.subjects.map((s) => [s.id, s.displayName]))
    return (id: string): string => byId.get(id) ?? id
  }, [pack.subjects])

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

  const handlePull = async (familyId: string): Promise<void> => {
    if (pulling) return
    setPulling(familyId)
    try {
      // The global VariantUnlockModal renders the reveal off the variantRolled event.
      await pullVariant(familyId, resolveName)
    } finally {
      setPulling(null)
    }
  }

  // Families come from the content pack subjects (canonical family list + order).
  const families: FamilyChipOption[] = useMemo(
    () => pack.subjects.map((s) => ({ id: s.id, label: shortFamilyLabel(s.displayName) })),
    [pack.subjects],
  )

  // Slots per family from the catalog, sorted by slot index (0 = P0 apex first).
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
          11 科 × 6 階（P0–P5）變體，共 {total} 隻。已收集 <strong>{collectedCount}</strong> 隻。
          唸書與答對累積神經能量，於各科抽卡解鎖變體。
        </p>
        <div style={energyHudStyle} aria-label={`神經能量 ${balance}`}>
          ⚡ 神經能量 <strong style={{ fontSize: '1.05rem' }}>{balance}</strong>
          <span style={energyHintStyle}>（每抽 {PULL_COST}）</span>
        </div>
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
          const repRow =
            repSlot != null ? state.collected.get(slotKey(family.id, repSlot)) : undefined
          const owned = slots.filter((s) =>
            state.collectedKeys.has(slotKey(family.id, s.slotIndex)),
          ).length
          const complete = owned >= SLOTS_PER_FAMILY
          const isPulling = pulling === family.id
          const canPull = !complete && balance >= PULL_COST && !pulling
          return (
            <section key={family.id} style={familySectionStyle} aria-label={family.label}>
              <div style={familyHeaderRowStyle}>
                <h2 style={familyTitleStyle}>
                  {repRow && (
                    <VariantSprite row={repRow} size={28} alt={`${family.label} 代表`} />
                  )}
                  {family.label}
                  <span style={ownedCountStyle}>
                    {owned}/{SLOTS_PER_FAMILY}
                  </span>
                </h2>
                <button
                  type="button"
                  disabled={!canPull}
                  onClick={() => void handlePull(family.id)}
                  style={
                    complete
                      ? pullButtonCompleteStyle
                      : canPull
                        ? pullButtonStyle
                        : pullButtonDisabledStyle
                  }
                  title={
                    complete
                      ? '全部收集'
                      : balance < PULL_COST
                        ? `神經能量不足（需 ${PULL_COST}）`
                        : `花 ${PULL_COST} 神經能量在 ${family.label} 抽卡`
                  }
                >
                  {complete
                    ? '✅ 全部收集'
                    : isPulling
                      ? '抽卡中…'
                      : `🎴 抽卡（${PULL_COST}）`}
                </button>
              </div>
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
                    <VariantSlotSilhouette key={slot.slotIndex} rarity={slot.rarity} />
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
  const caption = variantBirthCaption(row)
  const copies = row.copies ?? 1
  return (
    <button
      type="button"
      onClick={onSetRepresentative}
      style={{ ...cardStyle, borderColor: isRepresentative ? '#d4a04d' : '#c9b48f' }}
      aria-label={`${row.displayName}（${RARITY_LABEL[row.rarity]}）${isRepresentative ? '，目前代表' : '，點選設為代表'}`}
      aria-pressed={isRepresentative}
    >
      {isRepresentative && <span style={repMarkerStyle} aria-hidden="true">★</span>}
      {copies > 1 && (
        <span style={copiesBadgeStyle} aria-label={`重複 ${copies} 隻`}>
          × {copies}
        </span>
      )}
      <div style={{ ...rarityChipStyle, color, borderColor: color }}>{RARITY_LABEL[row.rarity]}</div>
      <div style={spriteWrapStyle}>
        <VariantSprite row={row} size={64} alt={row.displayName} />
      </div>
      <div style={cardNameStyle}>{row.displayName}</div>
      <p style={cardDescStyle}>{description}</p>
      {row.wasPityFloor && <div style={pityChipStyle}>保底</div>}
      {/* Birth caption (add-neurons-variant-provenance) — single line derived
          from provenance; 元老 fallback for pre-upgrade rows. min-height on the
          row keeps grid layout stable across caption lengths. */}
      <div style={captionRowStyle} data-provenance-caption={caption}>{caption}</div>
    </button>
  )
}

function VariantSlotSilhouette({ rarity }: { rarity: VariantRarity }): JSX.Element {
  const color = RARITY_COLOR[rarity]
  return (
    <div style={{ ...cardStyle, borderColor: '#c9b48f', opacity: 0.6, cursor: 'default' }}>
      <div style={{ ...rarityChipStyle, color, borderColor: color, opacity: 0.85 }}>
        {RARITY_LABEL[rarity]}
      </div>
      <div style={{ ...spriteWrapStyle, background: '#e7dcc0' }}>
        <span style={silhouetteStyle}>?</span>
      </div>
      <div style={{ ...cardNameStyle, color: '#a3946f' }}>未收集</div>
      <p style={cardDescStyle}>抽卡有機會獲得</p>
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

const energyHudStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  marginTop: '0.6rem',
  padding: '0.3rem 0.8rem',
  background: '#fff7df',
  border: '2px solid #d4a04d',
  borderRadius: '999px',
  fontSize: '0.85rem',
  color: '#5a3e1a',
  fontWeight: 700,
}

const energyHintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 400,
  color: '#8c6d4a',
}

const emptyHintStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  textAlign: 'center',
  fontSize: '0.85rem',
  color: '#8c6d4a',
}

const familySectionStyle: React.CSSProperties = { marginTop: '1.4rem' }

const familyHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.6rem',
  margin: '0 0 0.6rem',
  borderBottom: '2px solid #d8c7a0',
  paddingBottom: '0.2rem',
  flexWrap: 'wrap',
}

const familyTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  margin: 0,
  fontSize: '1rem',
  fontWeight: 700,
  color: '#5a3e1a',
}

const ownedCountStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#8c6d4a',
}

const pullButtonStyle: React.CSSProperties = {
  padding: '0.35rem 0.8rem',
  background: '#d4a04d',
  color: '#fff',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: '#b8893a',
  borderRadius: '6px',
  fontSize: '0.82rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const pullButtonDisabledStyle: React.CSSProperties = {
  ...pullButtonStyle,
  background: '#e8dcc0',
  color: '#a89074',
  borderColor: '#c4a878',
  cursor: 'not-allowed',
}

const pullButtonCompleteStyle: React.CSSProperties = {
  ...pullButtonStyle,
  background: '#fdf6e3',
  color: '#b58900',
  borderColor: '#b58900',
  cursor: 'default',
}

const slotRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: '0.75rem',
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  background: '#fbf6e9',
  borderWidth: '2px',
  borderStyle: 'solid',
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

const copiesBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: '0.3rem',
  left: '0.4rem',
  fontSize: '0.65rem',
  fontWeight: 700,
  color: '#8c6d4a',
  background: '#f4ecd8',
  border: '1px solid #c9b48f',
  borderRadius: '999px',
  padding: '0 0.35rem',
}

const rarityChipStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-0.6rem',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#fbf6e9',
  borderWidth: '2px',
  borderStyle: 'solid',
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
