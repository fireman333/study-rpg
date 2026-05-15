import { useMemo } from 'react'
import type { Cosmetic, CosmeticCategory, ItemInstance, Player } from '@study-rpg/core'
import { cosmeticSlotForCategory, equipCosmetic, instanceFromCosmetic, unequipCosmetic } from '@study-rpg/core'

const CATEGORY_ORDER: CosmeticCategory[] = ['head', 'body', 'accessory', 'held', 'background']
const CATEGORY_LABEL: Record<CosmeticCategory, string> = {
  head: '頭飾',
  body: '身體',
  accessory: '配飾',
  held: '持物',
  background: '背景',
}

interface Props {
  player: Player
  setPlayer: (p: Player) => void
  instances: ItemInstance[]
  setInstances: (next: ItemInstance[]) => void
  catalog: readonly Cosmetic[]
  sprites: Record<string, string>
}

export function CosmeticPicker({ player, setPlayer, instances, setInstances, catalog, sprites }: Props) {
  const byCategory = useMemo(() => {
    const map: Record<CosmeticCategory, Cosmetic[]> = {
      head: [], body: [], accessory: [], held: [], background: [],
    }
    for (const c of catalog) map[c.category].push(c)
    return map
  }, [catalog])

  // Map cosmetic.id → owned instance (if any)
  const instanceById = useMemo(() => {
    const m = new Map<string, ItemInstance>()
    for (const inst of instances) m.set(inst.itemId, inst)
    return m
  }, [instances])

  function handleEquip(cosmetic: Cosmetic) {
    const slot = cosmeticSlotForCategory(cosmetic.category)
    let inst = instanceById.get(cosmetic.id)
    let nextInstances = instances
    if (!inst) {
      // Player is unlocked but doesn't have ItemInstance yet — generate one
      inst = instanceFromCosmetic(cosmetic)
      nextInstances = [...instances, inst]
      setInstances(nextInstances)
    }
    setPlayer(equipCosmetic(player, inst.id, slot))
  }

  function handleUnequip(cosmetic: Cosmetic) {
    const slot = cosmeticSlotForCategory(cosmetic.category)
    setPlayer(unequipCosmetic(player, slot))
  }

  return (
    <div className="cosmetic-picker">
      {CATEGORY_ORDER.map((cat) => {
        const entries = byCategory[cat]
        if (entries.length === 0) return null
        return (
          <section key={cat} className="cosmetic-category">
            <h3 className="cosmetic-category-label">{CATEGORY_LABEL[cat]}</h3>
            <div className="cosmetic-grid">
              {entries.map((c) => {
                const unlocked = c.unlockCondition(player)
                const slot = cosmeticSlotForCategory(c.category)
                const inst = instanceById.get(c.id)
                const equipped = inst != null && player.equipment[slot] === inst.id
                const spriteUrl = sprites[c.artKey]
                return (
                  <div
                    key={c.id}
                    className={`cosmetic-tile ${unlocked ? 'cosmetic-tile-unlocked' : 'cosmetic-tile-locked'} ${equipped ? 'cosmetic-tile-equipped' : ''}`}
                  >
                    <div className="cosmetic-tile-art">
                      {spriteUrl ? (
                        <img src={spriteUrl} alt={c.name} className="cosmetic-tile-sprite" />
                      ) : (
                        <div className="cosmetic-tile-sprite cosmetic-tile-sprite-missing">{c.name[0]}</div>
                      )}
                      {!unlocked && <div className="cosmetic-tile-lock-overlay">?</div>}
                    </div>
                    <div className="cosmetic-tile-name">{c.name}</div>
                    {unlocked ? (
                      equipped ? (
                        <button className="cosmetic-tile-btn cosmetic-tile-unequip" onClick={() => handleUnequip(c)}>
                          脫下
                        </button>
                      ) : (
                        <button className="cosmetic-tile-btn cosmetic-tile-equip" onClick={() => handleEquip(c)}>
                          穿上
                        </button>
                      )
                    ) : (
                      <div className="cosmetic-tile-hint" title={c.unlockDescription}>
                        {c.unlockDescription}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
