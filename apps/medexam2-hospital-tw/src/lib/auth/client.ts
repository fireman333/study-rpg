// Supabase client singleton for cloud sync (M4 — 二階 mirror).
// Identical to apps/medexam-tw/src/lib/auth/client.ts — shared Supabase project,
// shared OAuth scope. Copied verbatim (not re-exported across apps) to keep
// each app's TypeScript project root self-contained.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined
const SYNC_ENABLED = import.meta.env.VITE_CLOUD_SYNC_ENABLED !== 'false'

let _client: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (_client !== undefined) return _client

  if (!SYNC_ENABLED || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (!SYNC_ENABLED) {
      console.info('[auth] VITE_CLOUD_SYNC_ENABLED=false → cloud sync disabled')
    } else {
      console.warn('[auth] Supabase env vars missing → cloud sync disabled')
    }
    _client = null
    return _client
  }

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Same key as 一階 so signing in on one app authes the other (same origin).
      storageKey: 'study-rpg.auth',
    },
  })
  return _client
}

export function isAuthEnabled(): boolean {
  return getSupabase() !== null
}
