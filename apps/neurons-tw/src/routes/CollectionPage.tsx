/**
 * CollectionPage — the /collection variant dex (open collection).
 *
 * Open-ended browse: renders ONLY the variants the player has collected — no
 * silhouettes, no pre-shown rarity, no catalog-sized slot grid, and the finite
 * catalog total is hidden (no `X / N`, no 全部收集). Cards are grouped by family.
 * Collection comes from maze exploration (promote-maze-to-home / Model A): the
 * maze node settle is the only pull path, so this page has NO pull button / energy
 * HUD — it is the dex + tier-promote/fusion surface. Tapping a collected card sets
 * it as that family's representative. Each card shows a `× N` dupe badge + a
 * provenance birth caption; fusion consumes K surplus dupes → one rarer individual.
 *
 * Capability spec: openspec/specs/neurons-variant-collection-view/spec.md
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { liveQuery } from 'dexie'
import type { ContentPack, Subject } from '@study-rpg/core'
import {
  NEURON_VARIANT_CATALOG,
  PROMOTE_COST_K,
  EXAM_PAPER_ORDER,
  FAMILY_EXAM_PAPER,
  type ExamPaper,
} from '@study-rpg/content-neurons-tw'
import { db, type NeuronVariantRow, type NeuronInstanceRow, type VariantRarity } from '../lib/db'
import {
  getRepresentativesRaw,
  filterStaleRepresentatives,
  setRepresentative,
  type RepresentativeMap,
} from '../lib/services/representatives'
import { promoteTier } from '../lib/services/variant-fusion'
import { computeOwnedSlotCount, computeOwnedSlotCountByFamily } from '../lib/services/variant-ownership'
import { FamilyFilterChips, type FamilyChipOption } from '../components/FamilyFilterChips'
import { variantBirthCaption } from '../lib/variant-caption'
import VariantSprite from '../components/VariantSprite'
import {
  useInstanceNicknames,
  setInstanceNickname,
  NICKNAME_MAX_LEN,
} from '../lib/services/instance-nickname'
import ShareCardModal from '../components/ShareCardModal'
import ConnectorSection from '../components/ConnectorSection'
import MockVariantSection from '../components/MockVariantSection'
import { EmojiIcon } from '../components/EmojiIcon'
import { useAuth } from '../lib/auth/AuthContext'
import { SquadManager, SquadCardAction } from '../components/SquadSurfaces'
import {
  useActiveSquad,
  addSquadMember,
  removeSquadMember,
  variantKey,
  MAX_SQUAD_SIZE,
} from '../lib/services/study-squad'

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

/** Tiers that can be promoted (each → one rarer); P0 has no rarer target. */
const PROMOTABLE_TIERS: VariantRarity[] = ['P5', 'P4', 'P3', 'P2', 'P1']
const NEXT_RARER: Record<VariantRarity, VariantRarity | null> = {
  P5: 'P4',
  P4: 'P3',
  P3: 'P2',
  P2: 'P1',
  P1: 'P0',
  P0: null,
}

/**
 * Surplus held individuals per rarity tier (last-copy protection mirror of
 * `eligibleSurplusByTier`): group held individuals by slot, surplus =
 * Σ max(0, count_in_slot − 1) per rarity. Pure — drives the promote buttons.
 */
function surplusByTier(instances: NeuronInstanceRow[]): Record<string, number> {
  const bySlot = new Map<string, { rarity: VariantRarity; count: number }>()
  for (const inst of instances) {
    const k = `${inst.rarity}:${inst.slotIndex}`
    const e = bySlot.get(k) ?? { rarity: inst.rarity, count: 0 }
    e.count++
    bySlot.set(k, e)
  }
  const out: Record<string, number> = {}
  for (const { rarity, count } of bySlot.values()) {
    out[rarity] = (out[rarity] ?? 0) + Math.max(0, count - 1)
  }
  return out
}

const slotKey = (familyId: string, slotIndex: number): string => `${familyId}:${slotIndex}`

