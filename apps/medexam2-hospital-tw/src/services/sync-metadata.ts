// Module-level singleton bridge for the sync engine's diagnostic snapshot
// (fix-sync-sign-in-lifecycle M3). Mirror of apps/medexam-tw/src/services/
// sync-metadata.ts — same pattern, 二階 engine instance.

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
