import { useState } from 'react'
import type { Player, Item, EquipSlot, StatSchema, ItemInstance } from '@study-rpg/core'

type Sprites = Record<string, string>

interface Props {
  player: Player
  statSchema: StatSchema
  sprites: Sprites
  catalog: Item[]
  instances: ItemInstance[]
  /** Aggregated stats (base + equipment) for display only. */
  effectiveStats: Player['stats']
  /** The sprite key to render for the character (resolved by App with fallback to 'character-base'). */
  characterSpriteKey: string
  /** Whether to show the variant cycle controls (only when ≥ 2 variants). */
  canCycleVariant: boolean
  onRename: (name: string) => void
  onSlotClick: (slot: EquipSlot) => void
  onCycleVariant: (direction: 1 | -1) => void
  onSkillTreeClick: () => void
}

const SLOT_ORDER: EquipSlot[] = ['head', 'body', 'weapon', 'charm']
const SLOT_LABEL: Record<EquipSlot, string> = {
  head: '頭',
  body: '身',
  weapon: '手',
  charm: '飾',
  consumable: '消',
}

const STAT_TOOLTIPS: Record<string, string> = {
  knowledge: '知識力 — 答對 quiz 每題 +1',
  reflex: '反應 — 答對且 < 10 秒 +1',
  memory: '記憶 — SRS 複習模式答對 +1',
  stamina: '耐力 — 閱讀模式每分鐘 +1',
}

export function CharCard({ player, statSchema, sprites, catalog, instances, effectiveStats, characterSpriteKey, canCycleVariant, onRename, onSlotClick, onCycleVariant, onSkillTreeClick }: Props) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(player.name)

  function commitName() {
    setEditing(false)
    if (draftName.trim() && draftName !== player.name) onRename(draftName.trim())
    else setDraftName(player.name)
  }

  function slotItem(slot: EquipSlot): Item | undefined {
    const instId = player.equipment[slot as 'head' | 'body' | 'weapon' | 'charm']
    if (!instId) return undefined
    const inst = instances.find((i) => i.id === instId)
    if (!inst) return undefined
    return catalog.find((it) => it.id === inst.itemId)
  }

  return (
    <div className="frame char-card">
      <div className="char-sprite-wrap">
        <img className="char-sprite" src={sprites[characterSpriteKey] ?? sprites['character-base']} alt={player.name} />
        {canCycleVariant && (
          <>
            <button
              className="char-variant-btn char-variant-prev"
              onClick={() => onCycleVariant(-1)}
              aria-label="previous character variant"
              title="切換角色 (上一個)"
            >◀</button>
            <button
              className="char-variant-btn char-variant-next"
              onClick={() => onCycleVariant(1)}
              aria-label="next character variant"
              title="切換角色 (下一個)"
            >▶</button>
          </>
        )}
      </div>
      <div className="char-name-row">
        {editing ? (
          <input
            className="char-name-input"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') { setEditing(false); setDraftName(player.name) }
            }}
          />
        ) : (
          <span className="name" onClick={() => setEditing(true)}>{player.name}</span>
        )}
        <span className="lvl">Lv.{player.level}</span>
      </div>
      <div className="bar-track" aria-label={`XP ${player.xp}`}>
        <div className="bar-fill" style={{ width: `${Math.min(100, player.xp)}%`, background: 'var(--accent-gold)' }} />
      </div>
      <div className="char-xp-label">XP {player.xp} / next lv</div>

      <div className="equip-grid">
        {SLOT_ORDER.map((slot) => {
          const it = slotItem(slot)
          const placeholder = sprites[`slot-placeholder-${slot}`]
          return (
            <button
              key={slot}
              className={`equip-tile ${it ? `rarity-${it.rarity} occupied` : 'empty'}`}
              onClick={() => onSlotClick(slot)}
              title={it ? `${it.name} (${it.rarity}) — 點擊卸下` : `${SLOT_LABEL[slot]} 部位 — 點擊選擇`}
            >
              <img src={it ? sprites[it.artKey] : placeholder} alt={it?.name ?? `slot ${slot}`} />
              <span className="equip-tile-label">{SLOT_LABEL[slot]}</span>
            </button>
          )
        })}
      </div>

      <div className="stats">
        {statSchema.order.map((s) => {
          const base = player.stats[s] ?? 0
          const eff = effectiveStats[s] ?? 0
          const bonus = eff - base
          return (
            <div key={s} className="stat-row" title={STAT_TOOLTIPS[s] ?? statSchema.labels[s]}>
              <span>{statSchema.labels[s]}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, eff)}%`, background: statSchema.colors[s] }} />
              </div>
              <span>{eff}{bonus > 0 ? <small style={{ color: 'var(--accent-gold)' }}> +{bonus}</small> : null}</span>
            </div>
          )
        })}
      </div>

      <button type="button" className="char-card-skill-btn" onClick={onSkillTreeClick}>
        🌿 技能樹
      </button>
    </div>
  )
}
