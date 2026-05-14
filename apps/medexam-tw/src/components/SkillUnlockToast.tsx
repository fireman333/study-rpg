import { useEffect } from 'react'
import { motion } from 'framer-motion'
import type { SkillNode } from '@study-rpg/core'

interface Props {
  node: SkillNode
  spriteUrl: string | undefined
  onDone: () => void
}

const TOAST_DURATION_MS = 1500

export function SkillUnlockToast({ node, spriteUrl, onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(onDone, TOAST_DURATION_MS)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <motion.div
      className="skill-unlock-toast"
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -12, opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="skill-unlock-toast-sprite">
        {spriteUrl ? <img src={spriteUrl} alt="" /> : <span>★</span>}
      </div>
      <div className="skill-unlock-toast-text">
        <strong>新節點解鎖</strong>
        <span>{node.name}</span>
      </div>
    </motion.div>
  )
}
