import Dexie, { type EntityTable, type Table } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import type {
  DmnActiveBuffRow,
  DmnCardRow,
  DmnEventLogRow,
} from '@study-rpg/content-neurons-tw'

export type SynapseState = 'dormant' | 'weak' | 'strong'

export interface SynapseRow {
  pairKey: string
  state: SynapseState
  lastCoFireDate: string
  createdAt: string
}

export interface FamilyAccrualRow {
  familyId: string
  ap: number
  firedToday: boolean
  lastFireDate: string | null
  unlockedSlots: number[]
  sameDayCorrect: number
}

export interface MetaRow {
  key: string
  value: string
}

/**
 * `meta` key for the homepage first-visit onboarding dismissal flag. Single
 * source of truth so the onboarding component + the debug-reset path agree.
 * Value `'true'` = dismissed (never re-show). (revamp-neurons-homepage-experience)
 */
export const HOMEPAGE_ONBOARDING_DISMISSED_KEY = 'homepageOnboardingDismissed'

export interface FamilyMasteryRow {
  familyId: string
  correct: number
  total: number
}

export type VariantRarity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

/**
 * Study-context captured at the moment a variant is minted (the Pikmin Bloom
 * "birth context"). Display-only — read solely by the dex-card caption renderer
 * in add-neurons-variant-provenance; stored as discrete fields so a later
 * study-context→rarity capability can consume them without re-plumbing signals.
 * Immutable after mint.
 */
export interface NeuronVariantProvenance {
  /** Local-date string at mint (`'2026-06-01'`); the caption's birth date. */
  bornAtISO: string
  /** Family AP at unlock (equals the slot threshold; stored for forward-compat). */
  apAtUnlock: number
  /** Triggering correct answer's question had `everWrong === true` before the answer. */
  wasRedemption: boolean
  /** Player's daily correct-streak value at mint (≥ MILESTONE_STREAK_THRESHOLD → 里程碑). */
  streakAtMint: number
}

export interface NeuronVariantRow {
  familyId: string
  slotIndex: number
  rarity: VariantRarity
  displayName: string
  spriteKey: string
  rolledAt: number
  wasPityFloor: boolean
  /**
   * Optional study-context provenance (add-neurons-variant-provenance). Absent
   * on pre-upgrade rows → rendered as a 元老 / 傳承 individual (no backfill
   * write). Non-indexed additive field — NO Dexie `.version()` bump (design D2).
   */
  provenance?: NeuronVariantProvenance
}

export interface LeaderboardProfileRow {
  user_id: string
  nickname: string
  nickname_lower: string
  opted_in: boolean
  is_public: boolean
  dismissed_at: number | null
  last_pushed_at: number | null
  /** Titles unlocked via achievement rewards (added in Dexie v5; optional for back-compat). */
  unlockedTitles?: string[]
  /** Currently displayed title (must be in unlockedTitles); null = no title shown. */
  selectedTitle?: string | null
}

/** Achievement persistence row (Dexie v5+). PK = catalog `id`. */
export interface AchievementRow {
  id: string
  unlockedAt: number
  notificationShown: boolean
}

/**
 * Per-question bookmark row (Dexie v7+). PK = questionId — at most one
 * row per question per user. `addedAt` is set once on first add; `updatedAt`
 * updates on every write (used for R2 LWW sync).
 *
 * Per add-neurons-question-bookmarks spec.
 */
export interface QuestionBookmarkRow {
  questionId: string
  family: string
  addedAt: number
  updatedAt: number
}

/**
 * Tombstone row for a removed bookmark (Dexie v7+). Carries cross-device
 * delete propagation through the R2 LWW pipeline — a tombstone with
 * `updatedAt > local bookmark updatedAt` triggers delete on apply.
 */
export interface QuestionBookmarkTombstoneRow {
  questionId: string
  updatedAt: number
}

/**
 * Per-question binary modifier flags (Dexie v8+). Two flags coexist on one
 * row — easyMarked (「✨ 太簡單」) and guessedMarked (「🤔 我亂猜的」).
 *
 * Both can be true simultaneously. Row is created lazily on first flag set;
 * deletion is not supported (both flags → false keeps the row alive for
 * cross-device LWW convergence). Per add-neurons-srs-binary-modifiers spec.
 *
 * Future `add-neurons-srs-pipeline` will consume these as SRS scheduling
 * inputs (easy → longer interval, guessed → shorter / re-queue).
 */
