import type { GachaTier, PityRule } from '@study-rpg/core'
import type { Rarity } from '@study-rpg/content-medexam2-tw'

export type EquipmentCategory =
  | 'stethoscope'
  | 'scalpel'
  | 'chart'
  | 'coat'
  | 'textbook'
  | 'coffee'

export type UpgradeableEquipmentCategory = Extract<
  EquipmentCategory,
  'stethoscope' | 'scalpel' | 'chart' | 'coat'
>

export type EquipmentUpgradeSourceRarity = Exclude<Rarity, 'P1'>

export interface EquipmentDefinition {
  id: string
  name: string
  category: EquipmentCategory
  rarity: Rarity
  effectText: string
}

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  stethoscope: '聽診器',
  scalpel: '手術刀',
  chart: '病歷夾',
  coat: '白袍',
  textbook: '教科書',
  coffee: '值班咖啡',
}

export const EQUIPMENT_RARITY_LABELS: Record<Rarity, string> = {
  P1: '傳說',
  P2: '頂級',
  P3: '稀有',
  P4: '精良',
  P5: '標準',
}

export const INITIAL_EQUIPMENT_TICKETS = 10
export const EQUIPMENT_TICKET_CAP = 99

export const EQUIPMENT_WEIGHTS: GachaTier[] = [
  { id: 'P5', weight: 55 },
  { id: 'P4', weight: 27 },
  { id: 'P3', weight: 13 },
  { id: 'P2', weight: 4 },
  { id: 'P1', weight: 1 },
]

export const EQUIPMENT_PITY_RULES: PityRule[] = [
  { tier: 'P3', atRolls: 20 },
  { tier: 'P2', atRolls: 80 },
]

export const UPGRADEABLE_EQUIPMENT_CATEGORIES: ReadonlyArray<UpgradeableEquipmentCategory> =
  Object.freeze(['stethoscope', 'scalpel', 'chart', 'coat'])

export const EQUIPMENT_PARTS_BY_RARITY: Readonly<Record<Rarity, number>> = Object.freeze({
  P5: 10,
  P4: 25,
  P3: 70,
  P2: 200,
  P1: 600,
})

export const EQUIPMENT_UPGRADE_COSTS: Readonly<
  Record<EquipmentUpgradeSourceRarity, { parts: number; revenue: number }>
> = Object.freeze({
  P5: { parts: 25, revenue: 1_000 },
  P4: { parts: 75, revenue: 5_000 },
  P3: { parts: 200, revenue: 25_000 },
  P2: { parts: 600, revenue: 125_000 },
})

export const EQUIPMENT_NEXT_RARITY: Readonly<Record<EquipmentUpgradeSourceRarity, Rarity>> =
  Object.freeze({
    P5: 'P4',
    P4: 'P3',
    P3: 'P2',
    P2: 'P1',
  })

