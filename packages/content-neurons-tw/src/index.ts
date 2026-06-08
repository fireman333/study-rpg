/**
 * Content pack: neurons-themed reskin of Taiwan Stage-1 medical board exam
 * (M_3rd track). Question corpus is 100% shared with `@study-rpg/content-medexam-tw`
 * (~3291 questions across 11 neuron-family subjects). Subject `displayName`s
 * replaced with Linnean phylogenetic taxonomy on 4 neurotransmitter branches
 * (DA / 5-HT / GABA / Glu); see design.md Decision 1 of
 * wire-neurons-content-and-theme for the full mapping.
 *
 * Data is loaded lazily from `./dist/{meta,subjects,questions}.json` produced
 * by `pnpm --filter @study-rpg/content-neurons-tw build`. The build script
 * reads medexam-tw artifacts + re-splits the 微生物暨免疫學 subject into
 * 微生物學 + 免疫學 via source markdown per-Q `**科目**：` tag lookup.
 */

import type { ContentPack, Question, StatSchema, Subject } from '@study-rpg/core'

interface BuiltMeta {
  id: string
  displayName: string
  locale: string
  builtAt: string
  sourceCredit: string
  sourceUrl: string
  license: string
  stats: {
    totalQuestions: number
    parsedFiles: number
    totalFiles: number
    subjects: number
    splitMicro: number
    splitImmune: number
    untaggedFallback: number
  }
  statSchema: StatSchema
}

export async function getContentPack(baseUrl = '/content/neurons-tw'): Promise<ContentPack> {
  const [meta, subjects, questions] = await Promise.all([
    fetch(`${baseUrl}/meta.json`).then((r) => r.json() as Promise<BuiltMeta>),
    fetch(`${baseUrl}/subjects.json`).then((r) => r.json() as Promise<Subject[]>),
    fetch(`${baseUrl}/questions.json`).then((r) => r.json() as Promise<Question[]>),
  ])

  return {
    meta: {
      id: meta.id,
      displayName: meta.displayName,
      locale: meta.locale,
      examMeta: { builtAt: meta.builtAt, stats: meta.stats, supportsMockExam: true },
      credits: [
        {
          name: '中華民國考選部 (歷屆考題)',
          url: 'https://www.moex.gov.tw/',
          license: 'public domain (試題)',
        },
        {
          name: '陽明國考考古題小組 (詳解)',
          url: 'https://sites.google.com/view/ymmedexam/ans',
          license: 'CC-BY-NC-4.0',
        },
        {
          name: 'neurons reskin (M_3rd track)',
          license: 'AGPL-3.0-or-later',
        },
      ],
      statSchema: meta.statSchema,
    },
    subjects,
    questions,
  }
}

export {
  FAMILY_NT_BRANCH,
  FAMILY_IDS,
  NT_BRANCHES,
  FAMILIES_BY_BRANCH,
  branchOfFamily,
  FAMILY_COLOR,
  FAMILY_EXAM_PAPER,
  EXAM_PAPER_ORDER,
  type NtBranchId,
  type ExamPaper,
} from './families'

// Flat-grid maze faucet + pacing + synaptic-conduction constants (single source of
// truth — redesign-neurons-maze-rotjs-grid + rework-neurons-connectome-expedition-driven).
export {
  CORRECT_ANSWER_ENERGY,
  READING_MINUTE_ENERGY,
  PACING_BASE,
  PACING_K,
  RAMP_CAP_N,
  SPEED_BUFF_PER_VARIANT,
  SPEED_BUFF_CAP,
  CONDUCTION_RATE_WEAK,
  CONDUCTION_RATE_STRONG,
  CONDUCTION_WIRE_CAP_WEAK,
  CONDUCTION_WIRE_CAP_STRONG,
  CONDUCTION_SOURCE_CAP_PER_DAY,
  CONDUCTION_TARGET_CAP_PER_DAY,
  CONNECTOME_CONDUCTION_EPOCH,
} from './maze-constants'

export {
  NEURON_VARIANT_CATALOG,
  NEURON_VARIANT_TOTAL,
  VARIANT_COUNT_BY_FAMILY,
  VARIANT_RARITY_WEIGHTS,
  P0_BASE_RATE,
  P0_PITY_START,
  P0_PITY_RAMP,
  P1_PITY_START,
  P1_PITY_RAMP,
  PULL_COST,
  PROMOTE_COST_K,
  MILESTONE_STREAK_THRESHOLD,
  DEFAULT_VARIANT_TITLE_BY_RARITY,
  composeVariantDisplayName,
  effectiveP0Rate,
  effectiveP1Rate,
  rollRarityWithP0Pity,
  type Rarity,
  type SlotIndex,
  type NeuronVariantDef,
  type VariantRarityTier,
} from './variants'

export {
  NEURONS_ACHIEVEMENTS,
  NEURONS_ACHIEVEMENTS_STATS,
} from './achievements'

export {
  NEURONS_ACHIEVEMENT_CATEGORIES,
  TIER_LABEL,
  CATEGORY_LABEL,
  tierRank,
  type NeuronsAchievement,
  type NeuronsAchievementTier,
  type NeuronsAchievementCategory,
  type NeuronsAchievementReward,
  type NeuronsAchievementStats,
  type NeuronsPlayerSnapshot,
  type FamilyMasteryTier,
} from './achievement-types'

export {
  validateNeuronsAchievementCatalog,
  type ValidationFailure,
} from './achievement-validator'

export {
  DMN_RARITY_WEIGHTS,
  DMN_RARITIES,
  DMN_EVENT_TYPES,
  DMN_EXPEDITION_MILESTONES,
  DMN_EXPEDITION_DAILY_CAP,
  DMN_BEHAVIOR_AXIS_DAILY_CAP,
  DMN_FAMILY_BUFF_DURATION_MS,
  FAMILY_BUFF_ENERGY_MULT,
  type DmnRarity,
  type DmnEventKind,
  type DmnCardDef,
  type DmnCardRow,
  type DmnEventLogRow,
  type DmnActiveBuffRow,
  type DmnMetaSnapshot,
  type DmnExpeditionMilestone,
} from './dmn-types'

export { DMN_CARD_CATALOG } from './dmn-cards'

export {
  validateDmnCardCatalog,
  countByEventKind,
  EXPECTED_CATALOG_SIZE,
  EXPECTED_RARITY_DISTRIBUTION,
  MIN_CARDS_PER_EVENT_KIND,
} from './dmn-card-validator'

// Permanent equipment/companion (add-neurons-acceleration-system)
export {
  EQUIPMENT_RARITIES,
  EQUIPMENT_RARITY_BONUS,
  EQUIPMENT_RARITY_WEIGHTS,
  EQUIPMENT_DRAW_RATE,
  type EquipmentRarity,
  type EquipmentLane,
  type EquipmentDef,
  type OwnedEquipmentRow,
} from './equipment-types'

export { EQUIPMENT_CATALOG, livingCompanionDefs, livingCompanions } from './equipment-catalog'

export {
  validateEquipmentCatalog,
  MIN_EQUIPMENT_COUNT,
  MIN_ITEMS_PER_TIER,
  type EquipmentValidationFailure,
} from './equipment-validator'

export { CIRCUIT_LOCATIONS, type CircuitLocation } from './circuit-locations'
