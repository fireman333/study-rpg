import Dexie, { type EntityTable } from 'dexie'
import { initialGachaStats, type GachaStats, type OwnedEquipmentRow } from '@study-rpg/core'
import {
  RECRUITMENT_PITY_RULES,
  RECRUITMENT_WEIGHTS,
  INITIAL_TICKETS,
  TICKET_CAP,
  MS_PER_DAY,
  TIER_ROOMS,
  RARITY_POWER_MULTIPLIER,
  type HospitalTier,
  type Rarity,
  type Room,
} from '@study-rpg/content-medexam2-tw'

const RECRUITMENT_GACHA_CONFIG = {
  tiers: RECRUITMENT_WEIGHTS,
  pityRules: RECRUITMENT_PITY_RULES,
}

export const ALL_SUBJECT_IDS = [
  '內科', '家醫科', '小兒科', '皮膚科', '神經內科', '精神科',
  '外科', '泌尿科', '骨科', '婦產科', '復健科', '眼科', '耳鼻喉科', '麻醉科',
] as const

export interface AffinityRow {
  subjectId: string
  correctCount: number
}

export interface DoctorRow {
  id: string
  subjectId: string
  rarity: Rarity
  powerMultiplier: number
  name: string
  spriteKey: string
  obtainedAt: number
  assignedRoom: string | null
  /**
   * Consecutive training failures since last success. Reset to 0 on success or
   * voluntary retirement. Once ≥ TRAINING_PITY_THRESHOLD, the next attempt is
   * guaranteed to succeed. v6 upgrade backfills existing doctors with 0.
   */
  pityCounter: number
}

export interface GachaStatsRow {
  id: 'global'
  totalRolls: number
  rollsSinceLast: Record<string, number>
}

export interface TicketsRow {
  id: 'global'
  available: number
  lastRefreshDay: number
}

export type RoomRow = Room

export interface GameCountersRow {
  id: 'singleton'
  revenue: number
  reputation: number
  lastTickAt: number
  tier: HospitalTier
  hasUsedStarterPull: boolean
  /**
   * Timestamp when the currently-running study session began. `null` when no
   * session is active. Tick loop only accumulates progress when this is set.
   */
  currentSessionStartedAt: number | null
  /** Timestamp when the last study session ended (manual stop or auto-pause). */
  lastSessionEndedAt: number | null
  /** Tutorial / onboarding progress. All fields are flag bags (sparse maps). */
  tutorial: {
    completedSteps: Record<string, true>
    firstVisit: Record<string, true>
    firedTips: Record<string, true>
  }
  /**
   * Currently pending modal event id (e.g. 'medical-malpractice', 'vip-patient').
   * `null` when no event waiting for player resolution. Toast events resolve
   * immediately and never set this.
   *
   * Optional (added mid-change) — undefined for pre-event saves; treat as null.
   */
  pendingEventId?: string | null
  /** Wall-clock ms when pendingEventId was set; powers 醫療糾紛 24-hr auto-resolve. */
  pendingEventTriggeredAt?: number | null
  /**
   * Wall-clock ms when the last event resolved. Pre-v20 powered a 5-min
   * session-time cooldown via `EVENT_POST_RESOLUTION_COOLDOWN_MS`; v20 replaced
   * that with `lastInteractionEventAt` (wall-clock, event+ER shared). Kept for
   * audit-trail continuity but no longer drives gating.
   */
  lastEventResolvedAt?: number | null
  /**
   * Wall-clock ms when the most recent event OR ER consult resolved.
   * Powers the unified 3-min wall-clock cooldown checked by
   * `maybeRollNonReadingEvent`. Added v20 (rewire-hospital-events-to-non-
   * reading-trigger). Seeded from `lastEventResolvedAt` on v19→v20 upgrade.
   */
  lastInteractionEventAt?: number | null
  /** Wall-clock ms when VIP throughput-boost expires. `null` when not active. */
  vipBoostUntil?: number | null
  /**
   * @deprecated since v20 — tick.ts no longer rolls events on a per-tick
   * cadence; rolls are interaction-driven via `services/non-reading-event-
   * trigger.ts`. Field retained on type for cross-version Dexie load safety;
   * v20 upgrade callback deletes it from all rows.
   */
  eventRollTickCounter?: number
  /**
   * Currently-active ER consultation. `null` when no consult pending. Spec:
   * `er-consultation` capability. Mutex-checked against `pendingEventId` and
   * other active dialogs before rolling a new consult.
   */
  erConsultActive?: ERConsultActiveState | null
  /**
   * @deprecated since v20 — see `eventRollTickCounter` deprecation note.
   */
  erConsultTicksUntilRoll?: number
  /**
   * Current consecutive correct-quiz streak (resets to 0 on wrong answer).
   * LWW sync (can decrease). MAX-tracked separately in
   * `MonotonicCountersRow.maxQuizCorrectStreak`. Added v15 by
   * `add-achievement-system`.
   *
   * Optional — pre-v15 saves omit; treat undefined as 0.
   */
  currentQuizCorrectStreak?: number
}

