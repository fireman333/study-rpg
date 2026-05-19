// Module-level singleton bridge for the sync engine's diagnostic snapshot
// (fix-sync-sign-in-lifecycle M3). Lets non-React code paths
// (services/bug-report.ts) access the engine without re-running useSync
// (which would create duplicate engines).
//
// useSync calls registerSyncMetadataGetter() on mount to expose a closure
// that resolves the snapshot; bug-report.ts calls getSyncMetadata() at
// submit time. When the user signs out / useSync unmounts, the getter is
// cleared (returns null).

import type { SyncDiagnosticSnapshot } from '@study-rpg/core'

type SyncMetadataGetter = () => Promise<SyncDiagnosticSnapshot | null>

let _getter: SyncMetadataGetter | null = null

export function registerSyncMetadataGetter(fn: SyncMetadataGetter | null): void {
  _getter = fn
}

export async function getSyncMetadata(): Promise<SyncDiagnosticSnapshot | null> {
  if (!_getter) return null
  try {
    return await _getter()
  } catch (err) {
    console.warn('[sync-metadata] getter threw', err)
    return null
  }
}