/** Strip the "— English persona" suffix used in connectome family displayNames. */
const shortFamilyLabel = (displayName: string): string => displayName.replace(/\s*—.+$/, '')

/**
 * Family-section header label: 科目（cell-type）, e.g. 藥理學（VTA Dopaminergic）.
 * Leads with the exam subject (科目中文) and appends the neuron cell-type in
 * parens; falls back to the subject id alone if there is no English cell-type.
 */
const familyDisplayLabel = (subject: { id: string; displayName: string }): string => {
  const cellType = shortFamilyLabel(subject.displayName)
  return cellType && cellType !== subject.id ? `${subject.id}（${cellType}）` : subject.id
}

/**
 * Exam-paper sections for the dex (decouple-neurons-subjects-from-nt-branches):
 * families group by the two 國考第一階 papers (醫學一 → 醫學二) in 試題順序, mirroring the
 * homepage FamilyPicker so /collection reads the same. Any subject a fork ships
 * that isn't mapped to a paper falls into a defensive 「其他」 group so it is never
 * silently dropped. Display-only; does NOT reorder the canonical FAMILY_IDS.
 */
const PAPER_META: { id: ExamPaper; emoji: string; label: string }[] = [
  { id: '醫學一', emoji: '🧠', label: '醫學一' },
  { id: '醫學二', emoji: '🔬', label: '醫學二' },
]

interface PaperGroup {
  id: string
  emoji: string
  label: string
  subjects: Subject[]
}

function groupSubjectsByPaper(subjects: Subject[]): PaperGroup[] {
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const groups: PaperGroup[] = PAPER_META.map(({ id, emoji, label }) => {
    const ordered = (EXAM_PAPER_ORDER[id] ?? [])
      .map((sid) => byId.get(sid))
      .filter((s): s is Subject => Boolean(s))
    const seen = new Set(ordered.map((s) => s.id))
    const extras = subjects.filter((s) => FAMILY_EXAM_PAPER[s.id] === id && !seen.has(s.id))
    return { id, emoji, label, subjects: [...ordered, ...extras] }
  })
  const placed = new Set(groups.flatMap((g) => g.subjects.map((s) => s.id)))
  const unplaced = subjects.filter((s) => !placed.has(s.id))
  if (unplaced.length > 0) groups.push({ id: '其他', emoji: '🧬', label: '其他', subjects: unplaced })
  return groups.filter((g) => g.subjects.length > 0)
}

interface PageState {
  collected: Map<string, NeuronVariantRow>
  collectedKeys: Set<string>
  representatives: RepresentativeMap
  /** Held individuals (consumedAt==null) per slotKey — the Pikmin-Bloom layer. */
  instancesBySlot: Map<string, NeuronInstanceRow[]>
  /** Held individuals per familyId — drives the count chip + promote surplus. */
  heldByFamily: Map<string, NeuronInstanceRow[]>
  /** Canonical distinct-owned count (slots with ≥1 held individual; ghost slots excluded). */
  ownedSlotCount: number
  /** Canonical per-family distinct-owned count (familyId → owned slots; ghost slots excluded). */
  ownedSlotCountByFamily: Map<string, number>
}