/**
 * Active ER consultation state — set when tick roller spawns a new consult,
 * cleared on answer / skip / auto-skip / settings-toggle-off.
 */
export interface ERConsultActiveState {
  questionId: string
  subjectId: string
  triggeredAt: number
  /** Sprite key into theme pack. MVP defaults to `'er-doctor'` with fallback. */
  doctorSpriteKey: string
  /** Greeting variant index (0-4) — captured at spawn for stable display. */
  greetingIdx: number
}

/**
 * Monotonic counters split from gameCounters per design D7 / audit B3.
 * These fields must merge via MAX(local, cloud) — LWW would let a "shorter"
 * cloud value overwrite local progress after sync.
 */
export interface MonotonicCountersRow {
  id: 'singleton'
  /** Cumulative minutes spent in active study sessions. Never decreases. */
  totalStudyMinutes: number
  /** Per-tier consecutive bad-luck pity counters for fate card draws. */
  fateCardBadLuckPity: {
    common: number
    rare: number
    epic: number
  }
  /**
   * Per-25-fresh-correct ticket-grant counter (add-quiz-economy-redesign).
   * Increments by 1 per fresh-correct quiz answer; on reaching
   * QUIZ_TICKET_GRANT_PER_N_CORRECT, +1 ticket granted (clamped at TICKET_CAP)
   * and counter resets to 0. Field added in v8.
   */
  freshCorrectSinceLastTicket?: number
  // ─── v15: add-achievement-system fields (all MAX-merge LWW) ─────────────
  /** Cumulative doctors ever recruited via gacha (monotonic, MAX-merge). */
  totalDoctorsRecruited?: number
  /** Cumulative P1-tier doctors ever recruited (monotonic, MAX-merge). */
  totalP1DoctorsRecruited?: number
  /** Highest consecutive daily check-in streak ever observed (monotonic, MAX-merge). */
  maxDailyStreak?: number
  /** Total hospital tier upgrades performed (monotonic, MAX-merge). */
  tierUpgradeCount?: number
  /** Highest consecutive correct-quiz streak ever observed (monotonic, MAX-merge). */
  maxQuizCorrectStreak?: number
}

/**
 * Banner first-unlock ticket bonus log (add-quiz-economy-redesign, v8).
 * Local-only — NOT cloud-synced. One row per subject means that subject
 * already received its lifetime +1 ticket bonus on first crossing of
 * RECRUITMENT_THRESHOLDS[subjectId]; design D4 accepts up to 14×N_devices
 * over-grant across devices in exchange for schema simplicity.
 */
export interface BannerUnlockBonusLogRow {
  subjectId: string
  grantedAt: number
}

export interface TrainingHistoryRow {
  id?: number
  doctorId: string
  attemptedAt: number
  fromRarity: Rarity
  toRarity: Rarity
  cost: number
  success: boolean
  pityTriggered: boolean
}

export interface EventLogRow {
  id?: number
  triggeredAt: number
  eventKey: string
  outcome: string
  reputationDelta: number
  revenueDelta: number
}

export interface FateCardHistoryRow {
  id?: number
  drawnAt: number
  tier: 'common' | 'rare' | 'epic' | 'legendary'
  cost: number
  rewardKey: string
  wasBadLuck: boolean
  pityTriggered: boolean
}

/**
 * Retirement log — one row per AAD doctor retire event.
 *
 * pk is auto-incr `id`; `doctorId` is a unique secondary index — DO NOT change
 * pk (Dexie 4.x rejects pk changes with `UpgradeError Not yet support for
 * changing primary key`, bricking every existing user). See
 * `~/.claude/imports/dexie_pk_change_pitfall.md` for the full incident record
 * (v1 commit dac4eae was prod-reverted for exactly this reason).
 *
 * `_updatedAt` is the LWW timestamp added in Dexie v19 (additive migration).
 * Optional in TS because pre-v19 rows are backfilled by the upgrade callback
 * (set to `retiredAt`); post-v19 rows always have it populated.
 */
export interface RetirementLogRow {
  id?: number
  retiredAt: number
  doctorId: string
  subjectId: string
  rarity: Rarity
  refund: number
  /** LWW timestamp (epoch ms). Added v19. Backfilled to retiredAt for pre-v19 rows. */
  _updatedAt?: number
}

export type TargetedTicketStatus = 'pending' | 'assigned' | 'consumed'

export interface TargetedTicketRow {
  id: string
  subjectId: string | null
  minRarity: 'P2' | 'P3'
  status: TargetedTicketStatus
  obtainedAt: number
  assignedAt: number | null
  consumedAt: number | null
  resultDoctorId: string | null
  sourceFateCardTier: 'epic' | 'legendary'
  _updatedAt?: number
}

/**
 * Telemetry row for ER consultation outcomes. Local-only — NOT synced to cloud.
 * Capped at 500 rows via rolling cap (oldest deleted on insert overflow).
 * Spec: `er-consultation` capability.
 */
