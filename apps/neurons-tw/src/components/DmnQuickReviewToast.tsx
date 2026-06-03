import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { dmnUiEvents } from '../lib/services/dmn-event-dispatcher'
import { useRespectsReducedMotion } from '../lib/motion'

/**
 * Minimal toast subscriber for the `dmn.quickReviewBatchRequested` event.
 *
 * Full implementation requires an SRS-due quiz modal pipeline that doesn't
 * exist in neurons-tw yet (study mode + SRS scheduler land in a future
 * follow-up). For now we surface a 4-second notification so the player gets
 * acknowledgement that the card's effect fired; the actual 5-question batch
 * is wired when the SRS pipeline ships.
 */
export default function DmnQuickReviewToast(): JSX.Element {
  const [visible, setVisible] = useState(false)
  const reduced = useRespectsReducedMotion()

  useEffect(() => {
    let activeTimer: ReturnType<typeof setTimeout> | null = null
    const handler = (): void => {
      setVisible(true)
      if (activeTimer !== null) clearTimeout(activeTimer)
      activeTimer = setTimeout(() => setVisible(false), 4000)
    }
    dmnUiEvents.on('dmn.quickReviewBatchRequested', handler)
    return () => {
      if (activeTimer !== null) clearTimeout(activeTimer)
      dmnUiEvents.off('dmn.quickReviewBatchRequested', handler)
    }
  }, [])

  if (!visible) return <></>

  const transition = { duration: reduced ? 0.18 : 0.32, ease: 'easeOut' as const }

  return (
    <AnimatePresence>
      <motion.div
        role="status"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={transition}
        style={toastStyle}
      >
        <span style={{ fontSize: '1.1rem' }}>✦</span>
        <div>
          <div style={titleStyle}>Quick Review 啟動</div>
          <div style={subtitleStyle}>
            5 道 SRS due 題已排入下一輪複習（SRS 模組上線後生效）
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '1.5rem',
  right: '1.5rem',
  zIndex: 1100,
  background: '#1c1838',
  border: '2px solid #5d4ec4',
  borderRadius: '8px',
  padding: '0.8rem 1.1rem',
  color: '#e6e6fa',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  display: 'flex',
  alignItems: 'center',
  gap: '0.7rem',
  maxWidth: 'min(360px, 92vw)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
}

const titleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 700,
  color: '#d4c4ff',
  marginBottom: '0.15rem',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#b8b3d4',
  lineHeight: 1.4,
}