export const EQUIPMENT_DEFINITIONS: EquipmentDefinition[] = [
  {
    id: 'standard-stethoscope',
    name: '標準聽診器',
    category: 'stethoscope',
    rarity: 'P5',
    effectText: '門診產能 +5%。裝備中的醫師在門診房間效率提升。',
  },
  {
    id: 'advanced-stethoscope',
    name: '進階聽診器',
    category: 'stethoscope',
    rarity: 'P4',
    effectText: '門診產能 +10%。更穩定的門診診斷器材。',
  },
  {
    id: 'night-shift-coffee',
    name: '值班咖啡',
    category: 'coffee',
    rarity: 'P5',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'clean-white-coat',
    name: '乾淨白袍',
    category: 'coat',
    rarity: 'P5',
    effectText: '所有房型產能 +3%。泛用，任何科別都能穿。',
  },
  {
    id: 'senior-white-coat',
    name: '資深白袍',
    category: 'coat',
    rarity: 'P4',
    effectText: '所有房型產能 +6%。讓醫師在各房型都更有效率。',
  },
  {
    id: 'basic-scalpel',
    name: '基礎手術刀',
    category: 'scalpel',
    rarity: 'P5',
    effectText: '手術房產能 +5%。裝備中的醫師在手術房效率提升。',
  },
  {
    id: 'surgical-scalpel',
    name: '外科手術刀',
    category: 'scalpel',
    rarity: 'P4',
    effectText: '手術房產能 +10%。適合外科系醫師。',
  },
  {
    id: 'standard-chart',
    name: '標準病歷夾',
    category: 'chart',
    rarity: 'P5',
    effectText: '病房產能 +5%。裝備中的醫師在病房效率提升。',
  },
  {
    id: 'rounding-chart',
    name: '病房查房夾',
    category: 'chart',
    rarity: 'P4',
    effectText: '病房產能 +10%。適合住院照護取向醫師。',
  },
  {
    id: 'pocket-guideline',
    name: '口袋臨床指引',
    category: 'textbook',
    rarity: 'P4',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'attending-white-coat',
    name: '主治白袍',
    category: 'coat',
    rarity: 'P3',
    effectText: '所有房型產能 +12%。泛用，適合輪調中的主力醫師。',
  },
  {
    id: 'cardiology-stethoscope',
    name: '心臟科聽診器',
    category: 'stethoscope',
    rarity: 'P3',
    effectText: '門診產能 +20%。適合內科與家醫科王牌。',
  },
  {
    id: 'annotated-textbook',
    name: '滿是註記的國考書',
    category: 'textbook',
    rarity: 'P3',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'microsurgery-scalpel',
    name: '顯微手術刀',
    category: 'scalpel',
    rarity: 'P3',
    effectText: '手術房產能 +20%。精密手術團隊的核心器材。',
  },
  {
    id: 'golden-chart',
    name: '金邊病歷夾',
    category: 'chart',
    rarity: 'P3',
    effectText: '病房產能 +20%。適合病房管理與連續照護。',
  },
  {
    id: 'master-diagnostic-stethoscope',
    name: '主任聽診器',
    category: 'stethoscope',
    rarity: 'P2',
    effectText: '門診產能 +35%。適合核心門診醫師。',
  },
  {
    id: 'chief-scalpel',
    name: '主任手術刀',
    category: 'scalpel',
    rarity: 'P2',
    effectText: '手術房產能 +35%。適合核心外科醫師。',
  },
  {
    id: 'electronic-chart-board',
    name: '電子病歷中控板',
    category: 'chart',
    rarity: 'P2',
    effectText: '病房產能 +35%。適合高壓病房管理。',
  },
  {
    id: 'professor-coat',
    name: '教授白袍',
    category: 'coat',
    rarity: 'P2',
    effectText: '所有房型產能 +20%。適合醫院主力醫師。',
  },
  {
    id: 'legendary-coffee',
    name: '傳說值班咖啡',
    category: 'coffee',
    rarity: 'P2',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'national-board-textbook',
    name: '國考祕典',
    category: 'textbook',
    rarity: 'P1',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'oracle-stethoscope',
    name: '"Epitaph of the Crimson Pulse"',
    category: 'stethoscope',
    rarity: 'P1',
    effectText: '門診產能 +55%。傳說級診斷裝備，適合門診王牌。',
  },
  {
    id: 'shadowless-scalpel',
    name: '"Severance of the Ephemeral"',
    category: 'scalpel',
    rarity: 'P1',
    effectText: '手術房產能 +55%。傳說級手術裝備，適合外科核心醫師。',
  },
  {
    id: 'chief-rounding-chart',
    name: '"Shackles of the Resident"',
    category: 'chart',
    rarity: 'P1',
    effectText: '病房產能 +55%。傳說級病房管理裝備，適合照護主力醫師。',
  },
  {
    id: 'founder-white-coat',
    name: '"Mantle of the White Tower"',
    category: 'coat',
    rarity: 'P1',
    effectText: '所有房型產能 +30%。傳說級泛用裝備，適合任何醫院王牌。',
  },
]

export const EQUIPMENT_ROLL_DEFINITIONS: EquipmentDefinition[] = EQUIPMENT_DEFINITIONS.filter(
  (item) => item.category !== 'coffee' && item.category !== 'textbook',
)

export function getEquipmentDefinition(definitionId: string): EquipmentDefinition | undefined {
  return EQUIPMENT_DEFINITIONS.find((item) => item.id === definitionId)
}

export function getDefinitionsByRarity(rarity: Rarity): EquipmentDefinition[] {
  return EQUIPMENT_ROLL_DEFINITIONS.filter((item) => item.rarity === rarity)
}

export function isUpgradeableEquipmentCategory(
  category: EquipmentCategory,
): category is UpgradeableEquipmentCategory {
  return UPGRADEABLE_EQUIPMENT_CATEGORIES.includes(category as UpgradeableEquipmentCategory)
}

export function getNextEquipmentRarity(rarity: Rarity): Rarity | null {
  if (rarity === 'P1') return null
  return EQUIPMENT_NEXT_RARITY[rarity]
}

export function getEquipmentDefinitionByCategoryAndRarity(
  category: EquipmentCategory,
  rarity: Rarity,
): EquipmentDefinition | undefined {
  return EQUIPMENT_ROLL_DEFINITIONS.find((item) => item.category === category && item.rarity === rarity)
}

export function getNextEquipmentDefinition(
  category: EquipmentCategory,
  rarity: Rarity,
): EquipmentDefinition | undefined {
  const nextRarity = getNextEquipmentRarity(rarity)
  if (!nextRarity) return undefined
  return getEquipmentDefinitionByCategoryAndRarity(category, nextRarity)
}
