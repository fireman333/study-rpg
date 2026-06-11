// Sync status → header light mapping (pure; Vitest-locked).
//
// Spec: openspec/specs/neurons-cloud-sync/spec.md
//   "Sync status light with one-click manual sync" — 🟢 synced / 🟡 in flight
//   (clicks no-op) / 🔴 failed (tooltip carries the error); hidden when the
//   engine is unmounted or the account-switch gate is pending.

import type { SyncStatus } from './engine'

export interface SyncLight {
  glyph: '🟢' | '🟡' | '🔴'
  title: string
  busy: boolean
}

export function mapSyncLight(status: SyncStatus | null, accountSwitchPending: boolean): SyncLight | null {
  if (!status || accountSwitchPending) return null
  if (status.state === 'pushing' || status.state === 'pulling') {
    return { glyph: '🟡', title: '同步中…', busy: true }
  }
  if (status.state === 'error' || status.lastError !== null) {
    return {
      glyph: '🔴',
      title: `同步失敗：${status.lastError ?? '未知錯誤'}（點擊重試）`,
      busy: false,
    }
  }
  const at = status.lastPushAt
  const title = at
    ? `已同步｜上次上傳 ${new Date(at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
    : '已同步｜尚未上傳（點擊立即同步）'
  return { glyph: '🟢', title, busy: false }
}
