// React hook to start / stop sync engine based on auth status (M4 cloud sync).
//
// Lifecycle:
// - User signs in (status === 'authed') → create engine + start(uid)
// - User signs out / status changes → stop engine, recreate next sign-in
// - Component unmount → stop

import { useEffect, useRef, useState } from 'react'
import { getDB } from '@study-rpg/core'
import { getSupabase } from '../auth/client'
import { useAuth } from '../auth/AuthContext'
import { createSyncEngine } from './engine'
import type { SyncEngine, SyncStatus } from './types'

const DEBOUNCE_MS = Number(import.meta.env.VITE_SYNC_DEBOUNCE_MS) || 3000

export function useSync(): { status: SyncStatus; lastPushAt: number | null; lastPullAt: number | null } {
  const { status: authStatus, user } = useAuth()
  const engineRef = useRef<SyncEngine | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      // Auth disabled — never start engine.
      return
    }

    if (authStatus === 'authed' && user) {
      // Lazy-create engine on first authed transition.
      if (!engineRef.current) {
        engineRef.current = createSyncEngine({
          supabase,
          db: getDB(),
          debounceMs: DEBOUNCE_MS,
        })
      }
      engineRef.current.start(user.id)
      // Debug expose (M4 smoke testing) — remove before archive.
      if (import.meta.env.DEV) {
        ;(globalThis as any).__sync = engineRef.current
        ;(globalThis as any).__db = getDB()
      }
      // Periodic re-render so status reflects current state.
      const poll = setInterval(() => setTick((t) => t + 1), 2000)
      return () => {
        clearInterval(poll)
      }
    } else {
      // Not authed: ensure engine is stopped.
      engineRef.current?.stop()
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
