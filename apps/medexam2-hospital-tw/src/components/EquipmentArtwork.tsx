import type { EquipmentRow } from '../db/schema'
import epitaphHero from '../assets/equipment/p1-epitaph-crimson-pulse.png'
import mantleHero from '../assets/equipment/p1-mantle-white-tower.png'
import severanceHero from '../assets/equipment/p1-severance-ephemeral.png'
import shacklesHero from '../assets/equipment/p1-shackles-resident.png'
import { EquipmentIcon } from './EquipmentIcon'

interface EquipmentArtworkProps {
  item: EquipmentRow
  className?: string
}

const P1_HERO_ART: Partial<Record<string, string>> = {
  'oracle-stethoscope': epitaphHero,
  'shadowless-scalpel': severanceHero,
  'chief-rounding-chart': shacklesHero,
  'founder-white-coat': mantleHero,
}

export function hasEquipmentHeroArt(item: EquipmentRow): boolean {
  return item.rarity === 'P1' && Boolean(P1_HERO_ART[item.definitionId])
}

export function EquipmentArtwork({ item, className }: EquipmentArtworkProps) {
  const heroArt = item.rarity === 'P1' ? P1_HERO_ART[item.definitionId] : undefined

  if (heroArt) {
    return (
      <img
        className={`equipment-artwork equipment-artwork--hero ${className ?? ''}`}
        src={heroArt}
        alt=""
        draggable={false}
      />
    )
  }

  return (
    <EquipmentIcon
      category={item.category}
      rarity={item.rarity}
      className={`equipment-artwork equipment-artwork--icon ${className ?? ''}`}
    />
  )
}
