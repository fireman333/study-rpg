import Dexie, { type EntityTable, type Table } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import type {
  DmnActiveBuffRow,
  DmnCardRow,
  DmnEventKind,
  DmnEventLogRow,
  OwnedEquipmentRow,
} from '@study-rpg/content-neurons-tw'

/**
 * Backpack stock row for a consumable kind (add-neurons-acceleration-system).
 * One row per `DmnEventKind`; `count` is the unspent stock. LWW on `updatedAt`
 * for cross-device sync. Activation moves stock → an active-buff row.
 */
export interface InventoryRow {
  kind: DmnEventKind
  count: number
  updatedAt: number
}

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
  /**
   * Vestigial after Collection 2.0 (AP no longer unlocks slots). Kept for
   * schema continuity; reset to [] on the v10 upgrade.
   */
  unlockedSlots: number[]
  sameDayCorrect: number
  /**
   * Monotonic per-family gacha pull count — the P0 soft-pity clock
   * (Collection 2.0). Non-indexed additive field. Synced MAX-merge.
   */
  pullCount: number
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

export type VariantRarity = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

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
  /** Variant index 0–5 (Collection 2.0): 0 = P0 apex, 1–5 = legacy sprites. */
  slotIndex: number
  rarity: VariantRarity
  displayName: string
  spriteKey: string
  rolledAt: number
  /**
   * Repurposed for Collection 2.0: `true` iff a P0 obtained via the soft-pity
   * ramp (drives the dex `保底` chip). `false` for everything else.
   */
  wasPityFloor: boolean
  /**
   * Duplicate count (Collection 2.0). Always written by the pull (≥ 1; increments
   * on a dupe pull). Optional in the type for back-compat with rows from external
   * bundles that predate the field — read sites default to 1 (`copies ?? 1`).
   * Non-indexed additive field. Synced via MAX-merge (Phase 3 fusion consumes it).
   */
  copies?: number
  /**
   * Optional study-context provenance (add-neurons-variant-provenance). Absent
   * on pre-upgrade rows → rendered as a 元老 / 傳承 individual (no backfill
   * write). Non-indexed additive field.
   */
  provenance?: NeuronVariantProvenance
}

/**
 * One INDIVIDUAL neuron (Dexie v13+, add-neurons-dupe-fusion). Every pull (new OR
 * dupe) mints one of these — the Pikmin-Bloom "each copy is its own creature" layer.
 * `neuronVariants` stays the slot-ownership index (one row per slot, `copies` =
 * monotonic lifetime-mint count for MAX-merge sync); the CURRENT owned count is
 * derived from these rows (`consumedAt == null`).
 *
 * `instanceId` is a DEVICE-STABLE string (NOT a Dexie `++id` — auto-increment
 * collides across devices under R2 sync). Immutable after mint. Sync: union by
 * `instanceId`; `consumedAt` resolves monotonic-OR (a tier-promote soft-deletes
 * by setting `consumedAt`, never hard-deletes — mirrors `everWrong` / `dmnEventLog`
 * discipline so a consumed individual never resurrects cross-device).
 * Per neuron-variant-fusion spec.
 */
export interface NeuronInstanceRow {
  instanceId: string
  familyId: string
  slotIndex: number
  rarity: VariantRarity
  spriteKey: string
  /** This individual's own birth instant (drives its brainwave-band context-art). */
  rolledAt: number
  /** This individual's own birth context (decor field軸B); absent → 元老 / 傳承. */
  provenance?: NeuronVariantProvenance
  /** null = held; epoch ms once consumed by a tier-promote (soft-delete, monotonic). */
  consumedAt: number | null
}

/**
 * Per-instance custom nickname (Dexie v14 — add-neurons-instance-rename).
 * Keyed by the device-stable `instanceId`. `nickname` = the player's custom name;
 * empty string = explicitly cleared (falls back to persona display). Sync = per-row
 * LWW on `updatedAt` (mirrors questionFlags; NOT monotonic — a nickname is mutable
 * + clearable). Clearing writes '' + a fresh `updatedAt` rather than deleting the
 * row, so the clear propagates cross-device under LWW.
 */