export interface ERConsultLogRow {
  id?: number
  triggeredAt: number
  resolvedAt: number | null
  subjectId: string
  questionId: string
  resolution: 'correct' | 'wrong' | 'skipped' | 'auto-skipped'
  /** Combined revenue + reputation delta granted (sum of both counters). 0 for skip / wrong. */
  rewardGained: number
  reactionTimeMs: number | null
}

export interface TargetedTicketHistoryRow {
  id?: number
  ticketId: string
  event: 'obtained' | 'assigned' | 'consumed'
  at: number
  subjectId?: string
  doctorId?: string
  rarity?: Rarity
  sourceFateCardTier?: 'epic' | 'legendary'
}

export interface MasteryRow {
  subjectId: string
  correct: number
  total: number
}

export interface QuestionHistoryRow {
  questionId: string
  subjectId: string
  attempts: number
  correctCount: number
  lastAnsweredAt: number
  lastResult: 'correct' | 'wrong'
  nextDueAt: number | null
  interval: number
  easeFactor: number
  // Persistent "has this question ever been answered wrong" flag.
  // Set true on first wrong answer in recordWrongAnswer; never unset.
  // Merge semantics: monotonic-OR (NOT LWW) — see r2/tables.ts applyToLocal.
  // Added in Dexie v17 (add-bookmarks-filters-and-wrong-history-medexam2).
  everWrong?: boolean
}

export interface BookmarkRow {
  questionId: string
  addedAt: number
  _updatedAt?: number
}

/**
 * Per-user local leaderboard opt-in / dismiss state. Device-local only —
 * NOT cloud-synced. Lifecycle:
 *   - First leaderboard visit, no row → opt-in modal shown
 *   - User dismisses「不再顯示」→ row written with dismissed_at = now
 *   - User opt-in submits → row written with opted_in = true + nickname
 *   - Settings toggle off (Phase 7) → opted_in stays true (cloud row flips
 *     is_public via Worker); we don't mutate this table on opt-out so the
 *     player can re-enable without re-consent
 *
 * PK = supabase auth.uid() so multi-account on same device stays isolated.
 */
export interface LeaderboardProfileRow {
  user_id: string
  /** Player's chosen nickname (case-preserved). `null` until opted in. */
  nickname: string | null
  /**
   * Consent flag — set true after the first successful `/leaderboard/upsert`.
   * Once true, never goes false (settings toggle uses `is_public` instead so
   * re-enabling doesn't force a re-consent flow per design D5).
   */
  opted_in: boolean
  /**
   * Settings-panel toggle state (true = visible on public leaderboard, false =
   * row preserved but is_public=0 server-side). Defaults to true on opt-in.
   * Optional in TS because v14 rows shipped before this field existed; treat
   * undefined as `true` at read sites (the safe default — already-consented
   * players were public).
   */
  is_public?: boolean
  /** ms timestamp of「不再顯示」dismiss; null = never dismissed. */
  dismissed_at: number | null
  /** ms timestamp of last successful upsert; null = never pushed. */
  last_pushed_at: number | null
  /**
   * Achievement title chosen for display next to nickname on leaderboard.
   * `null` = no title shown. Set via SettingsPanel selector after the player
   * unlocks at least one title-granting achievement. Added v15 by
   * `add-achievement-system`. Pre-v15 rows: undefined → treat as null.
   */
  selectedTitle?: string | null
}

/**
 * Achievement unlock row — one per unlocked achievement (PK = catalog id).
 * Synced via R2 m2 bundle only (NOT Supabase), mirror `LEADERBOARD_PROFILE`
 * precedent (commit cfaaa32). Added v15 by `add-achievement-system`.
 */
export interface AchievementRow {
  /** Catalog id (kebab-case, e.g. 'quiz-correct-500', 'subject-master-內科'). */
  id: string
  /** Epoch ms of when the player first crossed the predicate threshold. */
  unlockedAt: number
  /** True once the unlock toast / modal has been dismissed; drives unseen-badge dot. */
  notificationShown: boolean
}

/**
 * Per-day study-minute snapshot — one row per calendar day on which the
 * player accumulated active study time. Primary key is the local-timezone
 * `YYYY-MM-DD` string. Forward-only: rows start landing from Dexie v18
 * upgrade onwards; pre-v18 lifetime minutes remain only in
 * `monotonicCounters.totalStudyMinutes`. R2 m2 bundle passenger (per
 * `daily-study-log` capability spec); row-level LWW on `updatedAt`.
 */
export interface DailyStudyLogRow {
  /** Local-timezone `YYYY-MM-DD` (e.g. `2026-05-26`). */
  date: string
  /** Cumulative active-study minutes credited on this calendar day. */
  minutesAdded: number
  /** Epoch ms of last upsert; powers row-level LWW conflict resolution. */
  updatedAt: number
}

// v5 cloud-sync support tables — meta (migration choice/paused flags) +
// localBackup (snapshot before destructive sign-in resolution).
export interface HospitalMetaRow {
  key: string
  value: unknown
}

