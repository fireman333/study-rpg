import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ContentPack } from '@study-rpg/core'
import { EmojiIcon } from './EmojiIcon'
import {
  decodePairKey,
  subscribeConnectomeEvents,
} from '../lib/services/connectome'
import { subscribeVariantGachaEvents } from '../lib/services/variant-gacha'
import type { SynapseState } from '../lib/db'
import { useRespectsReducedMotion, TOAST_AUTO_DISMISS_MS } from '../lib/motion'

const STATE_LABEL: Record<SynapseState, string> = {
  dormant: '休眠 dormant',
  weak: '弱 weak',
  strong: '強 strong',
}

interface ToastEntry {
  id: number
  message: string
  emoji: string
}

interface Props {
  pack: ContentPack
}

let nextId = 0

export default function ConnectomeToastHost({ pack }: Props): JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const reduced = useRespectsReducedMotion()

  useEffect(() => {
    const familyById = new Map(pack.subjects.map((s) => [s.id, s]))
    const labelFor = (id: string): string => familyById.get(id)?.displayName ?? id

    const push = (emoji: string, message: string): void => {
      const id = nextId++
      setToasts((prev) => [...prev, { id, message, emoji }])
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, TOAST_AUTO_DISMISS_MS)
    }

    const connectomeSub = subscribeConnectomeEvents({
      'connectome.synapseFormed': (p) => {
        const [a, b] = decodePairKey(p.pairKey)
        push('✨', `新連線形成：「${labelFor(a)}」⇌「${labelFor(b)}」— 今天一起修復了這兩科的錯題，repair together, wire together`)
      },
      'connectome.synapseStrengthened': (p) => {
        const [a, b] = decodePairKey(p.pairKey)
        push('⚡', `連線強化：「${labelFor(a)}」⇌「${labelFor(b)}」現為「${STATE_LABEL[p.toState]}」狀態`)
      },
    })

    const variantSub = subscribeVariantGachaEvents({
      variantRolled: ({ variant, familyDisplayName }) => {
        push(
          '🧬',
          `${familyDisplayName} 變體解鎖：「${variant.displayName}」（Slot ${variant.slotIndex}）`,
        )
      },
    })

    return () => {
      connectomeSub.dispose()
      variantSub.dispose()
    }
  }, [pack])

  if (toasts.length === 0) return <></>

  const initial = reduced ? { opacity: 0 } : { x: 400, opacity: 0 }
  const animate = reduced ? { opacity: 1 } : { x: 0, opacity: 1 }
  const exit = reduced ? { opacity: 0 } : { x: 100, opacity: 0 }
  const transitionDuration = reduced ? 0.2 : 0.3

  return (
    <div style={hostStyle}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={initial}
            animate={animate}
            exit={exit}
            transition={{ duration: transitionDuration, ease: 'easeOut' }}
            style={toastStyle}
          >
            <span style={emojiStyle}><EmojiIcon char={t.emoji} size={16} decorative /></span>
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

const hostStyle: React.CSSProperties = {
  position: 'fixed',
  top: '1rem',
  right: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  zIndex: 1000,
  maxWidth: 'min(420px, 90vw)',
}

const toastStyle: React.CSSProperties = {
  background: '#fdf6e3',
  border: '2px solid #b58900',
  borderRadius: '4px',
  padding: '0.6rem 0.85rem',
  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  fontSize: '0.85rem',
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'flex-start',
}

const emojiStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  flexShrink: 0,
}
