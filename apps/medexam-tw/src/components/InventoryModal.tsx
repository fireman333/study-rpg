import type { Item, ItemInstance, EquipSlot } from '@study-rpg/core'

type Sprites = Record<string, string>

interface Props {
  /** If set, only show items whose slot matches. Otherwise show all. */
  filterSlot: EquipSlot | null
  inventory: ItemInstance[]
  catalog: Item[]
  sprites: Sprites
  onClose: () => void
  onPickInstance: (inst: ItemInstance, item: Item) => void
}

export function InventoryModal({ filterSlot, inventory, catalog, sprites, onClose, onPickInstance }: Props) {
  const tiles = inventory
    .map((inst) => ({ inst, item: catalog.find((c) => c.id === inst.itemId) }))
    .filter((t): t is { inst: ItemInstance; item: Item } => !!t.item)
    // Hide cosmetics from functional inventory — they live in dorm picker only.
    .filter((t) => !t.item.isCosmetic)
    .filter((t) => (filterSlot ? t.item.slot === filterSlot : true))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal frame" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>背包 — {filterSlot ? `${filterSlot} 部位 (${tiles.length})` : `全部 (${tiles.length})`}</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {tiles.length === 0 ? (
          <div className="empty-state">該部位還沒有可用裝備，去抽卡吧。</div>
        ) : (
          <div className="inventory-grid">
            {tiles.map(({ inst, item }) => (
              <button
                key={inst.id}
                className={`inv-tile rarity-${item.rarity}`}
                onClick={() => onPickInstance(inst, item)}
                title={`${item.name} (${item.rarity}) — ${item.flavor ?? ''}`}
              >
                <img src={sprites[item.artKey]} alt={item.name} />
                <span className="inv-tile-name">{item.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