export interface InstanceNicknameRow {
  instanceId: string
  nickname: string
  updatedAt: number
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
  // ─── SRS schedule (Dexie v15+, add-neurons-quiz-mode-chips-and-srs) ─────────
  // Optional: rows written before v15 — and v15-backfilled `correct` rows — may
  // lack these. The scheduler treats absent/null as fresh (interval 0, not due).
  // `nextDueAt` is the only indexed SRS field (powers the due-queue scan); a
  // null/undefined nextDueAt is simply absent from the index, so the 錯題 query
  // naturally returns only scheduled-and-due rows.
  interval?: number
  easeFactor?: number
  nextDueAt?: number | null
  attempts?: number
  correctCount?: number
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
  // ─── Neuron individuals (Dexie v13+) ────────────────────────────────────
  // Per add-neurons-dupe-fusion. Additive — 1 new table; existing tables (incl.
  // neuronVariants PK) untouched. Each row = one individual neuron (Pikmin-Bloom
  // style). consumedAt = soft-delete set by tier-promote (monotonic-OR sync).
  neuronInstances!: EntityTable<NeuronInstanceRow, 'instanceId'>
  // ─── Instance nicknames (Dexie v14+) ────────────────────────────────────
  // Per add-neurons-instance-rename. Additive — 1 new table; existing tables
  // untouched. Per-instance custom name; LWW-on-updatedAt sync.
  instanceNicknames!: EntityTable<InstanceNicknameRow, 'instanceId'>
  // add-neurons-acceleration-system (v16)
  inventory!: EntityTable<InventoryRow, 'kind'>
  equipment!: EntityTable<OwnedEquipmentRow, 'equipmentId'>

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
    // Per rework-neurons-collection-gacha (Collection 2.0 Phase 2). Schema indices
    // are IDENTICAL to v9 (the new `copies` + `pullCount` fields are non-indexed,
    // and the neuronVariants PK [familyId+slotIndex] is RETAINED — Dexie cannot
    // change a PK in an upgrade; dexie_pk_change_pitfall). The v10 work is the
    // FULL RESET upgrade callback below.
    this.version(10)
      .stores({
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
      .upgrade(async (tx) => {
        // FULL RESET — collection only. The variant schema/semantics changed
        // (slot range 0–5, fixed rarity, copies); wipe the collection + gacha
        // state. PRESERVE study progress: AP / synapses / mastery / question
        // history / bookmarks / achievements / totalStudyMinutes. No grandfather,
        // no migration banner (per rework-neurons-collection-gacha design D8).
        await tx.table('neuronVariants').clear()
        await tx
          .table('familyAccrual')
          .toCollection()
          .modify((row: FamilyAccrualRow) => {
            row.unlockedSlots = []
            row.pullCount = 0
          })
        await tx.table('meta').put({ key: 'neuralEnergyEarned', value: '0' })
        await tx.table('meta').put({ key: 'neuralEnergySpent', value: '0' })
      })
    // Per rework-neurons-variant-pyramid. Schema indices IDENTICAL to v10 (the
    // pyramid is data-only: slotIndex widens 0..5 → 0..N-1 but the PK
    // [familyId+slotIndex] is RETAINED — Dexie cannot change a PK in an upgrade;
    // dexie_pk_change_pitfall). The v11 work is the SECOND full reset of the
    // collection: the variant slot model changed (variable variants per tier,
    // explicit rarity), so wipe the collection + reset P0 pity. Unlike v10 this
    // upgrade PRESERVES the neural-energy balance (study-earned, not collection
    // state) — only neuronVariants + familyAccrual pullCount/unlockedSlots reset.
    this.version(11)
      .stores({
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
      .upgrade(async (tx) => {
        // FULL RESET — collection only (pyramid slot-model change). Wipe the
        // collection + reset P0 pity. PRESERVE everything else INCLUDING the
        // neural-energy balance (study-earned progress): AP / synapses / mastery /
        // question history / bookmarks / achievements / totalStudyMinutes /
        // neuralEnergyEarned / neuralEnergySpent. No grandfather, no banner.
        await tx.table('neuronVariants').clear()
        await tx
          .table('familyAccrual')
          .toCollection()
          .modify((row: FamilyAccrualRow) => {
            row.unlockedSlots = []
            row.pullCount = 0
          })
      })
    // Per rework-neurons-open-collection. Schema indices IDENTICAL to v11 (no
    // row-shape change — the open-collection rework is completion-logic + view +
    // achievement/leaderboard reframe). The v12 work is the THIRD full reset of
    // the collection: an owner-chosen clean slate (NOT a row-shape necessity;
    // design D5). Same preserve discipline as v11 — wipe neuronVariants + reset
    // P0 pity, PRESERVE neural-energy balance + all study progress.
    this.version(12)
      .stores({
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
      .upgrade(async (tx) => {
        // THIRD full reset — collection only (open-collection clean slate).
        // PRESERVE everything else INCLUDING the neural-energy balance: AP /
        // synapses / mastery / question history / bookmarks / achievements /
        // totalStudyMinutes / neuralEnergyEarned / neuralEnergySpent. No
        // grandfather, no migration banner.
        await tx.table('neuronVariants').clear()
        await tx
          .table('familyAccrual')
          .toCollection()
          .modify((row: FamilyAccrualRow) => {
            row.unlockedSlots = []
            row.pullCount = 0
          })
      })
    // Per add-neurons-dupe-fusion. Additive: 1 new table `neuronInstances` (the
    // individual layer). Existing stores' index strings IDENTICAL to v12 (NO PK
    // change — dexie_pk_change_pitfall). The v13 work is the upgrade callback that
    // EXPANDS each owned slot's `copies` into individual rows (no collection reset,
    // no energy reset, no banner).
    this.version(13)
      .stores({
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
        // Individual layer. PK = device-stable instanceId; secondary indices on
        // familyId / slotIndex / rarity (collection + promote queries) + consumedAt
        // (held-vs-consumed filter). everWrong-style soft-delete on consumedAt.
        neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt',
      })
      .upgrade(async (tx) => {
        // EXPAND existing copies → individuals. For each neuronVariants row with
        // copies=N, mint N instances: the first inherits the row's provenance +
        // rolledAt; the rest are 元老 (provenance undefined). Deterministic ids
        // (NO random) so two devices migrating the same collection converge under
        // union sync. Additive — no collection reset, no energy reset, no banner.
        const variants = (await tx.table('neuronVariants').toArray()) as NeuronVariantRow[]
        const instances: NeuronInstanceRow[] = []
        for (const v of variants) {
          const n = Math.max(1, v.copies ?? 1)
          for (let i = 0; i < n; i++) {
            instances.push({
              instanceId: `${v.familyId}:${v.slotIndex}:${v.rolledAt}:m${i}`,
              familyId: v.familyId,
              slotIndex: v.slotIndex,
              rarity: v.rarity,
              spriteKey: v.spriteKey,
              rolledAt: v.rolledAt,
              provenance: i === 0 ? v.provenance : undefined,
              consumedAt: null,
            })
          }
        }
        if (instances.length > 0) await tx.table('neuronInstances').bulkAdd(instances)
      })
    // Per add-neurons-instance-rename. Additive: 1 new table `instanceNicknames`
    // (per-instance custom nicknames). All existing store index strings IDENTICAL
    // to v13 (NO PK change — dexie_pk_change_pitfall). No data migration (new empty
    // table), no collection/energy reset, no banner.
    this.version(14).stores({
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
      neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt',
      instanceNicknames: 'instanceId, updatedAt',
    })
    // Per add-neurons-quiz-mode-chips-and-srs. Additive: questionHistory gains
    // SRS schedule fields (interval / easeFactor / nextDueAt / attempts /
    // correctCount) + a `nextDueAt` secondary index for the 錯題 due-queue scan.
    // NO PK change (dexie_pk_change_pitfall). The upgrade callback backfills
    // currently-wrong rows (lastResult==='wrong', not yet scheduled) as
    // immediately-due so the 錯題 review chip has content the moment a player
    // upgrades; `correct` rows are left unscheduled (nextDueAt absent).
    this.version(15)
      .stores({
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
        questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt, nextDueAt',
        neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt',
        instanceNicknames: 'instanceId, updatedAt',
      })
      .upgrade(async (tx) => {
        // Backfill: seed currently-wrong rows as immediately-due. Literals mirror
        // @study-rpg/core STANDARD_INITIAL_INTERVALS[0] (3) + DEFAULT_EASE (2.5);
        // kept inline so the upgrade callback stays self-contained.
        const now = Date.now()
        await tx
          .table('questionHistory')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.lastResult === 'wrong' && row.nextDueAt == null) {
              row.interval = 3
              row.easeFactor = 2.5
              row.nextDueAt = now
              if (typeof row.attempts !== 'number') row.attempts = 1
              if (typeof row.correctCount !== 'number') row.correctCount = 0
            }
          })
      })
    // add-neurons-acceleration-system. Additive: 2 new tables (inventory backpack
    // stock + owned equipment). NO PK change (dexie_pk_change_pitfall); no upgrade
    // callback (new empty tables, no backfill — grandfather from v16 onward).
    this.version(16).stores({
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
      questionHistory: 'questionId, family, lastResult, lastAnsweredAt, updatedAt, nextDueAt',
      neuronInstances: 'instanceId, familyId, slotIndex, rarity, consumedAt',
      instanceNicknames: 'instanceId, updatedAt',
      inventory: 'kind, updatedAt',
      equipment: 'equipmentId, rarity, obtainedAt, updatedAt',
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
          pullCount: 0,
        })),
      )
      const existingMeta = await db.meta.get('lastResetDate')
      if (!existingMeta) {
        await db.meta.put({ key: 'lastResetDate', value: today })
      }
    }
  })
}