/** Snapshot of hospital state pre-destructive sign-in resolution. */
export interface HospitalLocalBackupRecord {
  key: string  // e.g. snapshot-2026-05-17T12:00:00.000Z
  takenAt: number
  userId: string
  reason: string
  // Snapshotted hospital state — all cloud-synced 二階 tables
  hospitalState: {
    gameCounters: GameCountersRow | null
    gachaStats: GachaStatsRow | null
    tickets: TicketsRow | null
    rooms: RoomRow[]
    affinity: AffinityRow[]
  }
  doctors: DoctorRow[]
  mastery: MasteryRow[]
  questionHistory: QuestionHistoryRow[]
  /** Optional — present on backups taken post-v9 (implement-targeted-fate-card-tickets). */
  targetedTickets?: TargetedTicketRow[]
  /** Optional — present on backups taken post-v9. */
  targetedTicketHistory?: TargetedTicketHistoryRow[]
  /**
   * Optional — present on backups taken post add-monotonic-counters-to-sync
   * (2026-05-19). Older snapshots (taken before this field shipped) MAY omit
   * the key; callers restoring from such snapshots SHALL fall back to a
   * default singleton row.
   */
  monotonicCounters?: MonotonicCountersRow | null
}

export class HospitalDB extends Dexie {
  affinity!: EntityTable<AffinityRow, 'subjectId'>
  doctors!: EntityTable<DoctorRow, 'id'>
  gachaStats!: EntityTable<GachaStatsRow, 'id'>
  tickets!: EntityTable<TicketsRow, 'id'>
  rooms!: EntityTable<RoomRow, 'id'>
  gameCounters!: EntityTable<GameCountersRow, 'id'>
  mastery!: EntityTable<MasteryRow, 'subjectId'>
  questionHistory!: EntityTable<QuestionHistoryRow, 'questionId'>
  meta!: EntityTable<HospitalMetaRow, 'key'>
  localBackup!: EntityTable<HospitalLocalBackupRecord, 'key'>
  monotonicCounters!: EntityTable<MonotonicCountersRow, 'id'>
  trainingHistory!: EntityTable<TrainingHistoryRow, 'id'>
  eventLog!: EntityTable<EventLogRow, 'id'>
  fateCardHistory!: EntityTable<FateCardHistoryRow, 'id'>
  retirementLog!: EntityTable<RetirementLogRow, 'id'>
  bookmarks!: EntityTable<BookmarkRow, 'questionId'>
  bannerUnlockBonusLog!: EntityTable<BannerUnlockBonusLogRow, 'subjectId'>
  targetedTickets!: EntityTable<TargetedTicketRow, 'id'>
  targetedTicketHistory!: EntityTable<TargetedTicketHistoryRow, 'id'>
  erConsultLog!: EntityTable<ERConsultLogRow, 'id'>
  leaderboardProfile!: EntityTable<LeaderboardProfileRow, 'user_id'>
  achievements!: EntityTable<AchievementRow, 'id'>
  hospitalEquipment!: EntityTable<OwnedEquipmentRow, 'equipmentId'>
  dailyStudyLog!: EntityTable<DailyStudyLogRow, 'date'>


