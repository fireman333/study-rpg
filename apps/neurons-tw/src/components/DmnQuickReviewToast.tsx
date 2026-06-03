import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { dmnUiEvents } from '../lib/services/dmn-event-dispatcher'
import { useQuestionHistory } from '../lib/services/question-history'
import { useRespectsReducedMotion } from '../lib/motion'

/**
 * Toast for the DMN `quick-review-batch` event
 * (realign-dmn-event-rewards-to-maze).
 *
 * When a quick-review-batch card is drawn, surface an actionable CTA: if the
 * player has currently-wrong questions, a "▶ 5 題快速複習" button that emits
 * `dmn.quickReviewStart` — OverviewPage opens a ≤5-question 出征 mini-batch whose
 * clears credit the expedition DMN draw axis (closed loop). If there are no
 * wrong questions, the toast just acknowledges there is nothing to review.
 */
export default function DmnQuickReviewToast(): JSX.Element {
  const [visible, setVisible] = useState(false)
  const reduced = useRespectsReducedMotion()
  const history = useQuestionHistory()
  const hasWrong = history.some((h) => h.lastResult === 'wrong')

  useEffect(() => {
    let activeTimer: ReturnType<typeof setTimeout> | null = null
    const handler = (): void => {
      setVisible(true)
      if (activeTimer !== null) clearTimeout(activeTimer)
      // Longer than the old 4s notice — the player needs time to tap the CTA.
      activeTimer = setTimeout(() => setVisible(false), 10000)
    }
    dmnUiEvents.on('dmn.quickReviewBatchRequested', handler)
    return () => {
      if (activeTimer !== null) clearTimeout(activeTimer)
      dmnUiEvents.off('dmn.quickReviewBatchRequested', handler)
    }
  }, [])

  if (!visible) return <></>

  const transition = { duration: reduced ? 0.18 : 0.32, ease: 'easeOut' as const }

  const startReview = (): void => {
    dmnUiEvents.emit('dmn.quickReviewStart', {})
    setVisible(false)
  }

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
        <div style={{ flex: 1 }}>
          <div style={titleStyle}>Quick Review 啟動</div>
          {hasWrong ? (
            <>
              <div style={subtitleStyle}>清掉一批錯題，順手換 DMN 抽卡</div>
              <button type="button" onClick={startReview} style={ctaStyle}>
                ▶ 5 題快速複習
              </button>
            </>
          ) : (
            <div style={subtitleStyle}>目前沒有錯題可複習 ✦</div>
          )}
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

const ctaStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  background: '#5d4ec4',
  border: 'none',
  borderRadius: '6px',
  padding: '0.4rem 0.8rem',
  color: '#fff',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
}