export interface QuestionFlagRow {
  questionId: string
  easyMarked: boolean
  guessedMarked: boolean
  updatedAt: number
}

/**
 * Per-question answer-result history (Dexie v9+). One row per answered
 * question. `lastResult` is LWW (the most recent attempt); `everWrong` is a
 * monotonic-OR flag — once the player answers wrong it stays `true` forever,
 * even after a later correct answer. Backs the 「目前未答對」(`lastResult==='wrong'`)
 * + 「歷史曾錯」(`everWrong===true`) sub-tabs on `/bookmarks`.
 *
 * Per add-neurons-wrong-questions-subtab spec. Sync: the questionHistory
 * adapter resolves `everWrong` via monotonic-OR (NOT LWW) — see
 * lib/sync/tables.ts. `everWrong` is intentionally NOT a Dexie index (IndexedDB
 * cannot index booleans); the two sub-tabs filter in JS off a full `toArray()`.
 */
export interface QuestionHistoryRow {
  questionId: string
  family: string
  lastResult: 'correct' | 'wrong'
  everWrong: boolean
  lastAnsweredAt: number
  updatedAt: number
}

export class NeuronsDB extends Dexie {
  synapses!: EntityTable<SynapseRow, 'pairKey'>
  familyAccrual!: EntityTable<FamilyAccrualRow, 'familyId'>
  meta!: EntityTable<MetaRow, 'key'>
  familyMastery!: EntityTable<FamilyMasteryRow, 'familyId'>
  neuronVariants!: Table<NeuronVariantRow, [string, number]>
  leaderboardProfile!: EntityTable<LeaderboardProfileRow, 'user_id'>
  achievements!: EntityTable<AchievementRow, 'id'>
  // ─── DMN fate-card tables (Dexie v6+) ──────────────────────────────────
  // Per add-neurons-dmn-fate-card spec. All additive — no PK change to existing
  // tables (per dexie_pk_change_pitfall.md discipline).
  dmnCards!: EntityTable<DmnCardRow, 'cardId'>
  dmnEventLog!: EntityTable<DmnEventLogRow, 'cardId'>
  dmnActiveBuffs!: Table<DmnActiveBuffRow, number>
  // ─── Question bookmarks (Dexie v7+) ─────────────────────────────────────
  // Per add-neurons-question-bookmarks. Additive — 2 new tables, existing
  // tables untouched. Tombstones table carries cross-device delete propagation.
  questionBookmarks!: EntityTable<QuestionBookmarkRow, 'questionId'>
  questionBookmarkTombstones!: EntityTable<QuestionBookmarkTombstoneRow, 'questionId'>
  // ─── Question flags (Dexie v8+) ─────────────────────────────────────────
  // Per add-neurons-srs-binary-modifiers. Additive — single composite row
  // per question carries both easyMarked + guessedMarked flags.
  questionFlags!: EntityTable<QuestionFlagRow, 'questionId'>
  // ─── Question answer-result history (Dexie v9+) ─────────────────────────
  // Per add-neurons-wrong-questions-subtab. Additive — 1 new table. Backs the
  // 錯題 sub-tabs (目前未答對 / 歷史曾錯). everWrong = monotonic-OR (sync adapter).
  questionHistory!: EntityTable<QuestionHistoryRow, 'questionId'>

