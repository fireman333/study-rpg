import { useState } from 'react'
import { useDmnStatus } from '../lib/hooks/useDmnStatus'
import DmnDrawModal from './DmnDrawModal'

/**
 * DMN draw entry-point button. Renders in top nav showing current
 * `dmnDrawsAvailable` count. Clicking opens the DmnDrawModal.
 *
 * When all 20 cards are owned, the button renders disabled with a completion
 * message (per spec Req "Catalog SHALL be closed-cap").
 */
export default function DmnDrawButton(): JSX.Element {
  const [open, setOpen] = useState(false)
  const status = useDmnStatus()

  const isComplete = status.ownedCount >= status.catalogSize
  const canDraw = status.drawsAvailable >= 1 && !isComplete

  let label: string
  if (isComplete) label = 'DMN 圖鑑完整'
  else if (status.drawsAvailable === 0) label = 'DMN'
  else label = `DMN · ${status.drawsAvailable}`

  let title: string
  if (isComplete) title = 'DMN 圖鑑已蒐集完整 — 累積經驗繼續 +AP'
  else if (status.drawsAvailable === 0)
    title = '累積唸書 30 分鐘、或觸發 connectome 里程碑解鎖 DMN 抽卡'
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
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
  fontSize: '0.8rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
}
