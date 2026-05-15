import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface Props {
  onDone: () => void
}

const TOAST_DURATION_MS = 2400

/**
 * Soft acknowledgement when the player opens the app on a day after a streak
 * broke. No red, no shame — just a gentle "today is day 1 again".
 */
export function StreakBreakToast({ onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, TOAST_DURATION_MS)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <motion.div
      className="streak-break-toast"
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -12, opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <span className="streak-break-toast-icon" aria-hidden="true">🌱</span>
      <div className="streak-break-toast-text">
        <strong>昨日斷簽</strong>
        <span>今天從頭開始累積</span>
      </div>
    </motion.div>
  )
}
