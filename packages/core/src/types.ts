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

export type EquipSlot =
  | 'head'
  | 'body'
  | 'weapon'
  | 'charm'
  | 'consumable'
  | 'cosmetic-head'
  | 'cosmetic-body'
  | 'cosmetic-accessory'
  | 'cosmetic-held'
  | 'cosmetic-background'

export type CosmeticCategory = 'head' | 'body' | 'accessory' | 'held' | 'background'
export type CosmeticSlot =
  | 'cosmetic-head'
  | 'cosmetic-body'
  | 'cosmetic-accessory'
  | 'cosmetic-held'
  | 'cosmetic-background'

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
  answer: string                  // key into options, e.g. "C"; for disputed questions this is a placeholder — see `disputed`
  explanation: string             // markdown allowed
  hasImage?: boolean
  imagePath?: string | null       // relative path under app's /public; prepend BASE_URL at render
  hasOptionImages?: boolean       // at least one option is an un-renderable image; host apps filter from quiz pools
  disputed?: boolean              // exam authority sent the question back (送分題) — any selection counts as correct; `answer` is a placeholder
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
  /** Pure visual cosmetic — MUST have effects: []. Excluded from gacha loot pool. See cosmetic-system spec. */
  isCosmetic?: boolean
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
  source: 'read' | 'quiz' | 'boss-mini' | 'boss-annual' | 'mock'
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
  /** Cosmetic slots (M5 cosmetic-and-dorm). Independent of functional slots — equip both simultaneously. */
  'cosmetic-head'?: ItemInstanceId
  'cosmetic-body'?: ItemInstanceId
  'cosmetic-accessory'?: ItemInstanceId
  'cosmetic-held'?: ItemInstanceId
  'cosmetic-background'?: ItemInstanceId
}

/** Cosmetic catalog entry — pure milestone-unlocked visual item. */
export interface Cosmetic {
  id: ItemId
  name: string
  category: CosmeticCategory
  /** Pure predicate against current Player state. Returns true if player has met the unlock threshold. */
  unlockCondition: (player: Player) => boolean
  /** Human-readable description shown in locked picker tile (e.g. "達 level 5 解鎖"). */
  unlockDescription: string
  /** Sprite key into ThemePack.sprites. Convention: `cosmetic-<category>-<id>`. */
  artKey: string
  /** Rarity tier for display only (doesn't affect drop rate; cosmetics aren't rolled). */
  rarity?: Rarity
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
  /** ISO YYYY-MM-DD in UTC+8. Undefined when the player has never met the check-in threshold. */
  lastCheckInDate?: string
  /** Consecutive UTC+8 days (counting today) where the check-in threshold was met. */
  currentStreak: number
  /** Highest currentStreak ever observed for this player. */
  longestStreak: number
  /** Per-day partial-progress counters used to decide threshold crossing. Resets on UTC+8 day roll-over. */
  todayProgress?: {
    /** UTC+8 date the counters belong to. */
    date: string
    /** Number of focused reading-minute ticks accumulated today. */
    readingMinutes: number
    /** Number of questions answered today (any mode, any correctness). */
    questionsAnswered: number
  }
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

// ─── Mock exam (full historical paper) ──────────────────────────────────────

/** Per-question record inside a MockAttempt. `userSelection: null` = unanswered. */
export interface MockPerQuestionAnswer {
  questionId: QuestionId
  userSelection: string | null
  isCorrect: boolean
}

/** A completed mock-exam submission, persisted to Dexie for result rendering + progress curve. */
export interface MockAttempt {
  id: string                                // UUID v4, generated at submit
  paperId: string                           // "<year>-<session>-<paper>" e.g. "114-1-medexam-1"
  startedAt: number                         // epoch ms
  finishedAt: number                        // epoch ms
  elapsedSec: number                        // net active seconds (paused intervals excluded)
  totalScore: number                        // count of correct answers
  perQuestionAnswers: MockPerQuestionAnswer[]
}

/** Volatile state of a mock currently in progress; persisted as a Dexie singleton. */
export interface MockInProgress {
  paperId: string
  startedAt: number
  currentQuestionIndex: number              // 0-based
  selections: Record<QuestionId, string>    // missing keys = unanswered
  elapsedSecAtPause: number                 // seconds accumulated up to last freeze
  lastResumedAt: number | null              // epoch ms; null = currently paused
}

// ─── Mentor daily question (M5) ─────────────────────────────────────────────

/**
 * Singleton state for mentor-daily backlog. One row in Dexie keyed by 'mentorBacklog'.
 * Spec: openspec/specs/persistence/spec.md (Mentor backlog singleton)
 *       openspec/specs/mentor-daily/spec.md
 */
export interface MentorBacklog {
  questionIds: string[]              // FIFO queue of pending Question.id, max 5
  lastAssignedDate: string           // ISO YYYY-MM-DD in UTC+8
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

export interface SlotPosition {
  room: 'ward' | 'outpatient' | 'surgery'
  x: number  // 0–768 (scene PNG width)
  y: number  // 0–384 (scene PNG height)
}

export interface ThemePack {
  meta: ThemePackMeta
  designMd: string                               // full DESIGN.md content (string)
  cssVars: Record<string, string>                // --bg-cream, --frame-wood-light, ...
  fonts: FontDef[]
  sprites: Record<string, string>                // sprite key → URL or data URI
  itemCatalog: Item[]                            // theme-specific item catalog (e.g. 醫學主題)
  /** Optional skill tree content (4 branches × 9 nodes). Engine falls back when missing. */
  skillTree?: import('./lib/skillTree').SkillTreeContent
  uiOverrides?: Record<string, unknown>          // optional component overrides
  /**
   * Optional hospital-mode scene assets. tier1-3 are required when the field is
   * present; tier4 (國家級教學醫院) is opt-in for theme packs that ship the 4th-tier
   * art. Added 2026-05-17 via `expand-doctor-roster-dei-and-tier4-scene` change.
   */
  scenes?: {
    tier1: string
    tier2: string
    tier3: string
    tier4?: string
  }
  /** Optional hospital-mode doctor slot positions per tier (2 / 5 / 8 / 10+ slots). */
  doctorSlotPositions?: {
    tier1: SlotPosition[]
    tier2: SlotPosition[]
    tier3: SlotPosition[]
    tier4?: SlotPosition[]
  }
}

// ─── Engine config (resolved at runtime) ─────────────────────────────────────

export interface EngineConfig {
  content: ContentPack
  theme: ThemePack
  statSchema: StatSchema
}