  constructor(name = 'study-rpg-medexam2-hospital-tw') {
    super(name)
    this.version(1).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
    })
    this.version(2).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
    })
    this.version(3).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
    })
    // v4: adds mastery + questionHistory tables; gameCounters gains
    // `hasUsedStarterPull` (JS prop, not indexed). Existing dogfood saves get
    // force-flagged true in ensureSeed so the starter-pull UI never appears for them.
    this.version(4)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      })
      .upgrade(async (tx) => {
        // Backfill 14 default mastery rows for upgrading saves
        const masteryTable = tx.table<MasteryRow, string>('mastery')
        const existing = new Set((await masteryTable.toArray()).map((r) => r.subjectId))
        const missing = ALL_SUBJECT_IDS.filter((s) => !existing.has(s)).map((subjectId) => ({
          subjectId,
          correct: 0,
          total: 0,
        }))
        if (missing.length > 0) await masteryTable.bulkAdd(missing)
      })
    // v5: cloud-sync support tables — meta (migration choice/paused per-user)
    // + localBackup (snapshot before destructive sign-in resolution). Both
    // tables are additive; no upgrade hook needed.
    this.version(5).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      meta: '&key',
      localBackup: '&key, takenAt',
    })
    // v6: redesign-hospital-economy — adds monotonic counter row (MAX-merge cloud
    // sync), training / event / fate-card / retirement history tables. Upgrade
    // patches existing rows with new fields (pityCounter, facilityLevel, session
    // metadata, tutorial flags). All additive — no destructive migration.
    this.version(6)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId',
      })
      .upgrade(async (tx) => {
        // 1. Seed monotonicCounters singleton (MAX-merge row split per D7)
        const monotonicTable = tx.table<MonotonicCountersRow, 'singleton'>('monotonicCounters')
        const existing = await monotonicTable.get('singleton')
        if (!existing) {
          await monotonicTable.put({
            id: 'singleton',
            totalStudyMinutes: 0,
            fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 },
          })
        }

        // 2. Patch gameCounters singleton with new LWW-only fields (additive)
        const countersTable = tx.table<GameCountersRow, 'singleton'>('gameCounters')
        const counters = await countersTable.get('singleton')
        if (counters) {
          const c = counters as Partial<GameCountersRow> & GameCountersRow
          await countersTable.put({
            ...counters,
            currentSessionStartedAt: c.currentSessionStartedAt ?? null,
            lastSessionEndedAt: c.lastSessionEndedAt ?? null,
            tutorial: c.tutorial ?? { completedSteps: {}, firstVisit: {}, firedTips: {} },
          })
        }

        // 3. Backfill doctor.pityCounter = 0
        await tx.table<DoctorRow, string>('doctors').toCollection().modify((d) => {
          if ((d as Partial<DoctorRow>).pityCounter === undefined) d.pityCounter = 0
        })

        // 4. Backfill room.facilityLevel = 1 (roomFacility already exists at 1.0)
        await tx.table<RoomRow, string>('rooms').toCollection().modify((r) => {
          if ((r as Partial<RoomRow>).facilityLevel === undefined) r.facilityLevel = 1
        })
      })
    // v7: add-quiz-question-id-and-bookmark — additive bookmarks store.
    // No upgrade hook needed; engine attaches its _updatedAt hook automatically.
    this.version(7).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
    })

    // v8: add-quiz-economy-redesign — local-only bannerUnlockBonusLog table
    // + freshCorrectSinceLastTicket counter on monotonicCounters. Upgrade hook
    // seeds the new monotonic field to 0 for existing rows.
    this.version(8)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId',
        bookmarks: '&questionId, addedAt',
        bannerUnlockBonusLog: '&subjectId',
      })
      .upgrade(async (tx) => {
        const monotonicTable = tx.table<MonotonicCountersRow, 'singleton'>('monotonicCounters')
        const existing = await monotonicTable.get('singleton')
        if (existing && existing.freshCorrectSinceLastTicket === undefined) {
          await monotonicTable.put({ ...existing, freshCorrectSinceLastTicket: 0 })
        }
      })

    // v9: implement-targeted-fate-card-tickets — additive collection tables for
    // epic/legendary fate-card-sourced targeted recruitment tickets (subject pick
    // + rarity floor enforcement). Both tables are net-new; no row backfill needed.
    this.version(9).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
    })

    // v10: add-er-consultation-feature — local-only telemetry table for ER
    // consultation outcomes (no cloud sync per spec). gameCounters.singleton
    // gains `erConsultActive` + `erConsultTicksUntilRoll` JS props (no index).
    this.version(10).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
    })

    // v11: questionHistory gains `[lastResult+lastAnsweredAt]` compound index
    // for the 「錯題」 derived view (filter lastResult='wrong' sorted newest-first).
    this.version(11).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
    })

    // v12: fix-medexam2-doctor-room-pointer-drift — Doctor.assignedRoom becomes
    // the single source of truth for doctor↔room assignment. Room.assignedDoctorId
    // is retained in the type (cloud blob compat + export/import) but always null.
    // Upgrade hook clears any existing non-null values; store schema unchanged.
    this.version(12)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory:
          '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId',
        bookmarks: '&questionId, addedAt',
        bannerUnlockBonusLog: '&subjectId',
        targetedTickets: '&id, status, subjectId, obtainedAt',
        targetedTicketHistory: '++id, ticketId, at, event',
        erConsultLog: '++id, triggeredAt, subjectId',
      })
      .upgrade(async (tx) => {
        await tx
          .table<RoomRow, string>('rooms')
          .toCollection()
          .modify((r) => {
            if (r.assignedDoctorId !== null) r.assignedDoctorId = null
          })
      })
    // v13: add-medexam2-year-filter — marks the version that introduces the
    // `quiz.yearFilter` KV in the existing `meta` table. Stores unchanged
    // (KV row is additive); no upgrade hook needed.
    this.version(13).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
    })

    // v14: add-hospital-leaderboard — local-only leaderboardProfile table for
    // per-user opt-in / dismissed-forever / last-pushed bookkeeping (Phase
    // 5.5). Additive; no upgrade hook needed.
    this.version(14).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
      leaderboardProfile: '&user_id',
    })

    // v15: add-achievement-system — local-only achievements table for
    // unlock tracking. R2 m2 bundle passenger (per LEADERBOARD_PROFILE
    // precedent, commit cfaaa32). NOT synced to Supabase. Schema-only
    // upgrade — no row data to backfill; existing tables untouched.
    this.version(15).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
      leaderboardProfile: '&user_id',
      achievements: '&id, unlockedAt',
    })

    // v16: add-hospital-equipment-medexam2 — new hospitalEquipment table for
    // 10 named equipment items with 3-level upgrade ladder. Schema-only
    // upgrade — table starts empty for everyone, no migration step needed.
    // Passenger of R2 m2 bundle (per achievements precedent in v15).
    this.version(16).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
      leaderboardProfile: '&user_id',
      achievements: '&id, unlockedAt',
      hospitalEquipment: '&equipmentId, updatedAt',
    })

    // v17: add-bookmarks-filters-and-wrong-history-medexam2 — adds
    // `everWrong` boolean to questionHistory + single-column index for the
    // 「歷史曾錯」 sub-view query. No backfill — existing rows default to
    // undefined/false; they migrate forward naturally on next answer write.
    // R2 m2 bundle schema_version bumps 1 → 2 in lockstep (bundles.ts).
    this.version(17).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt], everWrong',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
      leaderboardProfile: '&user_id',
      achievements: '&id, unlockedAt',
      hospitalEquipment: '&equipmentId, updatedAt',
    })

    // v18: tidy-tabs-add-study-stats-medexam2 — adds `dailyStudyLog` table for
    // per-day study-minute snapshots powering the 成就 → 統計 sub-tab charts.
    // Forward-only: no backfill from monotonicCounters.totalStudyMinutes;
    // existing players see an empty table at first cold-open. R2 m2 bundle
    // schema_version bumps 2 → 3 in lockstep (bundles.ts).
    this.version(18).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt], everWrong',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
      leaderboardProfile: '&user_id',
      achievements: '&id, unlockedAt',
      hospitalEquipment: '&equipmentId, updatedAt',
      dailyStudyLog: '&date, updatedAt',
    })
    // v19: fix-doctor-retire-cloud-resurrection-v2 — upgrade retirementLog into
    // a cloud-synced collection. ADDITIVE migration — pk stays `++id`; we keep
    // `doctorId` as a plain (non-unique) secondary index and add new
    // `_updatedAt` LWW field index. v1 (commit dac4eae) tried to change pk to
    // `&doctorId` and was prod-reverted because Dexie 4.x throws
    // `UpgradeError Not yet support for changing primary key` — leaving every
    // v18 user stuck on "啟動中…". DO NOT touch the pk in any future bump.
    // See ~/.claude/imports/dexie_pk_change_pitfall.md.
    //
    // v2-design-take-2 (Path A, validated by §8.12 fixture 2026-05-27):
    // originally Decision 2 promoted `doctorId` to `&doctorId` (unique). Codex
    // adversarial review Attack 1 predicted — and the fixture confirmed — that
    // Dexie 4.x activates the new unique index BEFORE the upgrade callback
    // runs. Existing v18 data with duplicate doctorId (from ghost-resurrection
    // bug) aborts the versionchange tx with AbortError. So we drop the unique
    // constraint and rely on:
    //   (1) services/retire.ts — destructive retire; can't re-retire a deleted doctor
    //   (2) Supabase composite pk (user_id, doctor_id) — server-side guarantee
    //   (3) crypto.randomUUID() 128-bit doctorId — collision-free
    //   (4) Adapter snapshotDirty / snapshotAll emit per-doctorId via .where().first()
    //
    // Upgrade callback still does defensive dedup-by-doctorId (keep smallest
    // retiredAt) as a one-shot cleanup of any existing ghost-resurrection
    // duplicates, even though it's no longer required to make the index build
    // succeed. Cheaper to dedup once than to ship stale duplicates to cloud.
    this.version(19)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory:
          '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt], everWrong',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId, _updatedAt',
        bookmarks: '&questionId, addedAt',
        bannerUnlockBonusLog: '&subjectId',
        targetedTickets: '&id, status, subjectId, obtainedAt',
        targetedTicketHistory: '++id, ticketId, at, event',
        erConsultLog: '++id, triggeredAt, subjectId',
        leaderboardProfile: '&user_id',
        achievements: '&id, unlockedAt',
        hospitalEquipment: '&equipmentId, updatedAt',
        dailyStudyLog: '&date, updatedAt',
      })
      .upgrade(async (tx) => {
        const table = tx.table<RetirementLogRow & { id?: number }, number>('retirementLog')
        const oldRows = await table.toArray()
        if (oldRows.length === 0) return // fresh / never-retired user — nothing to do
        // Group by doctorId, keep row with smallest retiredAt (oldest retire event wins).
        const byDoctor = new Map<string, RetirementLogRow>()
        for (const row of oldRows) {
          const existing = byDoctor.get(row.doctorId)
          if (!existing || row.retiredAt < existing.retiredAt) {
            byDoctor.set(row.doctorId, row)
          }
        }
        await table.clear()
        // Omit `id` field so Dexie auto-assigns new ++id values; backfill
        // _updatedAt to the original retiredAt so first cloud LWW push has a
        // sensible timestamp anchored to when the retire actually happened.
        await table.bulkAdd(
          Array.from(byDoctor.values()).map((r) => ({
            doctorId: r.doctorId,
            retiredAt: r.retiredAt,
            subjectId: r.subjectId,
            rarity: r.rarity,
            refund: r.refund,
            _updatedAt: r.retiredAt,
          })),
        )
      })

    // v20: rewire-hospital-events-to-non-reading-trigger — move hospital event
    // + ER consult roll off the reading-session tick onto interaction-based
    // triggers. Schema delta on `gameCounters`:
    //   - ADD `lastInteractionEventAt: number | null` (unified 3-min wall-clock
    //     cooldown timestamp, event+ER shared). Seeded from `lastEventResolvedAt`
    //     so newly-upgraded saves don't immediately fire a popup.
    //   - DELETE `eventRollTickCounter` (tick no longer rolls events)
    //   - DELETE `erConsultTicksUntilRoll` (tick no longer rolls ER)
    // No table-shape change (store schema unchanged); migration purely
    // mutates fields on the gameCounters singleton row. R2 m2 bundle
    // schema_version stays at 4 — new field is optional/additive,
    // v3-aware clients tolerate the extra key (forward-compat); deleted
    // fields are already optional on the type so absence is safe.
    this.version(20)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory:
          '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt], everWrong',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId, _updatedAt',
        bookmarks: '&questionId, addedAt',
        bannerUnlockBonusLog: '&subjectId',
        targetedTickets: '&id, status, subjectId, obtainedAt',
        targetedTicketHistory: '++id, ticketId, at, event',
        erConsultLog: '++id, triggeredAt, subjectId',
        leaderboardProfile: '&user_id',
        achievements: '&id, unlockedAt',
        hospitalEquipment: '&equipmentId, updatedAt',
        dailyStudyLog: '&date, updatedAt',
      })
      .upgrade(async (tx) => {
        const countersTable = tx.table<GameCountersRow, 'singleton'>('gameCounters')
        const counters = await countersTable.get('singleton')
        if (!counters) return
        const row = counters as GameCountersRow & {
          eventRollTickCounter?: number
          erConsultTicksUntilRoll?: number
        }
        const seedFrom = row.lastEventResolvedAt ?? null
        // Strip deprecated counters in-place; assign the new field.
        delete row.eventRollTickCounter
        delete row.erConsultTicksUntilRoll
        row.lastInteractionEventAt = seedFrom
        await countersTable.put(row)
      })
  }
}

