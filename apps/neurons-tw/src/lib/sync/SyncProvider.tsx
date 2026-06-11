// SyncProvider — mounts the sync engine once and exposes its status to the
// tree (replaces the headless SyncMount, which discarded the status snapshot
// and left push failures invisible). Also renders the account-switch confirm
// dialog (fix-neurons-account-switch-guard semantics unchanged).
//
// Spec: openspec/specs/neurons-cloud-sync/spec.md
//   "Sync status light with one-click manual sync"

import { createContext, useContext } from 'react'
import AccountSwitchConfirmModal from '../../components/AccountSwitchConfirmModal'
import type { SyncStatus } from './engine'
import { useSync, type AccountSwitchState } from './useSync'

export interface SyncContextValue {
  status: SyncStatus | null
  accountSwitch: AccountSwitchState
  syncNow: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { status, accountSwitch, syncNow } = useSync()
  return (
    <SyncContext.Provider value={{ status, accountSwitch, syncNow }}>
      {children}
      {accountSwitch.pending && (
        <AccountSwitchConfirmModal
          error={accountSwitch.error}
          onConfirm={accountSwitch.confirm}
          onCancel={accountSwitch.cancel}
        />
      )}
    </SyncContext.Provider>
  )
}

/** Null outside the provider (tests render components bare) — render no light. */
export function useSyncContext(): SyncContextValue | null {
  return useContext(SyncContext)
}
