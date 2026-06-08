/**
 * Neurons leaderboard client adapter — builds upsert payload from local Dexie
 * state, calls Worker endpoints (POST upsert / opt-out / DELETE me, GET filter
 * snapshot / nickname-check / me).
 *
 * Capability spec: openspec/specs/neurons-leaderboard/spec.md
 * Worker module: cloudflare/sync-worker/src/neurons-leaderboard.ts
 *
 * Auth: every authed request requires the caller to provide an `accessToken`
 * (Supabase JWT). For the dogfood-only phase before `add-neurons-deploy`
 * wires cloud-sync auth, the token is sourced manually from the opt-in modal
 * flow (which gates participation behind a sign-in step that supplies the JWT).
 */

import { db, type LeaderboardProfileRow } from '../db'
import { readTotalStudyMinutes } from './reading-timer'
import { ownedSlotCount } from './variant-ownership'
import {
  NEURONS_ACHIEVEMENTS,
  FAMILY_IDS,
  tierRank,
  type NeuronsAchievement,
} from '@study-rpg/content-neurons-tw'

// Worker base URL — same Cloudflare Worker as 二階. Configurable via env var
// for local Worker (`wrangler dev` on port 8787) testing; defaults to prod.
const DEFAULT_WORKER_URL = 'https://study-rpg-sync-worker.tony85314.workers.dev'

const WORKER_URL =
  (import.meta.env.VITE_SYNC_WORKER_URL as string | undefined)?.trim() || DEFAULT_WORKER_URL

export type LeaderboardFilter = 'composite' | 'variants' | 'ap' | 'study' | 'settles'

export const LEADERBOARD_FILTERS: LeaderboardFilter[] = [
  'composite',
  'variants',
  'ap',
  'study',
  'settles',
]

export interface LeaderboardRow {
  user_id: string
  nickname: string
  variant_count: number
  total_AP: number
  total_study_min: number
  total_settles: number
  badges_csv?: string
  updated_at: number
}

export interface LeaderboardSnapshot {
  rows: LeaderboardRow[]
  last_updated_at: number | null
  total_count: number
}

export interface NeuronsLeaderboardPayload {
  nickname: string
  variant_count: number
  total_AP: number
  total_study_min: number
  total_settles: number
  is_public: 0 | 1
  updated_at: number
  badges_csv?: string
}

export interface NicknameCheckResponse {
  available: boolean
  reason?: string
}

/**
 * Build the upsert payload from local Dexie state. Computes:
 * - variant_count = ownedSlotCount(db) — distinct *currently-held* slots (≥1 held
 *   individual), the canonical projection from neuron-variant-fusion; excludes
 *   ghost slots from cross-device fusion races. NOT a raw neuronVariants row count.
 * - total_AP = sum of familyAccrual.ap across all families
 * - total_study_min = sum of meta['totalStudyMinutes'] accrued by the
 *   reading-timer service (wired 2026-05-28 via polish-neurons-final)
 * - total_settles = sum of the four meta['maze:<branch>:settles'] counters
 *   (the maze exploration-progress axis, realign-neurons-leaderboard-to-maze)
 */
export async function buildLeaderboardPayload(
  nickname: string,
  isPublic: boolean,
): Promise<NeuronsLeaderboardPayload> {
  const [variant_count, accruals] = await Promise.all([
    ownedSlotCount(db),
    db.familyAccrual.toArray(),
  ])

  const total_AP = accruals.reduce((sum, a) => sum + (a.ap ?? 0), 0)

  // Wired to the reading-timer service's `meta['totalStudyMinutes']` counter.
  // Returns 0 for users who have never started the timer (defensive fallback
  // inside readTotalStudyMinutes for undefined meta key).
  const total_study_min = await readTotalStudyMinutes()

  // total_settles = cumulative maze settles across the 11 per-FAMILY pools
  // (redesign-neurons-maze-rotjs-grid). These keys are the per-family settle
  // counters written by lib/maze/economy.ts (settlesKey = `maze:${familyId}:settles`)
  // and are members of SYNCED_META_KEYS, so the sum is cross-device-correct. Derived
  // from FAMILY_IDS (not the maze module) to keep zero blast radius; read
  // defensively so a missing key contributes 0. (The 4 retired branch settles keys
  // are cleared by the v17 upgrade — summing them would regress this axis to 0.)
  const settlesKeys = FAMILY_IDS.map((f) => `maze:${f}:settles`)
  const settlesRows = await Promise.all(settlesKeys.map((k) => db.meta.get(k)))
  const total_settles = settlesRows.reduce(
    (sum, row) => sum + (Number(row?.value ?? '0') || 0),
    0,
  )

  // Derive badges_csv from currently-unlocked achievements (hidden excluded).
  const badges_csv = await deriveBadgesCsvFromDexie()

  return {
    nickname,
    variant_count,
    total_AP,
    total_study_min,
    total_settles,
    is_public: isPublic ? 1 : 0,
    updated_at: Date.now(),
    badges_csv,
  }
}