let _db: HospitalDB | undefined
export function getHospitalDB(): HospitalDB {
  if (!_db) _db = new HospitalDB()
  return _db
}

function currentEpochDay(): number {
  return Math.floor(Date.now() / MS_PER_DAY)
}

// ─── Bootstrap & daily refresh ───────────────────────────────────────────────

function makeStarterDoctor(subjectId: '內科' | '外科', seqIndex: number): DoctorRow {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `starter-${subjectId}-${Date.now()}-${seqIndex}`,
    subjectId,
    rarity: 'P5',
    powerMultiplier: RARITY_POWER_MULTIPLIER.P5,
    name: `${subjectId} 醫師 #1`,
    spriteKey: `doctor-${subjectId}-P5`,
    obtainedAt: Date.now() + seqIndex,
    assignedRoom: null,
    pityCounter: 0,
  }
}

export async function ensureSeed(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction(
    'rw',
    [db.tickets, db.gachaStats, db.rooms, db.gameCounters, db.doctors, db.mastery, db.monotonicCounters],
    async () => {
      // Always ensure monotonicCounters singleton exists (covers both fresh save
      // and the rare case where v6 upgrade didn't run before ensureSeed)
      const mono = await db.monotonicCounters.get('singleton')
      if (!mono) {
        await db.monotonicCounters.put({
          id: 'singleton',
          totalStudyMinutes: 0,
          fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 },
          freshCorrectSinceLastTicket: 0,
        })
      }

      const t = await db.tickets.get('global')
      if (!t) {
        await db.tickets.put({
          id: 'global',
          available: INITIAL_TICKETS,
          lastRefreshDay: currentEpochDay(),
        })
      }
      const s = await db.gachaStats.get('global')
      if (!s) {
        const init = initialGachaStats(RECRUITMENT_GACHA_CONFIG)
        await db.gachaStats.put({ id: 'global', ...init })
      }
      const roomCount = await db.rooms.count()
      if (roomCount === 0) {
        await db.rooms.bulkPut(TIER_ROOMS['診所'])
      }

      const doctorCount = await db.doctors.count()
      const counters = await db.gameCounters.get('singleton')

      if (!counters) {
        // Fresh save — seed 2 P5 starter doctors + starter pull available
        await db.gameCounters.put({
          id: 'singleton',
          revenue: 0,
          reputation: 0,
          lastTickAt: Date.now(),
          tier: '診所',
          hasUsedStarterPull: false,
          currentSessionStartedAt: null,
          lastSessionEndedAt: null,
          tutorial: { completedSteps: {}, firstVisit: {}, firedTips: {} },
          pendingEventId: null,
          pendingEventTriggeredAt: null,
          lastEventResolvedAt: null,
          lastInteractionEventAt: null,
          vipBoostUntil: null,
          erConsultActive: null,
        })
        if (doctorCount === 0) {
          await db.doctors.bulkPut([makeStarterDoctor('內科', 0), makeStarterDoctor('外科', 1)])
        }
      } else {
        const c = counters as Partial<GameCountersRow>
        const patches: Partial<GameCountersRow> = {}
        if (c.tier === undefined) patches.tier = '診所'
        // Recovery branch — see `fix-v3-to-v4-starter-pull-migration` design.md D4 matrix.
        // The original v3→v4 patcher unconditionally force-set hasUsedStarterPull=true,
        // which softlocked v3 saves whose doctors table was empty (no starter pull UI +
        // no doctors = unplayable). Branch on actual doctorCount instead of flag value:
        //   - doctorCount === 0  → seed 2 P5 starters + set flag false (recovery, fires
        //                          for both undefined and already-true flag victims;
        //                          self-terminating because doctorCount > 0 next boot)
        //   - doctorCount > 0    → preserve original intent: set flag true if undefined,
        //                          no-op if already defined
        if (doctorCount === 0) {
          await db.doctors.bulkPut([makeStarterDoctor('內科', 0), makeStarterDoctor('外科', 1)])
          patches.hasUsedStarterPull = false
        } else if (c.hasUsedStarterPull === undefined) {
          patches.hasUsedStarterPull = true
        }
        if (Object.keys(patches).length > 0) {
          await db.gameCounters.put({ ...counters, ...patches } as GameCountersRow)
        }
      }

      // Backfill mastery for any subject missing (safety net beyond upgrade hook)
      const existingMastery = new Set((await db.mastery.toArray()).map((r) => r.subjectId))
      const missing = ALL_SUBJECT_IDS.filter((s) => !existingMastery.has(s)).map((subjectId) => ({
        subjectId,
        correct: 0,
        total: 0,
      }))
      if (missing.length > 0) await db.mastery.bulkAdd(missing)
    },
  )
}

