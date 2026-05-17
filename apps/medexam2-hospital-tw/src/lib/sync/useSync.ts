// React hook to start / stop sync engine based on auth status (M4 — 二階 mirror).
//
// Minimal first-pass version: starts engine on authed status, stops on
// sign-out. Sign-in migration gate (MigrationUploadPrompt / ConflictChooserModal)
// deferred to follow-up commit — initial dogfood relies on debounce push
// silently uploading local state when cloud is empty (equivalent to user
// clicking「Upload local」). When the migration UI lands, this hook will gain
// gate-state machine matching the 一階 useSync pattern.

import { useEffect, useRef, useState } from 'react'
import { getHospitalDB } from '../../db/schema'
import { getSupabase } from '../auth/client'
import { useAuth } from '../auth/AuthContext'
import { createSyncEngine } from './engine'
import { HOSPITAL_ADAPTERS } from './tables'
import type { SyncEngine, SyncStatus } from './types'

const DEBOUNCE_MS = Number(import.meta.env.VITE_SYNC_DEBOUNCE_MS) || 3000

export interface UseSyncReturn {
  status: SyncStatus
  lastPushAt: number | null
  lastPullAt: number | null
}

export function useSync(): UseSyncReturn {
  const { status: authStatus, user } = useAuth()
  const engineRef = useRef<SyncEngine | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    if (authStatus !== 'authed' || !user) {
      engineRef.current?.stop()
      return
    }

    if (!engineRef.current) {
      engineRef.current = createSyncEngine({
        supabase,
        db: getHospitalDB(),
        adapters: HOSPITAL_ADAPTERS,
        debounceMs: DEBOUNCE_MS,
      })
    }
    engineRef.current.start(user.id)

    if (import.meta.env.DEV) {
      // Use distinct globals from 一階 (`__sync` / `__db`) to avoid collision
      // when both apps run in the same Chrome session.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__hospitalSync = engineRef.current
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__hospitalDb = getHospitalDB()
    }

    // Periodic re-render so status reflects current engine state.
    const poll = setInterval(() => setTick((t) => t + 1), 2000)
    return () => {
      clearInterval(poll)
    }
  }, [authStatus, user])

  // Hard stop on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      engineRef.current = null
    }
  }, [])

  const engine = engineRef.current
  return {
    status: engine?.getStatus() ?? (authStatus === 'disabled' ? 'disabled' : 'unauthed'),
    lastPushAt: engine?.lastPushAt() ?? null,
    lastPullAt: engine?.lastPullAt() ?? null,
  }
}
