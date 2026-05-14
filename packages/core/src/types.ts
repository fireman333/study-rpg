/**
 * @study-rpg/core public API surface.
 *
 * Stability contract: these interfaces are the API third-party content packs
 * and theme packs depend on. Breaking changes require a major version bump
 * post-1.0; during 0.x every breaking change is logged in CHANGELOG.md.
 */

// ─── Identity types ──────────────────────────────────────────────────────────

export type SubjectId = string
export type QuestionId = string
export type ItemId = string
export type ItemInstanceId = string
export type BadgeId = string

export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR'

export type EquipSlot = 'head' | 'body' | 'weapon' | 'charm' | 'consumable'

// ─── Content domain ──────────────────────────────────────────────────────────

export interface Subject {
  id: SubjectId
  displayName: string
  group?: string // e.g. "醫學一" / "醫學二", or "core" / "elective"
  color: string  // CSS color (matches theme palette)
  iconKey?: string
  totalQuestions: number
}

export interface Question {
  id: QuestionId
  subject: SubjectId
  stem: string
  options: Record<string, string> // e.g. { A: "...", B: "...", C: "...", D: "..." }
  answer: string                  // key into options, e.g. "C"
  explanation: string             // markdown allowed
  hasImage?: boolean
  meta?: Record<string, unknown>  // exam-specific extras (year, session, etc.)
  sourceCredit?: string           // attribution string
}

// ─── Loot / Items ────────────────────────────────────────────────────────────

export interface ItemEffect {
  stat?: { name: string; delta: number }
  multiplier?: {
    type: 'readingSpeed' | 'quizXp' | 'bossXp' | 'critRate' | 'luck'
    value: number
    durationMs?: number // for consumables; undefined = permanent (equipment)
  }
}

export interface Item {
  id: ItemId
  name: string
  rarity: Rarity
  slot: EquipSlot
  effects: ItemEffect[]
  artKey: string  // sprite key into theme.sprites
  flavor?: string
  sourceCredit?: string
  /** Question IDs that contributed to this item's naming (debug / educational). Not shown in UI. */
  sourceQuestionIds?: string[]
}

export interface ItemInstance {
  id: ItemInstanceId
  itemId: ItemId
  obtainedAt: number
  locked: boolean
}

export interface Drop {
  id: string
  ts: number
  source: 'read' | 'quiz' | 'boss-mini' | 'boss-annual'
  rarity: Rarity
  itemId: ItemId
  wasPity: boolean
}

// ─── Player ──────────────────────────────────────────────────────────────────

export interface PlayerStats {
  [statName: string]: number
}

export interface SubjectProgress {
  level: number
  xp: number
  mastery: number // 0..1
}

export interface LootStats {
  rollsSinceLastSR: number
  rollsSinceLastSSR: number
  totalRolls: number
}

export interface Equipment {
  head?: ItemInstanceId
  body?: ItemInstanceId
  weapon?: ItemInstanceId
  charm?: ItemInstanceId
}

export interface Player {
  id: string
  name: string
  level: number
  xp: number
  hp: number
  stats: PlayerStats
  subjectLevels: Record<SubjectId, SubjectProgress>
  badges: BadgeId[]
  unlocks: string[]
  equipment: Equipment
  inventory: ItemInstanceId[]
  lootStats: LootStats
  createdAt: number
  lastActiveAt: number
  /** Theme sprite key for the character portrait. Default = 'character-base'. */
  characterSpriteKey?: string
}

// ─── Sessions / attempts ─────────────────────────────────────────────────────

export interface Attempt {
  id: string
  questionId: QuestionId
  ts: number
  picked: string
  correct: boolean
  msTaken: number
  mode: 'daily' | 'boss-mini' | 'boss-annual'
}

export interface SrsCard {
  questionId: QuestionId
  ease: number
  interval: number // days
  dueAt: number    // ms epoch
  lapses: number
}

export interface ReadSession {
  id: string
  startTs: number
  endTs: number | null
  focusedMs: number
  subject?: SubjectId
  idlePauses: number
}

export interface BossRun {
  id: string
  mode: 'mini' | 'annual'
  subject?: SubjectId
  year?: number
  startTs: number
  endTs: number | null
  totalQ: number
  correctQ: number
  passed: boolean
}

// ─── Stat schema (theme/content can override default 4 stats) ─────────────────

export interface StatSchema {
  /** Stat ids in display order. */
  order: string[]
  /** Display labels (i18n-able). */
  labels: Record<string, string>
  /** Color tokens keyed by stat id; resolved via theme CSS vars. */
  colors: Record<string, string>
}

export const DEFAULT_STAT_SCHEMA: StatSchema = {
  order: ['knowledge', 'reflex', 'memory', 'stamina'],
  labels: {
    knowledge: '知識力',
    reflex: '反應',
    memory: '記憶',
    stamina: '耐力',
  },
  colors: {
    knowledge: 'var(--accent-sky)',
    reflex: 'var(--accent-rose)',
    memory: 'var(--accent-gold)',
    stamina: 'var(--accent-leaf)',
  },
}

// ─── Content pack contract ───────────────────────────────────────────────────

export interface ContentPackMeta {
  id: string                                   // e.g. "medexam-tw"
  displayName: string                          // "台灣一階醫師國考"
  locale: string                               // "zh-TW"
  examMeta?: Record<string, unknown>           // exam-specific (years, sessions, etc.)
  credits: { name: string; url?: string; license: string }[]
  /** Optional: override the default 4-stat schema. */
  statSchema?: StatSchema
  /** Optional: customize loot trigger thresholds. */
  lootTriggers?: {
    readMinutesPerRoll?: number
    quizQuestionsPerRoll?: number
    quizPerfectBonusRoll?: number
    bossMinirolls?: number
    bossAnnualRolls?: number
  }
}

export interface ContentPack {
  meta: ContentPackMeta
  subjects: Subject[]
  questions: Question[]
}

// ─── Theme pack contract ─────────────────────────────────────────────────────

export interface FontDef {
  family: string
  url?: string       // webfont URL if external
  fallback: string   // CSS font-family fallback string
}

export interface ThemePackMeta {
  id: string
  displayName: string
  style: 'pixel' | 'modern' | 'manga' | 'custom'
}

export interface ThemePack {
  meta: ThemePackMeta
  designMd: string                               // full DESIGN.md content (string)
  cssVars: Record<string, string>                // --bg-cream, --frame-wood-light, ...
  fonts: FontDef[]
  sprites: Record<string, string>                // sprite key → URL or data URI
  itemCatalog: Item[]                            // theme-specific item catalog (e.g. 醫學主題)
  uiOverrides?: Record<string, unknown>          // optional component overrides
}

// ─── Engine config (resolved at runtime) ─────────────────────────────────────

export interface EngineConfig {
  content: ContentPack
  theme: ThemePack
  statSchema: StatSchema
}
