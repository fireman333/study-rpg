import {
  QUIZ_BUG_TARGET_TO_CATEGORY,
  type BugReportAutoContext,
  type BugReportUserFields,
  type Question,
  type QuizBugTarget,
} from '@study-rpg/core'
import { getSupabase } from '../lib/auth/client'
import { getHospitalDB } from '../db/schema'
import { getRecentConsoleErrors } from './console-error-buffer'

const APP_NAME = 'medexam2-hospital-tw' as const

export async function buildAutoContext(): Promise<BugReportAutoContext> {
  const db = getHospitalDB()
  const counters = await db.gameCounters.get('singleton')
  const monotonic = await db.monotonicCounters.get('singleton')
  const doctorCount = await db.doctors.count()
  const roomCount = await db.rooms.count()
  const tickets = await db.tickets.get('global')

  const gameState: Record<string, unknown> = {
    tier: counters?.tier ?? null,
    revenue: counters?.revenue ?? null,
    reputation: counters?.reputation ?? null,
    hasUsedStarterPull: counters?.hasUsedStarterPull ?? null,
    currentSessionStartedAt: counters?.currentSessionStartedAt ?? null,
    pendingEventId: counters?.pendingEventId ?? null,
    pendingEventTriggeredAt: counters?.pendingEventTriggeredAt ?? null,
    vipBoostUntil: counters?.vipBoostUntil ?? null,
    totalStudyMinutes: monotonic?.totalStudyMinutes ?? null,
    doctorCount,
    roomCount,
    ticketsAvailable: tickets?.available ?? null,
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

export interface QuizQuestionSnapshot {
  questionId: string
  subject: string
  year: number | string | null
  selectedOption: string | null
  correctAnswer: string
  disputed: boolean
  hasImage: boolean
  inMockExam: boolean
}

export function buildQuestionSnapshot(
  question: Question,
  selectedOption: string | null,
  inMockExam: boolean,
): QuizQuestionSnapshot {
  const yearMeta = question.meta?.year
  return {
    questionId: question.id,
    subject: question.subject,
    year: typeof yearMeta === 'number' || typeof yearMeta === 'string' ? yearMeta : null,
    selectedOption,
    correctAnswer: question.answer,
    disputed: !!question.disputed,
    hasImage: !!question.hasImage,
    inMockExam,
  }
}

export interface QuizInlineReportInput {
  target: QuizBugTarget
  description: string
  snapshot: QuizQuestionSnapshot
}

export async function submitQuizInlineBugReport(
  input: QuizInlineReportInput,
): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not initialised')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const ctx = await buildAutoContext()
  const mergedGameState = { ...(ctx.game_state ?? {}), ...input.snapshot }

  const userFields: BugReportUserFields = {
    category: QUIZ_BUG_TARGET_TO_CATEGORY[input.target],
    severity: 'minor',
    what_doing: `答題中（subject=${input.snapshot.subject}, year=${input.snapshot.year ?? '?'}, questionId=${input.snapshot.questionId}）`,
    what_happened: input.description.trim(),
  }

  const { error } = await supabase.from('bug_reports').insert({
    user_id: user.id,
    app: APP_NAME,
    question_id: input.snapshot.questionId,
    ...userFields,
    app_version: ctx.app_version,
    commit_sha: ctx.commit_sha,
    route: ctx.route,
    game_state: mergedGameState,
    user_agent: ctx.user_agent,
    viewport: ctx.viewport,
    recent_console_errors: ctx.recent_console_errors,
  })
  if (error) throw error
}