/**
 * Read currently-unlocked achievements from Dexie, derive max-tier-per-category
 * CSV. Hidden category is filtered out (player-private). Categories sorted
 * alphabetically for deterministic ordering. Max 6 entries × ~12 chars = ≤ 72
 * chars, fits Worker regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$`.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md "Leaderboard
 * badges_csv SHALL be derived as max-tier-per-category with hidden excluded".
 */
export async function deriveBadgesCsvFromDexie(): Promise<string> {
  const rows = await db.achievements.toArray()
  const unlockedIds = new Set(rows.map((r) => r.id))
  const unlocked = NEURONS_ACHIEVEMENTS.filter((a) => unlockedIds.has(a.id))
  return deriveAchievementSnapshot(unlocked)
}

/**
 * Pure derivation function — useful for unit testing without Dexie. Filters
 * hidden, groups by category, picks best tier (lowest tierRank), sorts
 * alphabetically by category, joins with comma.
 */
export function deriveAchievementSnapshot(
  unlocked: readonly NeuronsAchievement[],
): string {
  const bestByCategory = new Map<string, NeuronsAchievement>()
  for (const a of unlocked) {
    if (a.category === 'hidden') continue
    const existing = bestByCategory.get(a.category)
    if (!existing || tierRank(a.tier) < tierRank(existing.tier)) {
      bestByCategory.set(a.category, a)
    }
  }
  return Array.from(bestByCategory.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cat, a]) => `${cat}:${a.tier}`)
    .join(',')
}

interface AuthedFetchOptions {
  accessToken: string
  method: 'GET' | 'POST' | 'DELETE'
  body?: unknown
}

