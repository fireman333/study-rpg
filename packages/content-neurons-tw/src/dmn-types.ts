/**
 * DMN (Default Mode Network) fate-card system types for neurons-mode.
 *
 * Locally declared (not borrowed from 二階 hospital-fate-cards). Borrowing
 * pattern mirrors neurons-achievements: re-implement the few primitives we
 * need rather than widening core to fit two domains. Per `neurons-mode` Req 5.
 *
 * Capability spec: openspec/specs/neurons-dmn-fate-cards/spec.md
 * Design rationale: openspec/changes/add-neurons-dmn-fate-card/design.md
 */

/**
 * 4 tiers (P1–P4). Distinct from `neuron-variant-gacha`'s P1–P5 — see design
 * Decision 3: P5 dropped because every DMN card carries an event effect and a
 * P5-tier event becomes "trash" perception.
 */
export type DmnRarity = 'P1' | 'P2' | 'P3' | 'P4'

/**
 * Rarity weights, expressed as integer percentages (sum to 100). Per design
 * Decision 3 — anchored to give P1 a 2% drop rate (~ 50 draws to first P1
 * across the 20-card catalog).
 */
export const DMN_RARITY_WEIGHTS: Record<DmnRarity, number> = {
  P1: 2,
  P2: 10,
  P3: 30,
  P4: 58,
} as const

/** Stable tuple for iteration / validation. */
export const DMN_RARITIES: readonly DmnRarity[] = ['P1', 'P2', 'P3', 'P4'] as const

/**
 * 5 one-time event types dispatched on card draw. Each card binds to exactly
 * one `eventKind`. See design Decision 2 for full magnitude table.
 */
export type DmnEventKind =
  | 'family-buff' // random family +2 AP per correct for 1 hour
  | 'variant-rate-up' // next variant slot unlock uses boosted weights
  | 'quick-review-batch' // surface 5 SRS-due questions immediately
  | 'streak-shield' // one-use immunity to next streak-break
  | 'hidden-reveal' // reveal next undrawn P1 card's silhouette hint

/** Stable tuple for iteration / validation. */
export const DMN_EVENT_TYPES: readonly DmnEventKind[] = [
  'family-buff',
  'variant-rate-up',
  'quick-review-batch',
  'streak-shield',
  'hidden-reveal',
] as const

/**
 * Catalog entry. 20 entries total (2 P1 / 4 P2 / 6 P3 / 8 P4) — closed-cap
 * collection per design Decision 9.
 */
export interface DmnCardDef {
  /** Stable kebab-case unique id (e.g., `dmn-burst-firing-p1-1`). */
  cardId: string
  /** zh-TW player-facing name (≤ 16 char). */
  displayName: string
  /** zh-TW 1–2 sentence flavour blurb with neuroscience narrative anchor. */
  description: string
  /** Rarity tier — drives roll weight + reveal UI form (modal vs toast). */
  rarity: DmnRarity
  /** One of 5 event kinds — drives dispatcher branch. */
  eventKind: DmnEventKind
  /** Sprite registry key (placeholder this change; real art via follow-up). */
  artworkId: string
}

/**
 * Dexie row shape persisted in `dmnCards` table. Differs from `DmnCardDef`
 * by adding the per-save instant fields (`obtainedAt`) and dropping
 * `description` (derive from catalog at render time to keep row size small).
 */
export interface DmnCardRow {
  cardId: string
  rarity: DmnRarity
  eventKind: DmnEventKind
  artworkId: string
  displayName: string
  /** Epoch ms when this card was first drawn on this save. */
  obtainedAt: number
}

/**
 * Idempotency log: one row per dispatched cardId. Sync uses monotonic-union
 * merge (not LWW) so dispatched signal survives cross-device race per spec
 * Req "DMN event log SHALL be idempotent and use monotonic-union merge".
 */
export interface DmnEventLogRow {
  cardId: string
  /** Epoch ms when the event was first dispatched. */
  dispatchedAt: number
  /** Originating device's `client_id` from bundle meta (sync provenance). */
  deviceId: string
}

/**
 * Active buff row — runtime state for events with non-instant effect
 * (`family-buff` 1h duration, `variant-rate-up` single-consume).
 * `expiresAt` drives client-side cleanup; LWW on `expiresAt` for sync.
 */
export interface DmnActiveBuffRow {
  /** Auto-incremented PK. */
  id?: number
  /** Which event spawned this buff. */
  buffKind: 'family-buff' | 'variant-rate-up'
  /** For family-buff: which familyId. Null for other kinds. */
  familyId: string | null
  /** Epoch ms when buff expires (or single-consume sentinel for variant-rate-up). */
  expiresAt: number
  /** Free-form JSON for kind-specific payload (currently unused; reserved). */
  payload: Record<string, unknown> | null
  /** Source card that triggered the buff (provenance). */
  sourceCardId: string
}

/**
 * Meta-key shape for DMN trigger counters. All values stored as string in
 * Dexie `meta` table (mirroring existing meta key pattern); parsed/serialized
 * at the boundary.
 */
export interface DmnMetaSnapshot {
  /** Counter — total time-axis minutes accrued today. Resets at midnight. */
  dmnTimeAxisMinutesAccrued: number
  /** Counter — time-axis draws already credited today. Capped at 2. */
  dmnTimeAxisDrawsConsumedToday: number
  /** Counter — behavior-axis draws already credited today. Capped at 3. */
  dmnBehaviorAxisDrawsConsumedToday: number
  /** Monotonic across days — currently-available unconsumed draws. */
  dmnDrawsAvailable: number
  /** ISO local date of last daily reset (YYYY-MM-DD). */
  dmnLastDailyResetDate: string
  /** Lifetime total dispatched draws (telemetry; never decrements). */
  dmnLifetimeDrawsConsumed: number
}

/** Constants for trigger semantics. */
export const DMN_TIME_AXIS_MINUTES_PER_DRAW = 30
export const DMN_TIME_AXIS_DAILY_CAP = 2
export const DMN_BEHAVIOR_AXIS_DAILY_CAP = 3
export const DMN_FAMILY_BUFF_DURATION_MS = 60 * 60 * 1000 // 1 hour
