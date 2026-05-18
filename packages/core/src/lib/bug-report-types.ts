/**
 * Bug-report shared types — used by `BugReportModal` in both apps and by
 * the `bug_reports` table (Supabase migration 0004). Kebab-case enum
 * strings are the canonical form on both client + DB; any addition needs
 * matching edits in `supabase/migrations/0004_bug_reports.sql`.
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
] as const

export type BugReportCategory = (typeof BUG_REPORT_CATEGORIES)[number]

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

export const BUG_REPORT_APPS = ['medexam-tw', 'medexam2-hospital-tw'] as const

export type BugReportApp = (typeof BUG_REPORT_APPS)[number]

/** Last 5 runtime errors captured by the per-app console-error ring buffer. */
export interface ConsoleErrorEntry {
  message: string
  source?: string
  line?: number
  timestamp: number
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
}

/** Final DB row shape — everything combined. */
export interface BugReportRow extends BugReportUserFields, BugReportAutoContext {
  id: string
  user_id: string
  app: BugReportApp
  submitted_at: string
}
