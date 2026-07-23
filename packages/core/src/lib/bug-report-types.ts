/**
 * Bug-report shared types — used by `BugReportModal` in both apps and by
 * the `bug_reports` table (Supabase migration 0004). Kebab-case enum
 * strings are the canonical form on both client + DB; any addition needs
 * matching edits in `supabase/migrations/` (latest category add:
 * `0020_handout_content_category.sql`).
 */

export const BUG_REPORT_CATEGORIES = [
  'app-stability',
  'hospital-management',
  'doctors',
  'study-session',
  'events-fate-cards',
  'numbers-wrong',
  'visual-glitch',
  'cloud-sync',
  'corpus',
  'feature-request',
  'other',
  'question-error',
  'image-broken',
  'explanation-error',
  'concept-tag-error',
  // medexam2 講義 考點 Debug report (add-medexam2-handout-keypoint-iteration §2).
  // Coarse top-level category; the 8 fine subtypes ride in the jsonb payload.
  'handout-content',
] as const

export type BugReportCategory = (typeof BUG_REPORT_CATEGORIES)[number]

/**
 * Neurons-tw category set (add-neurons-bug-report). Kept SEPARATE from the
 * medexam `BUG_REPORT_CATEGORIES` (which carries hospital-management / doctors /
 * events-fate-cards) so the neurons form only shows neurons-relevant choices.
 * The four neurons-unique values (`maze-exploration` / `variant-collection` /
 * `synapse` / `dmn-fate-cards`) are added to the shared Supabase `category`
 * CHECK by migration `0017_neurons_bug_reports.sql` — every value here MUST be
 * present in that CHECK (guarded by a unit test). The inline QuizModal 🐞 flow
 * reuses `QUIZ_BUG_TARGET_TO_CATEGORY` (question-error / image-broken /
 * explanation-error / other — already in the CHECK via migration 0007).
 */
export const NEURONS_BUG_REPORT_CATEGORIES = [
  'app-stability',
  'maze-exploration',
  'variant-collection',
  'synapse',
  'dmn-fate-cards',
  'study-session',
  'numbers-wrong',
  'visual-glitch',
  'cloud-sync',
  'corpus',
  'desktop-app',
  'feature-request',
  'other',
] as const

export type NeuronsBugReportCategory = (typeof NEURONS_BUG_REPORT_CATEGORIES)[number]

/** Inline quiz bug-report targets. Player picks one of these in QuizBugReportSheet;
 *  it maps to a BugReportCategory via QUIZ_BUG_TARGET_TO_CATEGORY. */
export const QUIZ_BUG_TARGETS = [
  'question',
  'image',
  'explanation',
  'concept-tag',
  'other',
] as const

export type QuizBugTarget = (typeof QUIZ_BUG_TARGETS)[number]

export const QUIZ_BUG_TARGET_TO_CATEGORY: Record<QuizBugTarget, BugReportCategory> = {
  question: 'question-error',
  image: 'image-broken',
  explanation: 'explanation-error',
  'concept-tag': 'concept-tag-error',
  other: 'other',
}

export const BUG_REPORT_SEVERITIES = [
  'blocker',
  'annoying',
  'minor',
  'suggestion',
] as const

export type BugReportSeverity = (typeof BUG_REPORT_SEVERITIES)[number]

export const BUG_REPORT_REPRODUCIBILITY = [
  'always',
  'sometimes',
  'once',
  'unsure',
] as const

export type BugReportReproducibility = (typeof BUG_REPORT_REPRODUCIBILITY)[number]

export const BUG_REPORT_APPS = ['medexam-tw', 'medexam2-hospital-tw', 'neurons-tw'] as const

export type BugReportApp = (typeof BUG_REPORT_APPS)[number]

/** Last 5 runtime errors captured by the per-app console-error ring buffer. */
export interface ConsoleErrorEntry {
  message: string
  source?: string
  line?: number
  timestamp: number
}

/**
 * Sync engine diagnostic snapshot attached to bug reports
 * (fix-sync-sign-in-lifecycle M3). JSONB serialized into
 * `bug_reports.sync_metadata`. Populated only when the user leaves the
 * 「同步診斷快照」 checkbox checked in the BugReportModal.
 *
 * Shape kept loose (Record<string, unknown>) so per-app engine variations
 * don't require core-package version bumps. Per-app `bug-report.ts` builds
 * the concrete payload by calling `engine.getDiagnosticSnapshot()` and
 * folding in `gateState`, `currentUserId`, `lastSignedInUserId`, etc.
 */
export interface SyncDiagnosticSnapshot {
  gateState?: string
  authStatus?: string
  currentUserId?: string | null
  lastSignedInUserId?: string | null
  lastPushAt?: number | null
  lastPullAt?: number | null
  queueDepth?: number
  recentErrors?: Array<{ at: number; op: string; table: string; message: string }>
  dbRowCounts?: Record<string, number>
  consecutiveErrors?: Record<string, number>
  online?: boolean
}

/** Fields the player fills in the modal form. */
export interface BugReportUserFields {
  category: BugReportCategory
  severity: BugReportSeverity
  what_doing: string
  what_happened: string
  what_expected?: string
  reproducibility?: BugReportReproducibility
  contact_info?: string
  allow_followup?: boolean
}

/** Auto-attached context — every field can be opted-out by the player. */
export interface BugReportAutoContext {
  app_version?: string
  commit_sha?: string
  route?: string
  game_state?: Record<string, unknown>
  user_agent?: string
  viewport?: string
  recent_console_errors?: ConsoleErrorEntry[]
  /** Sync engine diagnostic (fix-sync-sign-in-lifecycle M3). */
  sync_metadata?: SyncDiagnosticSnapshot
  /** Desktop (Tauri) platform descriptor — desktop build only (add-neurons-guided-pdf-onboarding). */
  platform?: string
}

/** Final DB row shape — everything combined. */
export interface BugReportRow extends BugReportUserFields, BugReportAutoContext {
  id: string
  user_id: string
  app: BugReportApp
  submitted_at: string
}
