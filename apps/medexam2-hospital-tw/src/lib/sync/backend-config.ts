// Backend selector for the R2 migration phases.
//
// VITE_CLOUD_SYNC_BACKEND      = 'supabase' | 'dual' | 'r2'
// VITE_CLOUD_SYNC_READ_BACKEND = 'supabase' | 'r2'   (only honored when BACKEND=dual)
//
// Invalid combinations throw at first call so misconfigured deploys fail loud
// instead of silently writing nothing.

export type SyncBackend = 'supabase' | 'dual' | 'r2'
export type SyncReadBackend = 'supabase' | 'r2'

export interface BackendConfig {
  backend: SyncBackend
  readBackend: SyncReadBackend
  writeSupabase: boolean
  writeR2: boolean
  readR2: boolean
}

let cached: BackendConfig | null = null

export function getBackendConfig(): BackendConfig {
  if (cached) return cached

  const rawBackend = (import.meta.env.VITE_CLOUD_SYNC_BACKEND as string | undefined) ?? 'supabase'
  const rawRead = (import.meta.env.VITE_CLOUD_SYNC_READ_BACKEND as string | undefined) ?? 'supabase'

  const backend = normalizeBackend(rawBackend)
  const readBackend = normalizeReadBackend(rawRead)

  // Validate combinations per spec "Feature flag controls sync backend during phased migration"
  if (backend === 'supabase' && readBackend === 'r2') {
    throw new Error(
      `[sync] invalid backend config: BACKEND=supabase with READ_BACKEND=r2 — ` +
        `reads cannot come from a backend that has no writes. Set READ_BACKEND=supabase or pick a different BACKEND.`,
    )
  }

  cached = {
    backend,
    readBackend,
    writeSupabase: backend === 'supabase' || backend === 'dual',
    writeR2: backend === 'dual' || backend === 'r2',
    readR2: backend === 'r2' || readBackend === 'r2',
  }
  return cached
}

function normalizeBackend(v: string): SyncBackend {
  if (v === 'supabase' || v === 'dual' || v === 'r2') return v
  throw new Error(
    `[sync] VITE_CLOUD_SYNC_BACKEND must be 'supabase' | 'dual' | 'r2', got '${v}'`,
  )
}

function normalizeReadBackend(v: string): SyncReadBackend {
  if (v === 'supabase' || v === 'r2') return v
  throw new Error(
    `[sync] VITE_CLOUD_SYNC_READ_BACKEND must be 'supabase' | 'r2', got '${v}'`,
  )
}

// DEV-only hook for tests that need to reset the cache after mutating env.
export function __resetBackendConfigForTests(): void {
  cached = null
}
