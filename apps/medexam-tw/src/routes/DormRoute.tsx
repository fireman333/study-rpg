import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Cosmetic, ItemInstance, Player } from '@study-rpg/core'
import { CosmeticPicker } from '../components/CosmeticPicker'

interface Props {
  player: Player
  setPlayer: (p: Player) => void
  instances: ItemInstance[]
  setInstances: (next: ItemInstance[]) => void
  catalog: readonly Cosmetic[]
  sprites: Record<string, string>
  /** Default character sprite when player.characterSpriteKey is unset. */
  defaultCharacterSpriteKey: string
}

export function DormRoute({
  player,
  setPlayer,
  instances,
  setInstances,
  catalog,
  sprites,
  defaultCharacterSpriteKey,
}: Props) {
  // Resolve which sprite key is equipped per cosmetic slot. Map slot → artKey via catalog.
  const equippedArtKeys = useMemo(() => {
    function getArt(slot: 'cosmetic-head' | 'cosmetic-body' | 'cosmetic-accessory' | 'cosmetic-held' | 'cosmetic-background'): string | null {
      const instId = player.equipment[slot]
      if (!instId) return null
      const inst = instances.find((i) => i.id === instId)
      if (!inst) return null
      const cosmetic = catalog.find((c) => c.id === inst.itemId)
      return cosmetic?.artKey ?? null
    }
    return {
      head: getArt('cosmetic-head'),
      body: getArt('cosmetic-body'),
      accessory: getArt('cosmetic-accessory'),
      held: getArt('cosmetic-held'),
      background: getArt('cosmetic-background'),
    }
  }, [player.equipment, instances, catalog])

  const characterSpriteUrl = sprites[player.characterSpriteKey ?? defaultCharacterSpriteKey]
  const backgroundSpriteUrl = equippedArtKeys.background
    ? sprites[equippedArtKeys.background]
    : sprites['dorm-default']

  return (
    <div className="dorm-page">
      <header className="dorm-header">
        <Link to="/" className="dorm-back">← 回家</Link>
        <h2>🏠 宿舍</h2>
        <span className="dorm-hint">純展示空間 · 不會影響閱讀計時或屬性</span>
      </header>

      <div className="dorm-character-stage">
        {backgroundSpriteUrl && (
          <img src={backgroundSpriteUrl} alt="dorm background" className="dorm-layer dorm-layer-background" />
        )}
        {characterSpriteUrl && (
          <img src={characterSpriteUrl} alt="character" className="dorm-layer dorm-layer-character" />
        )}
        {equippedArtKeys.body && (
          <img src={sprites[equippedArtKeys.body]} alt="body cosmetic" className="dorm-layer dorm-layer-body" />
        )}
        {equippedArtKeys.head && (
          <img src={sprites[equippedArtKeys.head]} alt="head cosmetic" className="dorm-layer dorm-layer-head" />
        )}
        {equippedArtKeys.accessory && (
          <img src={sprites[equippedArtKeys.accessory]} alt="accessory cosmetic" className="dorm-layer dorm-layer-accessory" />
        )}
        {equippedArtKeys.held && (
          <img src={sprites[equippedArtKeys.held]} alt="held cosmetic" className="dorm-layer dorm-layer-held" />
        )}
      </div>

      <section className="dorm-changing-room">
        <h3 className="dorm-section-label">👔 裝扮間</h3>
        <CosmeticPicker
          player={player}
          setPlayer={setPlayer}
          instances={instances}
          setInstances={setInstances}
          catalog={catalog}
          sprites={sprites}
        />
      </section>
    </div>
  )
}