async function authedFetch(path: string, opts: AuthedFetchOptions): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
  }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(`${WORKER_URL}${path}`, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

/**
 * POST /leaderboard/neurons/upsert — push the player's leaderboard row.
 * Returns the Worker response payload; throws on network / auth failure.
 */
export async function pushNeuronsLeaderboardRow(
  accessToken: string,
  payload: NeuronsLeaderboardPayload,
): Promise<{ ok: true } | { error: string; dropped?: string }> {
  const res = await authedFetch('/leaderboard/neurons/upsert', {
    accessToken,
    method: 'POST',
    body: payload,
  })
  return (await res.json()) as { ok: true } | { error: string; dropped?: string }
}

/**
 * Auto-upsert the player's leaderboard row after a successful cloud-sync push.
 * Wired into the sync engine's `onPushComplete` hook (see useSync.ts) so an
 * opted-in player's rank tracks gameplay without manual 同步.
 *
 * Gating: only fires when the local profile has `opted_in === true`; payload
 * carries the player's current `is_public` (an opted-out-but-still-opted-in
 * player keeps is_public=0 while stats refresh). Returns a status enum for
 * testability.
 *
 * LOOP-SAFETY (critical): this MUST NOT write `last_pushed_at` (or anything
 * else) back to `leaderboardProfile` / `meta` / any synced Dexie table.
 * Those tables are members of SYNCED_TABLES, so a write would re-trigger
 * `engine.schedulePush()` → push → onPushComplete → here → write → … an
 * unbounded ~debounceMs push loop even while idle. `last_pushed_at` only feeds
 * the manual-push cooldown UI, which the auto path does not use. buildLeaderboard-
 * Payload is read-only and pushNeuronsLeaderboardRow only does a fetch, so with
 * no profile write this hook touches no synced table → no re-trigger.
 */
export async function autoPushLeaderboardOnSync(opts: {
  userId: string
  getAccessToken: () => Promise<string | null>
}): Promise<'pushed' | 'skipped-not-opted-in' | 'skipped-no-token'> {
  const profile = await getLeaderboardProfile(opts.userId)
  if (!profile || !profile.opted_in) return 'skipped-not-opted-in'
  const token = await opts.getAccessToken()
  if (!token) return 'skipped-no-token'
  const payload = await buildLeaderboardPayload(profile.nickname, profile.is_public)
  await pushNeuronsLeaderboardRow(token, payload)
  return 'pushed'
}

/**
 * GET /leaderboard/neurons/nickname-check?n=<candidate>
 * Returns availability without committing the nickname.
 */
export async function checkNicknameAvailable(
  accessToken: string,
  candidate: string,
): Promise<NicknameCheckResponse> {
  const res = await authedFetch(
    `/leaderboard/neurons/nickname-check?n=${encodeURIComponent(candidate)}`,
    { accessToken, method: 'GET' },
  )
  return (await res.json()) as NicknameCheckResponse
}

/**
 * POST /leaderboard/neurons/opt-out — sets is_public=0 server-side and
 * updates the local profile ONLY when the Worker confirms success.
 *
 * On 401 / 500 / network failure: throws so callers can surface the error
 * and the local `is_public` flag stays in sync with the actual D1 state.
 * (Per codex review 2026-05-25 — previously this function blindly trusted
 * `fetch` resolution and could mark a player hidden locally while their
 * row remained in the next KV snapshot.)
 */
export async function optOutLeaderboard(
  accessToken: string,
  userId: string,
): Promise<void> {
  const res = await authedFetch('/leaderboard/neurons/opt-out', {
    accessToken,
    method: 'POST',
  })
  if (!res.ok) {
    throw new Error(`opt-out failed: HTTP ${res.status}`)
  }
  const existing = await db.leaderboardProfile.get(userId)
  if (existing) {
    await db.leaderboardProfile.put({ ...existing, is_public: false })
  }
}

/**
 * DELETE /leaderboard/neurons/me — irreversible, called from account-reset flow.
 * Also clears the local profile row.
 */
export async function deleteLeaderboardRow(
  accessToken: string,
  userId: string,
): Promise<void> {
  await authedFetch('/leaderboard/neurons/me', {
    accessToken,
    method: 'DELETE',
  })
  await db.leaderboardProfile.delete(userId)
}

/**
 * GET /leaderboard/neurons/:filter — fetch the latest snapshot for a filter
 * (KV-cached, no D1 hit). Public endpoint — no auth required.
 */
export async function fetchLeaderboardSnapshot(
  filter: LeaderboardFilter,
): Promise<LeaderboardSnapshot> {
  const res = await fetch(`${WORKER_URL}/leaderboard/neurons/${filter}`)
  if (!res.ok) {
    throw new Error(`leaderboard snapshot fetch failed: ${res.status}`)
  }
  return (await res.json()) as LeaderboardSnapshot
}

/**
 * GET /leaderboard/neurons/me — discover whether the user already has a
 * server-side row (e.g., from a prior session on another device). Returns
 * null when the user has never opted in.
 */
export async function fetchMyLeaderboardRow(
  accessToken: string,
): Promise<LeaderboardRow | null> {
  const res = await authedFetch('/leaderboard/neurons/me', {
    accessToken,
    method: 'GET',
  })
  if (!res.ok) return null
  const data = (await res.json()) as { row: LeaderboardRow | null }
  return data.row
}

/**
 * Local profile read — does the user have a leaderboardProfile Dexie row at all?
 * Used to gate the opt-in modal on first leaderboard visit.
 */
export async function getLeaderboardProfile(userId: string): Promise<LeaderboardProfileRow | undefined> {
  return db.leaderboardProfile.get(userId)
}

/**
 * Local profile write — used by opt-in modal submit + opt-out toggle re-enable.
 */
export async function persistLeaderboardProfile(
  row: LeaderboardProfileRow,
): Promise<void> {
  await db.leaderboardProfile.put(row)
}

/**
 * NFKC + lowercase nickname normalisation, matching the Worker's logic.
 */
export function normalizeNicknameForComparison(raw: string): string {
  return raw.normalize('NFKC').toLowerCase()
}

/**
 * Codepoint count matching `[...str].length` (UTF-16 surrogate-aware).
 */
export function countNicknameCodepoints(raw: string): number {
  return [...raw].length
}

export const NICKNAME_MIN_CODEPOINTS = 2
export const NICKNAME_MAX_CODEPOINTS = 12