export async function refreshDailyTickets(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.tickets, async () => {
    const t = await db.tickets.get('global')
    if (!t) return
    const today = currentEpochDay()
    const delta = today - t.lastRefreshDay
    if (delta <= 0) return
    const grant = Math.min(delta, TICKET_CAP - t.available)
    await db.tickets.put({
      ...t,
      available: Math.min(TICKET_CAP, t.available + Math.max(0, grant)),
      lastRefreshDay: today,
    })
  })
}

// ─── Quiz-reward ticket helpers (add-quiz-economy-redesign) ─────────────────

/**
 * Grant N tickets to the global ticket inventory, clamped at TICKET_CAP.
 * Caller MUST run this inside an outer Dexie transaction that already holds
 * write-lock on `tickets`. Returns the actually-granted delta (may be < count
 * if cap is hit) so callers can decide whether to emit a `+1 招募券` toast vs
 * a `已達上限` toast.
 */
export async function grantTicketsForCorrect(count: number): Promise<number> {
  const db = getHospitalDB()
  const t = await db.tickets.get('global')
  if (!t) return 0
  const next = Math.min(TICKET_CAP, t.available + count)
  const actuallyGranted = next - t.available
  if (actuallyGranted > 0) {
    await db.tickets.put({ ...t, available: next })
  }
  return actuallyGranted
}

