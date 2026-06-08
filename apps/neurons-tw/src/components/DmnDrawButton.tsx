import { useState } from 'react'
import { useDmnStatus } from '../lib/hooks/useDmnStatus'
import DmnDrawModal from './DmnDrawModal'

/**
 * DMN draw entry-point button. Renders in top nav showing current
 * `dmnDrawsAvailable` count. Clicking opens the DmnDrawModal.
 *
 * Disabled when both consumable dex AND equipment dex are fully owned
 * (per `tighten-neurons-dmn-entitlement-semantics`): a draw in that state
 * is engine-side a no-op, so the UI prevents invocation to avoid wasting
 * a hard-earned entitlement on nothing. A consumable-full / equipment-not
 * state keeps the button enabled since the draw still produces equipment.
 */
export default function DmnDrawButton(): JSX.Element {
  const [open, setOpen] = useState(false)
  const status = useDmnStatus()

  const canDraw = status.drawsAvailable >= 1 && !status.bothPoolsExhausted

  let label: string
  if (status.bothPoolsExhausted) label = 'DMN 圖鑑完整'
  else if (status.drawsAvailable === 0) label = 'DMN'
  else label = `DMN · ${status.drawsAvailable}`

  let title: string
  if (status.bothPoolsExhausted) title = 'DMN 圖鑑與裝備皆已蒐集完整'
  else if (status.drawsAvailable === 0)
    title = '出征清除錯題、或觸發 connectome 里程碑解鎖 DMN 抽卡'
  else title = `你有 ${status.drawsAvailable} 次 DMN 抽卡可用`

  return (
    <>
      <button
        type="button"
        onClick={() => canDraw && setOpen(true)}
        disabled={!canDraw}
        title={title}
        style={{
          ...buttonStyle,
          opacity: canDraw ? 1 : 0.55,
          cursor: canDraw ? 'pointer' : 'default',
          background: canDraw ? '#5d4ec4' : '#9b9b9b',
        }}
        aria-label={title}
      >
        {label}
      </button>
      {open && <DmnDrawModal onClose={() => setOpen(false)} />}
    </>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '0.35rem 0.85rem',
  border: '2px solid #2d2055',
  borderRadius: '6px',
  color: '#fff',
  fontFamily: 'var(--font-pixel-cjk)',
  fontSize: '0.8rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
}
