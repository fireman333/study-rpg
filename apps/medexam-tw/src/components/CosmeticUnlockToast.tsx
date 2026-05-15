import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Cosmetic } from '@study-rpg/core'

interface Props {
  cosmetic: Cosmetic
  spriteUrl?: string
  onDone: () => void
}

export function CosmeticUnlockToast({ cosmetic, spriteUrl, onDone }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 3_000)
    return () => window.clearTimeout(t)
  }, [onDone])

  return (
    <motion.div
      className="cosmetic-unlock-toast"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      {spriteUrl ? (
        <img src={spriteUrl} alt={cosmetic.name} className="cosmetic-unlock-toast-sprite" />
      ) : (
        <div className="cosmetic-unlock-toast-sprite cosmetic-unlock-toast-sprite-fallback">🎁</div>
      )}
      <div className="cosmetic-unlock-toast-text">
        <div className="cosmetic-unlock-toast-title">🎉 已解鎖 cosmetic</div>
        <div className="cosmetic-unlock-toast-name">{cosmetic.name}</div>
        <div className="cosmetic-unlock-toast-hint">前往「🏠 宿舍 → 裝扮間」穿上</div>
      </div>
    </motion.div>
  )
}