export default function CollectionPage({ pack }: { pack: ContentPack }): JSX.Element {
  const [state, setState] = useState<PageState>({
    collected: new Map(),
    collectedKeys: new Set(),
    representatives: {},
    instancesBySlot: new Map(),
    heldByFamily: new Map(),
    ownedSlotCount: 0,
    ownedSlotCountByFamily: new Map(),
  })
  const { user } = useAuth()
  const [shareOpen, setShareOpen] = useState(false)
  const [promoting, setPromoting] = useState<string | null>(null)
  const nicknames = useInstanceNicknames()

  // ── Active-squad editing (redesign-neurons-homepage-squad-and-maze-focus): the squad picker lives
  // here now (the dex cards ARE the picker). Membership set + cap drive each card's toggle.
  const squad = useActiveSquad()
  const squadKeys = useMemo(
    () => new Set(squad.map((r) => variantKey(r.familyId, r.slotIndex))),
    [squad],
  )
  const squadFull = squad.length >= MAX_SQUAD_SIZE
  const [squadToast, setSquadToast] = useState<string | null>(null)
  useEffect(() => {
    if (!squadToast) return
    const t = setTimeout(() => setSquadToast(null), 2200)
    return () => clearTimeout(t)
  }, [squadToast])
  const onToggleSquad = (familyId: string, slotIndex: number): void => {
    const k = variantKey(familyId, slotIndex)
    if (squadKeys.has(k)) {
      void removeSquadMember(familyId, slotIndex)
    } else if (squadFull) {
      setSquadToast(`遠征隊最多 ${MAX_SQUAD_SIZE} 隻，先移除一隻再加入`)
    } else {
      void addSquadMember(familyId, slotIndex)
    }
  }

  // ?squad=1 deep-link (from the homepage SquadPreview) → scroll the squad manager into view.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('squad') !== '1') return
    requestAnimationFrame(() =>
      document.getElementById('squad-manager')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }, [searchParams])

  const resolveName = useMemo(() => {
    const byId = new Map(pack.subjects.map((s) => [s.id, s.displayName]))
    return (id: string): string => byId.get(id) ?? id
  }, [pack.subjects])

  useEffect(() => {
    const sub = liveQuery(async () => {
      const [rows, instanceRows, repRaw] = await Promise.all([
        db.neuronVariants.toArray(),
        db.neuronInstances.toArray(),
        getRepresentativesRaw(),
      ])
      const collected = new Map<string, NeuronVariantRow>()
      const collectedKeys = new Set<string>()
      for (const r of rows) {
        const k = slotKey(r.familyId, r.slotIndex)
        collected.set(k, r)
        collectedKeys.add(k)
      }
      // Held individuals only (consumedAt==null); group by slot + family.
      const instancesBySlot = new Map<string, NeuronInstanceRow[]>()
      const heldByFamily = new Map<string, NeuronInstanceRow[]>()
      for (const inst of instanceRows) {
        if (inst.consumedAt !== null) continue
        const k = slotKey(inst.familyId, inst.slotIndex)
        ;(instancesBySlot.get(k) ?? instancesBySlot.set(k, []).get(k)!).push(inst)
        ;(heldByFamily.get(inst.familyId) ?? heldByFamily.set(inst.familyId, []).get(inst.familyId)!).push(inst)
      }
      return {
        collected,
        collectedKeys,
        representatives: filterStaleRepresentatives(repRaw, collectedKeys),
        instancesBySlot,
        heldByFamily,
        ownedSlotCount: computeOwnedSlotCount(rows, instanceRows),
        ownedSlotCountByFamily: computeOwnedSlotCountByFamily(rows, instanceRows),
      }
    }).subscribe({
      next: (val) => setState(val),
      error: (err) => console.error('[CollectionPage] liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  const handlePromote = async (familyId: string, rarity: VariantRarity): Promise<void> => {
    if (promoting) return
    setPromoting(`${familyId}:${rarity}`)
    try {
      // Reuses the same variantRolled reveal as a pull (the minted T−1 individual).
      await promoteTier(familyId, rarity, resolveName)
    } finally {
      setPromoting(null)
    }
  }

  // Families grouped by exam paper (醫學一 → 醫學二, 試題順序) — mirrors the homepage
  // FamilyPicker so /collection reads the same. Paper dividers render below; chips
  // + visibility iterate the flattened paper order.
  const paperGroups = useMemo(() => groupSubjectsByPaper(pack.subjects), [pack.subjects])
  const orderedSubjects = useMemo(() => paperGroups.flatMap((g) => g.subjects), [paperGroups])

  // Filter chips: compact subject-only label (科目中文) in exam-paper order. The
  // full 科目（cell-type） label is shown on each family section header below.
  const families: FamilyChipOption[] = useMemo(
    () => orderedSubjects.map((s) => ({ id: s.id, label: s.id })),
    [orderedSubjects],
  )

  // Catalog description lookup (familyId:slotIndex → description) for collected
  // cards. Open collection renders only collected rows, so we no longer build a
  // per-family slot grid — just resolve each collected variant's description.
  const descByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of NEURON_VARIANT_CATALOG) {
      map.set(slotKey(entry.familyId, entry.slotIndex), entry.description)
    }
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

  const collectedCount = state.ownedSlotCount
  const shownFamilies = families.filter((f) => visible.has(f.id))

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <div style={headerTopRowStyle}>
          <h1 style={titleStyle}>神經元圖鑑</h1>
          <button type="button" style={shareBtnStyle} onClick={() => setShareOpen(true)}>
            <EmojiIcon char="🔗" size={16} /> 分享卡
          </button>
        </div>
        <p style={subtitleStyle}>
          已收集 <strong>{collectedCount}</strong> 隻。唸書與答對累積神經能量、在腦圖探索，走到節點即解鎖一次抽卡。
        </p>
      </header>

      <ShareCardModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        userId={user?.id ?? null}
      />

      {/* Squad editor (redesign-neurons-homepage-squad-and-maze-focus): the 遠征隊 manager sits at the
          top of the dex; each card below is the picker via SquadCardAction. */}
      <SquadManager />
      {squadToast && (
        <div role="status" aria-live="polite" style={squadToastStyle}>
          {squadToast}
        </div>
      )}

      <FamilyFilterChips
        families={families}
        visible={visible}
        onToggle={toggleFamily}
        onSelectAll={selectAll}
      />

      {shownFamilies.length === 0 ? (
        <p style={emptyHintStyle}>（已隱藏所有科別，點「全部」恢復顯示）</p>
      ) : (
        paperGroups.map((group) => {
          // A paper divider only renders when ≥1 of its families is chip-visible.
          const groupSubjects = group.subjects.filter((s) => visible.has(s.id))
          if (groupSubjects.length === 0) return null
          return (
            <div key={group.id}>
              <h2 style={paperDividerStyle}>
                <EmojiIcon char={group.emoji} size={18} />
                {group.label}
                <span style={paperDividerCountStyle}>{groupSubjects.length} 科</span>
              </h2>
              {groupSubjects.map((subject) => {
                const familyLabel = familyDisplayLabel(subject)
                const repSlot = state.representatives[subject.id]
                const repRow =
                  repSlot != null ? state.collected.get(slotKey(subject.id, repSlot)) : undefined
                // Open collection: render ONLY collected rows for this family, sorted by
                // slot index (P0 apex first). No silhouettes, no catalog slot grid, no
                // denominator — the catalog total stays hidden from the player.
                const familyRows = [...state.collected.values()]
                  .filter((r) => r.familyId === subject.id)
                  .sort((a, b) => a.slotIndex - b.slotIndex)
                const held = state.heldByFamily.get(subject.id) ?? []
                const totalIndividuals = held.length
                // Canonical per-family distinct-owned count (ghost slots excluded) —
                // NOT familyRows.length, which counts raw neuronVariants rows.
                const ownedInFamily = state.ownedSlotCountByFamily.get(subject.id) ?? 0
                const surplus = surplusByTier(held)
                const promoteTiers = PROMOTABLE_TIERS.filter((t) => (surplus[t] ?? 0) > 0)
                return (
                  <section key={subject.id} style={familySectionStyle} aria-label={familyLabel}>
                    <div style={familyHeaderRowStyle}>
                      <h3 style={familyTitleStyle}>
                        {repRow && (
                          <VariantSprite row={repRow} size={28} alt={`${familyLabel} 代表`} />
                        )}
                        {familyLabel}
                        {/* Chip stays distinct-slot (種類) via the canonical per-family
                            projection; total individuals is a faint secondary, only when
                            there are dupes (totalIndividuals > owned slots). */}
                        <span style={ownedCountStyle}><EmojiIcon char="🧬" size={14} /> {ownedInFamily} 隻</span>
                        {totalIndividuals > ownedInFamily && (
                          <span style={individualCountStyle}>· 共 {totalIndividuals} 個體</span>
                        )}
                      </h3>
                    </div>
                    {/* Tier-promote (add-neurons-dupe-fusion): consume K surplus dupes
                        of a tier → mint one rarer individual. Only tiers with surplus
                        show; disabled below K. */}
                    {promoteTiers.length > 0 && (
                      <div style={promoteRowStyle}>
                        <span style={promoteLabelStyle}><EmojiIcon char="🧬" size={14} /> 融合</span>
                        {promoteTiers.map((t) => {
                          const target = NEXT_RARER[t]
                          if (!target) return null
                          const have = surplus[t] ?? 0
                          const key = `${subject.id}:${t}`
                          const busy = promoting === key
                          const ready = have >= PROMOTE_COST_K && !promoting
                          return (
                            <button
                              key={t}
                              type="button"
                              disabled={!ready}
                              onClick={() => void handlePromote(subject.id, t)}
                              style={ready ? promoteBtnStyle : promoteBtnDisabledStyle}
                              title={`消耗 ${PROMOTE_COST_K} 隻重複 ${t} → 一隻 ${target}（保留每槽第一隻）`}
                            >
                              {busy ? '融合中…' : `${t}→${target}（${have}/${PROMOTE_COST_K}）`}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {familyRows.length > 0 && (
                      <div style={slotRowStyle}>
                        {familyRows.map((row) => (
                          <VariantSlotCard
                            key={row.slotIndex}
                            row={row}
                            instances={state.instancesBySlot.get(slotKey(subject.id, row.slotIndex)) ?? []}
                            nicknames={nicknames}
                            description={descByKey.get(slotKey(subject.id, row.slotIndex)) ?? ''}
                            isRepresentative={repSlot === row.slotIndex}
                            onSetRepresentative={() =>
                              void setRepresentative(subject.id, row.slotIndex)
                            }
                            inSquad={squadKeys.has(variantKey(subject.id, row.slotIndex))}
                            squadFull={squadFull}
                            onToggleSquad={() => onToggleSquad(subject.id, row.slotIndex)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )
        })
      )}

      {/* Connector neurons — bridge-class collectibles, a flat 55-set section
          independent of the per-family grouping above (add-neurons-connector-
          neuron-family). */}
      <ConnectorSection pack={pack} />

      {/* Mock-exam variant collection — an independent gacha pool unlocked by
          submitting 模擬考試, shown as a section here (mirrors ConnectorSection).
          finalize-mock-variant-catalog (relocated from the standalone page). */}
      <MockVariantSection />
    </section>
  )
}

/** Adapt a held individual into the row shape VariantSprite expects (so each
 *  individual renders its OWN context-art from its provenance + rolledAt). */
function instanceAsRow(inst: NeuronInstanceRow, displayName: string): NeuronVariantRow {
  return {
    familyId: inst.familyId,
    slotIndex: inst.slotIndex,
    rarity: inst.rarity,
    displayName,
    spriteKey: inst.spriteKey,
    rolledAt: inst.rolledAt,
    wasPityFloor: false,
    copies: 1,
    provenance: inst.provenance,
  }
}

function VariantSlotCard({
  row,
  instances,
  nicknames,
  description,
  isRepresentative,
  onSetRepresentative,
  inSquad,
  squadFull,
  onToggleSquad,
}: {
  row: NeuronVariantRow
  instances: NeuronInstanceRow[]
  nicknames: Map<string, string>
  description: string
  isRepresentative: boolean
  onSetRepresentative: () => void
  /** Whether this variant is in the active squad (drives the top-right squad toggle). */
  inSquad: boolean
  /** Squad is at MAX_SQUAD_SIZE (the toggle reads「隊伍已滿」for non-members). */
  squadFull: boolean
  onToggleSquad: () => void
}): JSX.Element {
  const color = RARITY_COLOR[row.rarity]
  const caption = variantBirthCaption(row)
  // Held individual count (current owned). Defensive fallback to lifetime copies.
  const heldCount = instances.length || (row.copies ?? 1)
  // Stable display order for the individuals strip (oldest birth first).
  const ordered = [...instances].sort((a, b) => a.rolledAt - b.rolledAt)
  const [expanded, setExpanded] = useState(false)
  // Per-instance rename (add-neurons-instance-rename): inline edit state.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Suppress the blur-commit fired when Escape (cancel) or Enter (already
  // committed) unmounts the input.
  const skipBlurCommit = useRef(false)
  const beginRename = (instanceId: string, current: string): void => {
    setDraft(current)
    setEditingId(instanceId)
  }
  const commitRename = (instanceId: string): void => {
    void setInstanceNickname(instanceId, draft)
    setEditingId(null)
  }
  return (
    <div style={cardWrapStyle}>
      {/* Global cross-family squad toggle (top-right), kept visually distinct from the per-family
          「設為代表」selection (the card button itself). redesign-neurons-homepage-squad-and-maze-focus. */}
      <div style={squadActionWrapStyle}>
        <SquadCardAction inSquad={inSquad} full={squadFull && !inSquad} onToggle={onToggleSquad} />
      </div>
      <button
        type="button"
        onClick={onSetRepresentative}
        style={{ ...cardStyle, borderColor: isRepresentative ? '#d4a04d' : '#c9b48f' }}
        aria-label={`${row.displayName}（${RARITY_LABEL[row.rarity]}）${isRepresentative ? '，目前代表' : '，點選設為代表'}`}
        aria-pressed={isRepresentative}
      >
        {isRepresentative && <span style={repMarkerStyle} aria-hidden="true">★</span>}
        {heldCount > 1 && (
          <span style={copiesBadgeStyle} aria-label={`持有 ${heldCount} 隻`}>
            × {heldCount}
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
      {/* Individual layer (add-neurons-dupe-fusion + add-neurons-instance-rename):
          expand to see each held individual with its own birth context-art and
          rename it. Available for ANY owned slot (incl. a single individual) so
          every neuron is renamable. Button sits OUTSIDE the card button. */}
      {ordered.length >= 1 && (
        <button
          type="button"
          style={expandBtnStyle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded
            ? '▾ 收合個體'
            : ordered.length > 1
              ? `▸ 展開 ${ordered.length} 隻個體 · 命名`
              : '▸ 個體 · 命名'}
        </button>
      )}
      {expanded && (
        <div style={individualsGridStyle}>
          {ordered.map((inst) => {
            const nick = nicknames.get(inst.instanceId) ?? ''
            const isEditing = editingId === inst.instanceId
            return (
              <div key={inst.instanceId} style={individualRowStyle}>
                <div
                  style={miniSpriteWrapStyle}
                  title={variantBirthCaption(instanceAsRow(inst, nick || row.displayName))}
                >
                  <VariantSprite
                    row={instanceAsRow(inst, nick || row.displayName)}
                    size={40}
                    alt={nick || row.displayName}
                  />
                </div>
                <div style={individualTextStyle}>
                  {isEditing ? (
                    <input
                      style={nicknameInputStyle}
                      value={draft}
                      maxLength={NICKNAME_MAX_LEN}
                      autoFocus
                      placeholder="取個名字…"
                      aria-label={`為 ${row.displayName} 命名`}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          skipBlurCommit.current = true
                          commitRename(inst.instanceId)
                        } else if (e.key === 'Escape') {
                          skipBlurCommit.current = true
                          setEditingId(null)
                        }
                      }}
                      onBlur={() => {
                        if (skipBlurCommit.current) {
                          skipBlurCommit.current = false
                          return
                        }
                        commitRename(inst.instanceId)
                      }}
                    />
                  ) : (
                    <>
                      <span style={individualNameStyle}>{nick || row.displayName}</span>
                      {nick && <span style={individualPersonaStyle}>{row.displayName}</span>}
                    </>
                  )}
                </div>
                {!isEditing && (
                  <button
                    type="button"
                    style={renameBtnStyle}
                    onClick={() => beginRename(inst.instanceId, nick)}
                    aria-label={`重新命名 ${nick || row.displayName}`}
                    title="重新命名"
                  >
                    ✏️
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Styles (cream/brown pixel aesthetic, matching OverviewPage / YearFilterBar) ─

const pageStyle: React.CSSProperties = {
  padding: '1.2rem 1rem 3rem',
  fontFamily: 'var(--font-pixel-cjk)',
  color: '#3a2a1a',
  maxWidth: 1100,
  margin: '0 auto',
}

const headerStyle: React.CSSProperties = { marginBottom: '0.4rem' }

const headerTopRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.6rem',
  flexWrap: 'wrap',
}

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

const shareBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  fontFamily: 'inherit',
  fontSize: '0.82rem',
  fontWeight: 700,
  padding: '0.4rem 1rem',
  borderRadius: '6px',
  border: '2px solid #b8893a',
  background: '#d4a04d',
  color: '#fff',
  cursor: 'pointer',
}

const emptyHintStyle: React.CSSProperties = {
  marginTop: '1.5rem',
  textAlign: 'center',
  fontSize: '0.85rem',
  color: '#8c6d4a',
}

const paperDividerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.5rem',
  margin: '1.6rem 0 0.2rem',
  fontSize: '1.05rem',
  fontWeight: 700,
  color: '#5a3e1a',
  letterSpacing: '0.04em',
}

const paperDividerCountStyle: React.CSSProperties = {
  fontSize: '0.74rem',
  fontWeight: 400,
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

// ─── Dupe-fusion additions (add-neurons-dupe-fusion) ─────────────────────────

const individualCountStyle: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 400,
  color: '#a89074',
}

const promoteRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '0.4rem',
  margin: '0 0 0.7rem',
}

const promoteLabelStyle: React.CSSProperties = {
  fontSize: '0.74rem',
  fontWeight: 700,
  color: '#6a8c3f',
}

const promoteBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.6rem',
  background: '#eef3e4',
  color: '#4f6a2f',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderColor: '#8aa861',
  borderRadius: '6px',
  fontSize: '0.74rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const promoteBtnDisabledStyle: React.CSSProperties = {
  ...promoteBtnStyle,
  background: '#f0ecde',
  color: '#a8a088',
  borderColor: '#cdc6ac',
  cursor: 'not-allowed',
}

const cardWrapStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

// Squad toggle sits in the card's top-right corner, above the representative-select button.
const squadActionWrapStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  zIndex: 2,
}

// 「隊伍已滿」hint toast (top, transient).
const squadToastStyle: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1100,
  padding: '0.5rem 0.9rem',
  borderRadius: '999px',
  background: 'rgba(40, 28, 16, 0.92)',
  color: '#fdf6e3',
  fontSize: '0.85rem',
  fontWeight: 600,
  boxShadow: '0 4px 14px rgba(20, 14, 38, 0.4)',
  pointerEvents: 'none',
}

const expandBtnStyle: React.CSSProperties = {
  padding: '0.15rem 0.4rem',
  background: 'transparent',
  border: 'none',
  color: '#8c6d4a',
  fontSize: '0.66rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'center',
}

const individualsGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  padding: '0.3rem',
  background: '#f4ecd8',
  border: '1px dashed #c9b48f',
  borderRadius: '6px',
}

const miniSpriteWrapStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  background: '#fbf6e9',
  border: '1px solid #c9b48f',
  borderRadius: '4px',
}

const individualRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.2rem 0.3rem',
  background: '#fbf6e9',
  border: '1px solid #c9b48f',
  borderRadius: '4px',
}

const individualTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  lineHeight: 1.2,
}

const individualNameStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#3a2a1a',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const individualPersonaStyle: React.CSSProperties = {
  fontSize: '0.64rem',
  color: '#9b8c70',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const nicknameInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.15rem 0.35rem',
  fontSize: '0.78rem',
  fontFamily: 'inherit',
  color: '#3a2a1a',
  background: '#fff',
  border: '1px solid #d4a04d',
  borderRadius: '4px',
}

const renameBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '0.1rem 0.3rem',
  background: 'transparent',
  border: 'none',
  fontSize: '0.85rem',
  cursor: 'pointer',
  lineHeight: 1,
}
