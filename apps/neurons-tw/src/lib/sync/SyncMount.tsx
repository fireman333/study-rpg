// Mounts the sync engine. Renders nothing except the account-switch confirm
// dialog when the gate detects foreign local data (engine stays unmounted
// until the user resolves it). Place once at the top of the App tree inside
// <AuthProvider>.

import AccountSwitchConfirmModal from '../../components/AccountSwitchConfirmModal'
import { useSync } from './useSync'

export function SyncMount(): JSX.Element | null {
  const { accountSwitch } = useSync()
  if (!accountSwitch.pending) return null
  return (
    <AccountSwitchConfirmModal
      error={accountSwitch.error}
      onConfirm={accountSwitch.confirm}
      onCancel={accountSwitch.cancel}
    />
  )
}
