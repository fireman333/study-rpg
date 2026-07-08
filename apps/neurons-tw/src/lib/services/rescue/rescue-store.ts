/**
 * Single-subject rescue — device-local store (localStorage, zero-schema).
 *
 * Holds the whole rescue mode's mutable state on THIS device only: the active plan,
 * pre-reveal confidence taps, stop-loss override flags, and thin append-only telemetry.
 * Nothing here touches Dexie, R2, or SYNCED_META_KEYS — a rescue sprint is inherently
 * "this device, these few days" (answers still persist + sync via the normal
 * questionHistory path; only the plan shell is device-local). Lifecycle date decisions
 * delegate to the pure `rescue-lifecycle` helpers. Same-tab reactive via listeners +
 * `useSyncExternalStore`, mirroring `expedition-visibility.ts`.
 *
 * Absorption-revert signal (task 1.3): abandon/archive null the plan and notify
 * listeners, so any surface reading the plan via `useRescuePlan()` (the FamilyPicker
 * card + the targeted-drill absorption) reverts automatically — the reactive plan IS
 * the signal; no separate event is needed.
 *
 * Spec: neurons-single-subject-rescue "device-local ... lifecycle-managed".
 */

import { useSyncExternalStore } from 'react'
import { shouldArchiveRescue } from './rescue-lifecycle'
import type { ConfidenceSignal } from './rescue-priority'
import type { OverrideState } from './rescue-stoploss'

const KEY = 'neurons:rescue:v1'
/** Cap telemetry so localStorage never grows unbounded; keeps the most recent events. */
const TELEMETRY_CAP = 4000

export interface RescuePlan {
  familyId: string
  /** YYYY-MM-DD. */
  examDate: string
  dailyMinutes: number
  createdAt: number
  lastStudiedAt: number
}

export interface RescueTelemetryEvent {
  /** epoch ms. */
  t: number
  kind: string
  [extra: string]: unknown
}

export interface RescueState {
  plan: RescuePlan | null
  /** questionId → pre-reveal confidence tap for the active run. */
  confidence: Record<string, ConfidenceSignal>
  /** conceptId → stop-loss override (bounded exception). */
  overrides: Record<string, OverrideState>
  telemetry: RescueTelemetryEvent[]
}

const EMPTY: RescueState = { plan: null, confidence: {}, overrides: {}, telemetry: [] }

const listeners = new Set<() => void>()
/** Cached parsed snapshot so `useSyncExternalStore` sees a stable reference between writes. */
let snapshot: RescueState | null = null

function read(): RescueState {
  if (snapshot) return snapshot
  try {
    const raw = localStorage.getItem(KEY)
    snapshot = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<RescueState>) } : EMPTY
  } catch {
    snapshot = EMPTY
  }
  return snapshot
}

function write(next: RescueState): void {
  snapshot = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode / storage disabled — state simply doesn't persist across reloads */
  }
  listeners.forEach((fn) => fn())
}

// ─── reads ───────────────────────────────────────────────────────────────────
export function getRescueState(): RescueState {
  return read()
}
export function getActivePlan(): RescuePlan | null {
  return read().plan
}
export function getConfidence(questionId: string): ConfidenceSignal {
  return read().confidence[questionId]
}
export function getOverride(conceptId: string): OverrideState | undefined {
  return read().overrides[conceptId]
}

// ─── lifecycle ───────────────────────────────────────────────────────────────
export interface StartRescueInput {
  familyId: string
  examDate: string
  dailyMinutes: number
}
export type StartRescueResult =
  | { ok: true; plan: RescuePlan }
  | { ok: false; needsConfirm: true; current: RescuePlan }

/**
 * Start (or replace) a rescue plan. One-at-a-time: if a DIFFERENT family already has
 * an active plan and `replace` is not set, returns `needsConfirm` so the UI can prompt.
 * Starting clears the per-run confidence + overrides (telemetry is append-only, kept).
 */
