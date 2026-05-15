import { useEffect } from 'react'
import { TIER_UPGRADE_THRESHOLDS, getNextTier, type HospitalTier } from '@study-rpg/content-medexam2-tw'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  tier: HospitalTier
  reputation: number
}

export function UpgradeModal({ isOpen, onClose, tier, reputation }: UpgradeModalProps) {
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const threshold = TIER_UPGRADE_THRESHOLDS[tier]
  const nextTier = getNextTier(tier)
  const isMaxTier = threshold === null || nextTier === null

  return (
    <div
      className="upgrade-modal__backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="upgrade-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal__title"
      >
        <h2 id="upgrade-modal__title" className="upgrade-modal__title">
          醫院升級
        </h2>
        <p className="upgrade-modal__current">
          當前 tier：<strong>{tier}</strong>
        </p>

        {isMaxTier ? (
          <p className="upgrade-modal__max">已達最高 tier ⭐</p>
        ) : (
          <>
            <p className="upgrade-modal__next">
              下一 tier：<strong>{nextTier}</strong>
              <span className="upgrade-modal__threshold">
                {' '}— 聲望達 {threshold.toLocaleString('zh-TW')}
              </span>
            </p>
            <div className="upgrade-modal__progress">
              <div
                className="upgrade-modal__progress-fill"
                style={{ width: `${Math.min(100, (reputation / threshold) * 100)}%` }}
              />
              <span className="upgrade-modal__progress-text">
                {reputation.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                {' / '}
                {threshold.toLocaleString('zh-TW')}
              </span>
            </div>
            {reputation < threshold && (
              <p className="upgrade-modal__hint">
                還差 {(threshold - reputation).toLocaleString('zh-TW', { maximumFractionDigits: 0 })} 聲望
              </p>
            )}
          </>
        )}

        <div className="upgrade-modal__actions">
          <button
            type="button"
            className="upgrade-modal__close"
            onClick={onClose}
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
