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
  | 'family-buff' // base energy consumable: buffed family's maze-energy faucet +1.0 additive for 1h
  | 'variant-rate-up' // next variant slot unlock rolls rarity twice, keeps the rarer
  | 'quick-review-batch' // arm a clickable ≤5-question 出征 mini-batch
  | 'hidden-reveal' // reveal next undrawn P1 card's silhouette hint
  | 'surge' // speed consumable: exploration speedAccel += bonus for a window (NE/DA phasic gain)
  | 'bolus' // energy consumable: maze-energy faucet += bonus for a window (lactate substrate)

/** Stable tuple for iteration / validation. */
export const DMN_EVENT_TYPES: readonly DmnEventKind[] = [
  'family-buff',
  'variant-rate-up',
  'quick-review-batch',
  'hidden-reveal',
  'surge',
  'bolus',
] as const

/**
 * Catalog entry. 22 entries total (2 P1 / 5 P2 / 7 P3 / 8 P4) — closed-cap
 * consumable collection (add-neurons-acceleration-system: streak-shield removed,
 * surge + bolus added). Permanent equipment is a SEPARATE P1–P5 catalog.
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
  /** One of 6 consumable event kinds — drives dispatcher branch. */
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
 * (`family-buff` / `bolus` energy windows, `surge` speed window, `variant-rate-up`
 * single-consume). `expiresAt` drives client-side cleanup; LWW on `expiresAt` for
 * sync. The additive bonus an active buff contributes to the acceleration pools
 * is derived from `buffKind` (+ `familyId` for family-buff) in
 * `neurons-acceleration-system`.
 */
export interface DmnActiveBuffRow {
  /** Auto-incremented PK. */
  id?: number
  /** Which event spawned this buff. */
  buffKind: 'family-buff' | 'variant-rate-up' | 'surge' | 'bolus'
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
  /**
   * Counter — cumulative expedition clears today (display / telemetry only;
   * draws are granted per-session, NOT by this cumulative counter). Resets at
   * midnight. NOTE: the meta key name `dmnTimeAxisMinutesAccrued` is LEGACY and
   * kept stable — since `add-neurons-expedition-rewards` the first axis is the
   * EXPEDITION axis (clears), not reading minutes. The name is frozen to avoid a
   * `SYNCED_META_KEYS` change + R2 bundle SCHEMA_VERSION bump.
   */
  dmnTimeAxisMinutesAccrued: number
  /** Counter — expedition-axis draws already credited today. Capped at DMN_EXPEDITION_DAILY_CAP. */
  dmnTimeAxisDrawsConsumedToday: number
  /** Counter — behavior-axis draws already credited today. Capped at 3. */
  dmnBehaviorAxisDrawsConsumedToday: number
  /**
   * DERIVED display value — currently-available unconsumed draws =
   * clamp(dmnGrantsTotal − dmnLifetimeDrawsConsumed, ≥ 0). Persisted to `meta`
   * so UI readers need no change, but the canonical source of truth is the
   * grants/consumes pair (fix-neurons-dmn-draw-entitlement-resurrection).
   */
  dmnDrawsAvailable: number
  /**
   * Lifetime monotonic count of draw entitlements GRANTED (never decrements).
   * Canonical numerator of the derived pool; monotonic-MAX cross-device.
   */
  dmnGrantsTotal: number
  /** ISO local date of last daily reset (YYYY-MM-DD). */
  dmnLastDailyResetDate: string
  /**
   * Lifetime monotonic count of draws SPENT (never decrements). Canonical
   * denominator of the derived pool (`dmnConsumesTotal`); monotonic-MAX
   * cross-device.
   */
  dmnLifetimeDrawsConsumed: number
}

/**
 * Expedition-axis DMN draw milestones (add-neurons-expedition-rewards).
 *
 * On each completed 出征 session, let `pool` = the wrong-question count the
 * session opened against and `cleared` = the number cleared this session. For
 * each milestone below whose threshold `clamp(round(pct × pool), min, max)` is
 * met by `cleared`, +1 DMN draw is granted (subject to the per-day cap below).
 *
 * The clamp keeps draws REACHABLE on large backlogs (pool 300 → 15 / 30, not
 * 75 / 150) and NON-TRIVIAL on tiny backlogs (pool 8 → 3 / 6, not 2 / 4) while
 * keeping the proportional feel in the mid band (pool 40 → 10 / 20).
 *
 * Dogfood-tunable game-loop numbers (NOT OE-anchored).
 */
export interface DmnExpeditionMilestone {
  /** Fraction of the session's opening wrong-pool that earns this draw. */
  pct: number
  /** Floor on the clear-count threshold (prevents trivially cheap draws). */
  min: number
  /** Ceiling on the clear-count threshold (keeps big backlogs reachable). */
  max: number
}

export const DMN_EXPEDITION_MILESTONES: readonly DmnExpeditionMilestone[] = [
  { pct: 0.25, min: 3, max: 15 },
  { pct: 0.5, min: 6, max: 30 },
]

/** Per-day cap on expedition-axis draws = number of milestones. */
export const DMN_EXPEDITION_DAILY_CAP = DMN_EXPEDITION_MILESTONES.length

export const DMN_BEHAVIOR_AXIS_DAILY_CAP = 3
export const DMN_FAMILY_BUFF_DURATION_MS = 60 * 60 * 1000 // 1 hour

/**
 * family-buff maze-energy multiplier (realign-dmn-event-rewards-to-maze).
 * While an active family-buff matches the answered family, that family's
 * post-commit maze-energy faucet is multiplied by this (composing with the
 * mastery + streak multipliers). Replaces the legacy "+AP" effect (AP no longer
 * gates progression post-promote-maze-to-home). Faithful to the old "+2 AP =
 * 2× per-answer rate". Dogfood-tunable game-loop number (NOT OE-anchored).
 */
export const FAMILY_BUFF_ENERGY_MULT = 2
