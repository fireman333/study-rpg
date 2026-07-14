import { useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRespectsReducedMotion } from '../lib/motion'
import {
  getSyncReloadReason,
  shouldShowSchemaDowngradeReload,
  subscribeSchemaDowngradeReload,
} from '../lib/sync/sync-reload-signal'

/**
 * SyncReloadToast — a once-per-session "有新版本，請重新整理" prompt shown when this
 * tab's bundle push is refused by the presign Worker's schema-version downgrade
 * guard (a stale build pushing over a newer-schema cloud blob). Fed by the
 * app-level `sync-reload-signal` event (fired once by the sync engine), NOT by
 * the transient `lastError`, so it surfaces exactly once and never re-fires per
 * dirty cycle. The sync light stays 🔴 until the reload
 * (add-neurons-multi-subject-rescue, design D4).
 */
export default function SyncReloadToast(): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const show = useSyncExternalStore(
    subscribeSchemaDowngradeReload,
    shouldShowSchemaDowngradeReload,
    () => false,
  )

  if (!show) return <></>

  // Reason-aware copy: 'sync-stall' (sustained presign-429 / deferred streak —
  // engine.ts RELOAD_PROMPT_STREAK) must not claim「有新版本」; the remedy (a
  // reload) is identical, only the wording differs.
  const stalled = getSyncReloadReason() === 'sync-stall'
  const title = stalled ? '同步暫時受阻' : '有新版本'
  const subtitle = stalled
    ? '雲端同步連續受阻，請重新整理此分頁以恢復同步。'
    : '雲端已更新，請重新整理以繼續同步進度。'

  const transition = { duration: reduced ? 0.18 : 0.32, ease: 'easeOut' as const }

  return (
    <AnimatePresence>
      <motion.div
        role="alert"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={transition}
        style={toastStyle}
      >
        <span style={{ fontSize: '1.1rem' }}>⬆️</span>
        <div style={{ flex: 1 }}>
          <div style={titleStyle}>{title}</div>
          <div style={subtitleStyle}>{subtitle}</div>
          <button type="button" onClick={() => location.reload()} style={ctaStyle}>
            重新整理
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '1.5rem',
  right: '1.5rem',
  zIndex: 1200,
  background: '#2a1830',
  border: '2px solid #c46ea0',
  borderRadius: '8px',
  padding: '0.8rem 1.1rem',
  color: '#f3e6ef',
  fontFamily: 'var(--font-pixel-cjk)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.7rem',
  maxWidth: 'min(360px, 92vw)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#f0c4dd',
  marginBottom: '0.15rem',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#d8b3ca',
  lineHeight: 1.4,
}

const ctaStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  background: '#c46ea0',
  border: 'none',
  borderRadius: '6px',
  padding: '0.4rem 0.8rem',
  color: '#fff',
  fontFamily: 'var(--font-pixel-cjk)',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
}