/**
 * Grant the one-time banner-first-unlock ticket bonus for `subjectId`, idempotent
 * via `bannerUnlockBonusLog`. Returns true if a bonus was newly granted (caller
 * should toast), false if already granted previously. Caller MUST run inside a
 * Dexie transaction holding write-lock on both `tickets` and `bannerUnlockBonusLog`.
 */
export async function grantBannerUnlockBonus(subjectId: string): Promise<boolean> {
  const db = getHospitalDB()
  const existing = await db.bannerUnlockBonusLog.get(subjectId)
  if (existing) return false
  await db.bannerUnlockBonusLog.put({ subjectId, grantedAt: Date.now() })
  // Always log even when ticket cap is hit (one-shot semantics preserved).
  const t = await db.tickets.get('global')
  if (t && t.available < TICKET_CAP) {
    await db.tickets.put({ ...t, available: Math.min(TICKET_CAP, t.available + 1) })
  }
  return true
}

// ─── Affinity helpers ────────────────────────────────────────────────────────

export async function getAffinity(subjectId: string): Promise<number> {
  const row = await getHospitalDB().affinity.get(subjectId)
  return row?.correctCount ?? 0
}

export async function incrementAffinity(subjectId: string): Promise<number> {
  const db = getHospitalDB()
  return db.transaction('rw', db.affinity, async () => {
    const row = await db.affinity.get(subjectId)
    const next = (row?.correctCount ?? 0) + 1
    await db.affinity.put({ subjectId, correctCount: next })
    return next
  })
}

// ─── Gacha stats helpers ─────────────────────────────────────────────────────

export async function getGachaStats(): Promise<GachaStats> {
  const row = await getHospitalDB().gachaStats.get('global')
  if (!row) return initialGachaStats(RECRUITMENT_GACHA_CONFIG)
  return { totalRolls: row.totalRolls, rollsSinceLast: { ...row.rollsSinceLast } }
}