export function startRescue(input: StartRescueInput, opts?: { replace?: boolean }): StartRescueResult {
  const st = read()
  if (st.plan && st.plan.familyId !== input.familyId && !opts?.replace) {
    return { ok: false, needsConfirm: true, current: st.plan }
  }
  const now = Date.now()
  const plan: RescuePlan = { ...input, createdAt: now, lastStudiedAt: now }
  write({ plan, confidence: {}, overrides: {}, telemetry: st.telemetry })
  return { ok: true, plan }
}

/** Abandon the active plan (clears per-run state; keeps telemetry). Reverts absorption via the plan-null signal. */
export function abandonRescue(): void {
  const st = read()
  if (!st.plan) return
  write({ ...st, plan: null, confidence: {}, overrides: {} })
}

/** Auto-archive if `examDate + 1 day` has been reached. Returns whether it archived. */
export function archiveIfDue(todayISO: string): boolean {
  const st = read()
  if (st.plan && shouldArchiveRescue(st.plan.examDate, todayISO)) {
    write({ ...st, plan: null, confidence: {}, overrides: {} })
    return true
  }
  return false
}

export function touchLastStudied(now: number = Date.now()): void {
  const st = read()
  if (!st.plan) return
  write({ ...st, plan: { ...st.plan, lastStudiedAt: now } })
}

// ─── per-run mutations ───────────────────────────────────────────────────────
export function recordConfidence(questionId: string, signal: ConfidenceSignal): void {
  const st = read()
  write({ ...st, confidence: { ...st.confidence, [questionId]: signal } })
}

export function setOverride(conceptId: string, override: OverrideState): void {
  const st = read()
  write({ ...st, overrides: { ...st.overrides, [conceptId]: override } })
}

export function clearOverride(conceptId: string): void {
  const st = read()
  if (!(conceptId in st.overrides)) return
  const overrides = { ...st.overrides }
  delete overrides[conceptId]
  write({ ...st, overrides })
}

// ─── telemetry (thin, append-only, exportable; NO in-app dashboard) ──────────
export function appendTelemetry(event: { kind: string; t?: number; [extra: string]: unknown }): void {
  const st = read()
  const ev: RescueTelemetryEvent = { ...event, t: event.t ?? Date.now() }
  const telemetry = [...st.telemetry, ev].slice(-TELEMETRY_CAP)
  write({ ...st, telemetry })
}
export function exportTelemetry(): string {
  return JSON.stringify(read().telemetry, null, 2)
}

// ─── diagnostic-blitz "ran once" marker (device-local, keyed by plan) ─────────
// A plan runs its diagnostic blitz exactly once at entry. Keyed by the plan's
// createdAt (unique per start), so replacing a plan naturally re-arms the blitz and
// the exam-morning quick-scan never double-runs a second full diagnostic (spec D9).
const BLITZ_KEY = 'neurons:rescue:blitzDone'
export function markBlitzDone(planCreatedAt: number): void {
  try {
    localStorage.setItem(BLITZ_KEY, String(planCreatedAt))
  } catch {
    /* private mode — blitz simply re-runs on reload, harmless */
  }
}
export function isBlitzDone(planCreatedAt: number): boolean {
  try {
    return localStorage.getItem(BLITZ_KEY) === String(planCreatedAt)
  } catch {
    return false
  }
}

// ─── subscriptions ───────────────────────────────────────────────────────────
export function subscribeRescue(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Live-reactive active plan (re-renders on any same-tab rescue change). */
export function useRescuePlan(): RescuePlan | null {
  return useSyncExternalStore(
    subscribeRescue,
    () => read().plan,
    () => null,
  )
}

/** Live-reactive full rescue state (plan + confidence + overrides + telemetry). */
export function useRescueState(): RescueState {
  return useSyncExternalStore(subscribeRescue, read, () => EMPTY)
}

/** Test hook: clear the in-memory snapshot + persisted state. */
export function __resetRescueStoreForTests(): void {
  snapshot = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
