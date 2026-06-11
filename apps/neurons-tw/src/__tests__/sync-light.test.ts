/**
 * Sync status light mapping tests (add-neurons-sync-status-chip).
 *
 * Spec: openspec/specs/neurons-cloud-sync/spec.md
 *   "Sync status light with one-click manual sync"
 */

import { describe, it, expect } from 'vitest'
import { mapSyncLight } from '../lib/sync/sync-light'
import type { SyncStatus } from '../lib/sync/engine'

const base = (over: Partial<SyncStatus>): SyncStatus => ({
  state: 'idle',
  lastPushAt: null,
  lastPullAt: null,
  lastError: null,
  ...over,
})

describe('mapSyncLight', () => {
  it('hidden when engine unmounted (null status)', () => {
    expect(mapSyncLight(null, false)).toBeNull()
  })

  it('hidden while account-switch gate is pending', () => {
    expect(mapSyncLight(base({}), true)).toBeNull()
  })

  it('🟡 busy while pushing or pulling (clicks no-op)', () => {
    for (const state of ['pushing', 'pulling'] as const) {
      const light = mapSyncLight(base({ state }), false)
      expect(light?.glyph).toBe('🟡')
      expect(light?.busy).toBe(true)
    }
  })

  it('🔴 on error state with the message in the tooltip', () => {
    const light = mapSyncLight(base({ state: 'error', lastError: 'r2_push_exhausted' }), false)
    expect(light?.glyph).toBe('🔴')
    expect(light?.title).toContain('r2_push_exhausted')
    expect(light?.busy).toBe(false)
  })

  it('🔴 when idle but a lastError lingers', () => {
    const light = mapSyncLight(base({ lastError: 'Failed to fetch' }), false)
    expect(light?.glyph).toBe('🔴')
  })

  it('🟢 with last-push time when synced', () => {
    const light = mapSyncLight(base({ lastPushAt: Date.UTC(2026, 5, 11, 4, 30) }), false)
    expect(light?.glyph).toBe('🟢')
    expect(light?.title).toContain('上次上傳')
    expect(light?.busy).toBe(false)
  })

  it('🟢 with 尚未上傳 when never pushed', () => {
    const light = mapSyncLight(base({}), false)
    expect(light?.glyph).toBe('🟢')
    expect(light?.title).toContain('尚未上傳')
  })
})
