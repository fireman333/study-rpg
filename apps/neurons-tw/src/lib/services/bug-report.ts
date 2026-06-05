/**
 * Bug-report submit service for neurons-tw (add-neurons-bug-report).
 *
 * Builds the auto-context snapshot from neurons' own Dexie state + the
 * console-error ring buffer + a best-effort sync diagnostic, then inserts into
 * the shared Supabase `bug_reports` table with `app = 'neurons-tw'`. Mirrors the
 * 二階 pattern documented in docs/BUG_REPORTING.md (per-app split — no shared
 * runtime helper). Insert errors are returned to the caller (never swallowed).
 */
import type {
  BugReportAutoContext,
  BugReportReproducibility,
  BugReportSeverity,
  SyncDiagnosticSnapshot,
} from '@study-rpg/core'
import { FAMILY_IDS } from '@study-rpg/content-neurons-tw'
import { getSupabase } from '../auth/client'
import { db } from '../db'
import { getRecentConsoleErrors } from './console-error-buffer'

/** Player-filled fields + optional inline question linkage. */
export interface NeuronsBugReportInput {
  /** A NEURONS_BUG_REPORT_CATEGORIES value (form) or a QUIZ_BUG_TARGET_TO_CATEGORY
   *  value (inline). Both are guaranteed to be in the DB `category` CHECK. */
  category: string
  severity: BugReportSeverity
  what_doing: string
  what_happened: string
  what_expected?: string
  reproducibility?: BugReportReproducibility
  contact_info?: string
  allow_followup?: boolean
  /** Inline QuizModal 🐞 flow only — the displayed question's id. */
  question_id?: string
}

/** Per-field opt-out flags — `true` means "omit this auto-context field". */
export interface AutoContextOptOuts {
  app_version?: boolean
  commit_sha?: boolean
  route?: boolean
  game_state?: boolean
  user_agent?: boolean
  viewport?: boolean
  recent_console_errors?: boolean
  sync_metadata?: boolean
}

export interface AuthInfo {
  authStatus: string
  userId: string | null
}

export type SubmitResult = { ok: true } | { ok: false; error: string }

/** The auto-context field keys, in display order — UI renders one opt-out per. */
export const AUTO_CONTEXT_FIELDS = [
  'app_version',
  'commit_sha',
  'route',
  'game_state',
  'user_agent',
  'viewport',
  'recent_console_errors',
  'sync_metadata',
] as const

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Compact, PII-free numeric/enum snapshot of the player's Dexie state. */
async function buildGameStateSnapshot(): Promise<Record<string, unknown>> {
  const [
    variantSlots,
    instancesHeld,
    synapses,
    achievements,
    dmnCards,
    bookmarks,
    history,
    masteryFamilies,
  ] = await Promise.all([
    db.neuronVariants.count(),
    // consumedAt=null can't be matched via an index (IndexedDB doesn't index
    // null) → filter-scan for the held count.
    db.neuronInstances.filter((i) => i.consumedAt === null).count().catch(() => undefined),
    db.synapses.toArray(),
    db.achievements.count(),
    db.dmnCards.count(),
    db.questionBookmarks.count(),
    db.questionHistory.toArray(),
    db.familyMastery.count(),
  ])

  const metaKeys = [
    'firstPullDone',
    'totalStudyMinutes',
    'currentQuizCorrectStreak',
    'maxQuizCorrectStreak',
    'dmnDrawsAvailable',
    'neuralEnergyEarned',
    'neuralEnergySpent',
    // Per-family maze settle counts (redesign-neurons-maze-rotjs-grid).
    ...FAMILY_IDS.map((f) => `maze:${f}:settles`),
  ]
  const metaRows = await Promise.all(metaKeys.map((k) => db.meta.get(k)))
  const meta: Record<string, unknown> = {}
  metaKeys.forEach((k, i) => {
    const raw = metaRows[i]?.value
    if (raw == null) return
    meta[k] = k === 'firstPullDone' ? raw === 'true' : (num(raw) ?? raw)
  })

  return {
    dexieVersion: db.verno,
    variantSlots,
    ...(instancesHeld != null ? { instancesHeld } : {}),
    synapseTotal: synapses.length,
    synapseStrong: synapses.filter((s) => s.state === 'strong').length,
    achievements,
    dmnCards,
    bookmarks,
    questionsAnswered: history.length,
    questionsWrongNow: history.filter((h) => h.lastResult === 'wrong').length,
    questionsEverWrong: history.filter((h) => h.everWrong).length,
    masteryFamilies,
    meta,
  }
}

/** Best-effort sync diagnostic. Auth + online always available; engine status
 *  only in DEV (globalThis.__sync stripped from prod). */
function buildSyncSnapshot(auth: AuthInfo): SyncDiagnosticSnapshot {
  const snap: SyncDiagnosticSnapshot = {
    authStatus: auth.authStatus,
    currentUserId: auth.userId,
    online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
  }
  const engine = (globalThis as unknown as { __sync?: { getStatus?: () => unknown } }).__sync
  const st = engine?.getStatus?.() as
    | { state?: string; lastPushAt?: number | null; lastPullAt?: number | null }
    | undefined
  if (st) {
    snap.gateState = st.state
    snap.lastPushAt = st.lastPushAt ?? null
    snap.lastPullAt = st.lastPullAt ?? null
  }
  return snap
}

/** Assemble the auto-context, omitting every opted-out field. */
export async function buildAutoContext(
  optOuts: AutoContextOptOuts,
  auth: AuthInfo,
): Promise<BugReportAutoContext> {
  const ctx: BugReportAutoContext = {}
  if (!optOuts.app_version)
    ctx.app_version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev'
  if (!optOuts.commit_sha) {
    const sha = import.meta.env.VITE_COMMIT_SHA as string | undefined
    if (sha) ctx.commit_sha = sha
  }
  if (!optOuts.route)
    ctx.route = window.location.hash || window.location.pathname || '/'
  if (!optOuts.game_state) ctx.game_state = await buildGameStateSnapshot()
  if (!optOuts.user_agent) ctx.user_agent = navigator.userAgent
  if (!optOuts.viewport) ctx.viewport = `${window.innerWidth}×${window.innerHeight}`
  if (!optOuts.recent_console_errors) ctx.recent_console_errors = getRecentConsoleErrors()
  if (!optOuts.sync_metadata) ctx.sync_metadata = buildSyncSnapshot(auth)
  return ctx
}

/**
 * Submit a bug report. Requires an authenticated user (RLS: auth.uid() =
 * user_id). Returns a discriminated result — the modal surfaces the error
 * string on failure (no silent swallow).
 */
export async function submitBugReport(
  input: NeuronsBugReportInput,
  optOuts: AutoContextOptOuts,
  auth: AuthInfo & { userId: string },
): Promise<SubmitResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: '雲端同步未啟用，無法送出回報（請確認已登入）。' }

  let context: BugReportAutoContext
  try {
    context = await buildAutoContext(optOuts, auth)
  } catch (err) {
    return { ok: false, error: `無法建立診斷快照：${String(err)}` }
  }

  const row = {
    user_id: auth.userId,
    app: 'neurons-tw' as const,
    category: input.category,
    severity: input.severity,
    what_doing: input.what_doing,
    what_happened: input.what_happened,
    what_expected: input.what_expected || null,
    reproducibility: input.reproducibility ?? null,
    contact_info: input.contact_info || null,
    allow_followup: input.allow_followup ?? false,
    question_id: input.question_id ?? null,
    ...context,
  }

  const { error } = await supabase.from('bug_reports').insert(row)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