  constructor() {
    super('neurons-rpg')
    this.version(1).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
    })
    this.version(2).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
    })
    this.version(3).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      // Composite PK [familyId+slotIndex] enforces lifetime uniqueness per
      // (family, slot). Secondary indices on familyId + rolledAt for queries.
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
    })
    this.version(4).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      // Per-user leaderboard profile (opt-in state + nickname + push tracking).
      // Single-row table in practice — keyed by Supabase auth user_id.
      leaderboardProfile: 'user_id, nickname_lower',
    })
    this.version(5).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      leaderboardProfile: 'user_id, nickname_lower',
      // Achievement unlock log. PK = catalog id; secondary index on unlockedAt
      // for chronological queries on `/achievements` page. Per spec
      // openspec/specs/neurons-achievements/spec.md "Dexie v5" requirement.
      achievements: 'id, unlockedAt',
    })
    // Per add-neurons-dmn-fate-card. Additive: 3 new tables, existing tables
    // unchanged. New `meta` keys (dmnDrawsAvailable / dmnTimeAxisMinutesAccrued
    // / etc.) reuse the existing `meta` table — no schema entry needed.
    this.version(6).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      leaderboardProfile: 'user_id, nickname_lower',
      achievements: 'id, unlockedAt',
      // DMN card persistence. PK = cardId (closed-cap catalog of 20 entries);
      // secondary indices on obtainedAt + rarity for collection page queries.
      dmnCards: 'cardId, obtainedAt, rarity',
      // Idempotency log. PK = cardId — one row per dispatched card. Sync uses
      // monotonic-union merge (see r2/tables.ts adapter).
      dmnEventLog: 'cardId, dispatchedAt',
      // Runtime buff rows (family-buff / variant-rate-up). Auto-inc PK; secondary
      // indices on expiresAt for cleanup queries + buffKind for type filter.
      dmnActiveBuffs: '++id, expiresAt, buffKind',
    })
    // Per add-neurons-question-bookmarks. Additive: 2 new tables.
    // questionBookmarks: PK = questionId (one row per bookmarked question);
    //   secondary indices on family (filter queries) + addedAt (chronological)
    //   + updatedAt (LWW sync).
    // questionBookmarkTombstones: PK = questionId; indexed on updatedAt.
    this.version(7).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      leaderboardProfile: 'user_id, nickname_lower',
      achievements: 'id, unlockedAt',
      dmnCards: 'cardId, obtainedAt, rarity',
      dmnEventLog: 'cardId, dispatchedAt',
      dmnActiveBuffs: '++id, expiresAt, buffKind',
      questionBookmarks: 'questionId, family, addedAt, updatedAt',
      questionBookmarkTombstones: 'questionId, updatedAt',
    })
    // Per add-neurons-srs-binary-modifiers. Additive: 1 new table.
    // questionFlags: PK = questionId (one row per question); secondary
    //   indices on easyMarked / guessedMarked for filter queries +
    //   updatedAt for LWW sync.
    this.version(8).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      leaderboardProfile: 'user_id, nickname_lower',
      achievements: 'id, unlockedAt',
      dmnCards: 'cardId, obtainedAt, rarity',
      dmnEventLog: 'cardId, dispatchedAt',
      dmnActiveBuffs: '++id, expiresAt, buffKind',
      questionBookmarks: 'questionId, family, addedAt, updatedAt',
      questionBookmarkTombstones: 'questionId, updatedAt',
      questionFlags: 'questionId, easyMarked, guessedMarked, updatedAt',
    })
    // Per add-neurons-wrong-questions-subtab. Additive: 1 new table.
    // questionHistory: PK = questionId; secondary indices on family + lastResult
    //   (filter queries) + lastAnsweredAt (sort) + updatedAt (LWW sync).
    //   everWrong is NOT indexed — IndexedDB cannot index booleans; the
    //   歷史曾錯 sub-tab filters everWrong in JS off a full toArray().
    this.version(9).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      leaderboardProfile: 'user_id, nickname_lower',
      achievements: 'id, unlockedAt',
      dmnCards: 'cardId, obtainedAt, rarity',
      dmnEventLog: 'cardId, dispatchedAt',
      dmnActiveBuffs: '++id, expiresAt, buffKind',
      questionBookmarks: 'questionId, family, addedAt, updatedAt',
      questionBookmarkTombstones: 'questionId, updatedAt',
      questionFlags: 'questionId, easyMarked, guessedMarked, updatedAt',
      questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt',
    })
  }
}

export const db = new NeuronsDB()

export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

export async function initFamilyAccrualIfEmpty(pack: ContentPack): Promise<void> {
  // Wrap count + bulkAdd in a Dexie tx so StrictMode double-mount race doesn't
  // produce ConstraintError (both effects see count=0 before either bulkAdds).
  await db.transaction('rw', db.familyAccrual, db.meta, async () => {
    const existingCount = await db.familyAccrual.count()
    if (existingCount === 0) {
      const today = todayISO()
      await db.familyAccrual.bulkAdd(
        pack.subjects.map((subject) => ({
          familyId: subject.id,
          ap: 0,
          firedToday: false,
          lastFireDate: null,
          unlockedSlots: [],
          sameDayCorrect: 0,
        })),
      )
      const existingMeta = await db.meta.get('lastResetDate')
      if (!existingMeta) {
        await db.meta.put({ key: 'lastResetDate', value: today })
      }
    }
  })
}
