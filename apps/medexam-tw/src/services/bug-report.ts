import {
  getDB,
  type BugReportAutoContext,
  type BugReportUserFields,
} from '@study-rpg/core'
import { getSupabase } from '../lib/auth/client'
import { getRecentConsoleErrors } from './console-error-buffer'

const APP_NAME = 'medexam-tw' as const

export async function buildAutoContext(): Promise<BugReportAutoContext> {
  const db = getDB()
  const players = await db.players.toArray()
  const player = players[0] ?? null

  const itemCount = await db.itemInstances.count()
  const srsDueCount = await db.srs.count()
  const mockAttemptCount = await db.mockAttempts.count()

  const gameState: Record<string, unknown> = {
    playerId: player?.id ?? null,
    level: player?.level ?? null,
    xp: player?.xp ?? null,
    stats: player?.stats ?? null,
    currentStreak: player?.currentStreak ?? null,
    longestStreak: player?.longestStreak ?? null,
    lastCheckInDate: player?.lastCheckInDate ?? null,
    todayProgress: player?.todayProgress ?? null,
    itemCount,
    srsCardCount: srsDueCount,
    mockAttemptCount,
  }

  return {
    app_version:
      (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev',
    commit_sha: (import.meta.env.VITE_COMMIT_SHA as string | undefined) ?? 'dev',
    route: window.location.hash || window.location.pathname,
    game_state: gameState,
    user_agent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    recent_console_errors: getRecentConsoleErrors(),
  }
}

export type BugReportAutoKey = keyof BugReportAutoContext

export async function submitBugReport(
  userFields: BugReportUserFields,
  autoContext: BugReportAutoContext,
  optOut: Set<BugReportAutoKey>,
): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not initialised')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const filteredAutoContext: BugReportAutoContext = {}
  for (const key of Object.keys(autoContext) as BugReportAutoKey[]) {
    if (optOut.has(key)) continue
    const value = autoContext[key]
    if (value === undefined) continue
    ;(filteredAutoContext as Record<string, unknown>)[key] = value
  }

  const { error } = await supabase.from('bug_reports').insert({
    user_id: user.id,
    app: APP_NAME,
    ...userFields,
    ...filteredAutoContext,
  })
  if (error) throw error
}
