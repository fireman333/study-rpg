/**
 * Hospital leaderboard shared types + constants.
 *
 * Consumed by:
 *   - apps/medexam2-hospital-tw         (UI, sync adapter, settings panel)
 *   - cloudflare/sync-worker (planned)  (currently has its own local copies;
 *                                        Worker deps don't pull @study-rpg/core
 *                                        — keeping the same canonical literals
 *                                        is the contract instead of import).
 *
 * Anchor docs:
 *   openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
 *   openspec/changes/add-hospital-leaderboard/design.md (D6: nickname rules)
 */

// ─── Filters ─────────────────────────────────────────────────────────────────

/**
 * Five leaderboard tabs / sort keys. Order here defines the UI tab strip
 * order — `composite` is the default per spec §Requirement: Four filter tabs;
 * `correct` (add-hospital-leaderboard-correct-count-filter) sits at position
 * 2 between 綜合 and 聲望 so the most recently added discovery surface lives
 * adjacent to the default tab.
 *
 * The Worker keeps a parallel `FILTERS` const for its dispatcher / cron loop /
 * KV key generation in schema-natural order (composite/reputation/doctor/
 * study/correct). The two orderings are independent — only the UI tab strip
 * uses the order in this file.
 */
export const LEADERBOARD_FILTERS = [
  'composite',
  'correct',
  'reputation',
  'doctor',
  'study',
] as const

export type LeaderboardFilter = (typeof LEADERBOARD_FILTERS)[number]

/** Display labels (繁中) for the UI filter tab bar. Short form to fit
 * mobile width without wrapping. Long-form descriptions still used in
 * opt-in modal / HelpMenu where space allows. */
export const LEADERBOARD_FILTER_LABELS: Record<LeaderboardFilter, string> = {
  composite: '綜合',
  correct: '答對',
  reputation: '聲望',
  doctor: '醫師',
  study: '唸書',
}

// ─── Nickname rules ──────────────────────────────────────────────────────────

/** Codepoint-count bounds. `[...str].length` semantics; emoji ZWJ sequences
 *  count as multiple codepoints (accepted P4 polish for Phase 2 follow-up). */
export const LEADERBOARD_NICKNAME_MIN_CODEPOINTS = 2
export const LEADERBOARD_NICKNAME_MAX_CODEPOINTS = 12

/**
 * Normalize a nickname for case-insensitive uniqueness check.
 *
 * NFKC handles compatibility decomposition (e.g. full-width vs half-width
 * Latin); `toLowerCase()` handles ASCII case (and many Unicode cases via
 * the engine's default locale-insensitive lowercasing).
 *
 * MUST match the worker-side helper byte-for-byte — drift here causes
 * "available" client-side but "taken" server-side (or vice versa).
 */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFKC').toLowerCase()
}

/** Codepoint count, matching `[...str].length`. */
export function countNicknameCodepoints(s: string): number {
  return [...s].length
}

/** Length-only validity check. Does NOT enforce uniqueness (caller does that
 *  via the debounced /leaderboard/nickname-check Worker endpoint). */
export function isValidNicknameLength(raw: string): boolean {
  const cp = countNicknameCodepoints(raw)
  return cp >= LEADERBOARD_NICKNAME_MIN_CODEPOINTS && cp <= LEADERBOARD_NICKNAME_MAX_CODEPOINTS
}

// ─── Row + snapshot shapes ───────────────────────────────────────────────────

/**
 * Row shape returned in the PUBLIC leaderboard snapshots (`GET /leaderboard/:filter`,
 * login-free).
 *
 * `nickname_lower` + `is_public` are intentionally NOT exposed — those are
 * internal to the D1 schema.
 *
 * Identity (0.7.0, change hash-leaderboard-user-ids): a public row identifies
 * its player by `player_key`, an opaque per-app keyed hash the Worker derives
 * from the account id. It is stable for a player within one app and unrelated
 * across apps. A client finds its own row by comparing against the key its own
 * authenticated `GET /leaderboard/me` returns — never against the auth user id.
 */
export interface LeaderboardRow {
  /** Opaque public identity (`pk1_…`). Use as list key and for own-row matching. */
  player_key: string
  /**
   * @deprecated The raw Supabase account id. Present ONLY while the Worker runs
   * its rollout compat window; absent afterwards. Do not read it.
   */
  user_id?: string
  nickname: string
  hospital_tier: number
  reputation: number
  doctor_count: number
  total_study_min: number
  /**
   * When the player's client last pushed. The public snapshot stopped carrying
   * it (it published each player's activity pattern — change
   * drop-sync-time-from-public-leaderboard), so it is optional here; the
   * player's own row from the JWT-gated `GET /leaderboard/me` still has it.
   * Optional since 0.7.0.
   */
  updated_at?: number
  /**
   * Achievement system (add-achievement-system, v15). Optional for back-
   * compat with snapshots written before migration 0002. Renderers MUST
   * coalesce undefined → '' / 0.
   */
  badges_csv?: string
  subject_mastery_count?: number
  /**
   * Total correct answers across all subjects, derived from
   * `SUM(mastery.correct)` at client push time. 5th leaderboard filter
   * (add-hospital-leaderboard-correct-count-filter, migration 0005).
   * Optional for back-compat with snapshots written before migration 0005;
   * renderers MUST coalesce undefined → 0.
   */
  total_correct?: number
}

/**
 * Payload shape returned by `GET /leaderboard/:filter`. Hourly cron writes
 * one of these per filter to KV; client reads directly.
 *
 * `last_updated_at` is `null` when the cron has never run yet (cold start
 * after deploy); UI shows an empty state in that case.
 */
export interface LeaderboardSnapshot {
  rows: LeaderboardRow[]
  last_updated_at: number | null
  total_count: number
}

// ─── Client → Worker request bodies ──────────────────────────────────────────

/** Payload for `POST /leaderboard/upsert`. The Worker takes `user_id` from
 *  the verified JWT `sub` claim, NOT the body — fields here are gameplay
 *  attributes only. */
export interface LeaderboardUpsertPayload {
  nickname: string
  hospital_tier: number
  reputation: number
  doctor_count: number
  total_study_min: number
  is_public: 0 | 1
  updated_at: number
  /**
   * Achievement system (add-achievement-system, v15). Comma-separated
   * `<category>:<tier>` pairs, max 6 entries (one per category at the
   * player's highest tier). Empty string when no category achievements
   * unlocked yet. Worker validates against regex.
   */
  badges_csv?: string
  /**
   * Count of unlocked subject-mastery achievements (0–14). Excludes the
   * `all-subjects-mastered` capstone.
   */
  subject_mastery_count?: number
  /**
   * Total correct answers across all subjects. Derived client-side from
   * `SUM(mastery.correct)`. Optional for forward-compat during the
   * 0005-migration rollout window — Worker treats missing as 0.
   */
  total_correct?: number
}

/** Response shape from `GET /leaderboard/nickname-check?n=<candidate>`. */
export interface LeaderboardNicknameCheckResponse {
  available: boolean
  /** Present when `available === false` to explain why (e.g. `invalid_length`). */
  reason?: string
}
