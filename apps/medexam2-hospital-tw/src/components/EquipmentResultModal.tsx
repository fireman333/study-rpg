import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { RARITY_LABELS } from '@study-rpg/content-medexam2-tw'
import { EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_RARITY_LABELS } from '../data/equipment'
import { EquipmentArtwork, hasEquipmentHeroArt } from './EquipmentArtwork'
import { describeEquipment } from '../services/equipment'
import type { EquipmentRow } from '../db/schema'
import medicalCaseBodySprite from '../assets/equipment/medical-case-body.png'
import medicalCaseLidSprite from '../assets/equipment/medical-case-lid.png'

// entry -> rarity-flash -> silhouette -> revealed -> close
type RevealStep = 'entry' | 'rarity-flash' | 'silhouette' | 'revealed'

interface Props {
  item: EquipmentRow | null
  wasPity: boolean
  onClose: () => void
}

const STEP_AUTO_ADVANCE_MS: Partial<Record<RevealStep, number>> = {
  'rarity-flash': 800,
  'silhouette': 1000,
}

function nextStep(current: RevealStep): RevealStep | null {
  if (current === 'entry') return 'rarity-flash'
  if (current === 'rarity-flash') return 'silhouette'
  if (current === 'silhouette') return 'revealed'
  return null
}

interface OpenBoxProps {
  onOpen: () => void
  rarity: EquipmentRow['rarity']
}

function TapToOpenBox({ onOpen, rarity }: OpenBoxProps) {
  const [opening, setOpening] = useState(false)
  const rarityKey = rarity.toLowerCase()

  function handleOpen() {
    if (opening) return
    setOpening(true)
    window.setTimeout(onOpen, 460)
  }

  return (
    <div className="supply-box-wrapper">
      <motion.button
        type="button"
        className={`supply-box supply-box--${rarityKey}${opening ? ' supply-box--opening' : ''}`}
        style={{ ['--rarity-color' as string]: `var(--rarity-${rarityKey})` }}
        aria-label="開箱"
        disabled={opening}
        onClick={handleOpen}
        whileTap={{ y: 2 }}
      >
        <img className="supply-box__body" src={medicalCaseBodySprite} alt="" draggable={false} />
        <span className="supply-box__interior" aria-hidden />
        <img className="supply-box__lid" src={medicalCaseLidSprite} alt="" draggable={false} />
        <span className="supply-box__burst" aria-hidden />
        <span className="supply-box__shine" aria-hidden />
      </motion.button>
      <p className="supply-box__hint" aria-hidden>
        點擊開箱
      </p>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function EquipmentResultModal({ item, wasPity, onClose }: Props) {
  const [step, setStep] = useState<RevealStep>('entry')

  // Reset to entry whenever a new item is shown
  useEffect(() => {
    if (item) setStep('entry')
  }, [item?.id])

  // Auto-advance timed steps
  useEffect(() => {
    if (!item) return
    const delay = STEP_AUTO_ADVANCE_MS[step]
    if (delay === undefined) return
    const timer = setTimeout(() => {
      const next = nextStep(step)
      if (next) setStep(next)
    }, delay)
    return () => clearTimeout(timer)
  }, [item, step])

  function advance() {
    const next = nextStep(step)
    if (next) setStep(next)
    else onClose()
  }

  if (!item) return null

  const meta = describeEquipment(item)
  const rarityVar = `var(--rarity-${item.rarity.toLowerCase()})`

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="modal-backdrop supply-ceremony"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // Tapping backdrop advances steps 1-3; entry requires opening the box.
          onClick={step !== 'entry' ? advance : undefined}
        >
          {/* ── Step 0: Supply box ── */}
          <AnimatePresence>
            {step === 'entry' && (
              <motion.div
                className="supply-ceremony__entry"
                initial={{ opacity: 0, y: 32, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.88, y: -24 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                onClick={(e) => e.stopPropagation()}
              >
                <TapToOpenBox onOpen={advance} rarity={item.rarity} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 1: Rarity colour flash ── */}
          <AnimatePresence>
            {step === 'rarity-flash' && (
              <motion.div
                className="recruit-ceremony__flash"
                style={{ background: rarityVar }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.span
                  className="recruit-ceremony__rarity-text"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: [0.4, 1.25, 1], opacity: 1 }}
                  transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                >
                  {item.rarity}
                </motion.span>
                <motion.span
                  className="recruit-ceremony__rarity-label"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {EQUIPMENT_RARITY_LABELS[item.rarity]}
                  {wasPity && ' · 保底'}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Steps 2 & 3: Equipment card ── */}
          <AnimatePresence>
            {(step === 'silhouette' || step === 'revealed') && (
              <motion.div
                className="modal-card supply-ceremony__card"
                style={{ ['--rarity-color' as string]: rarityVar }}
                initial={{ scale: 0.75, opacity: 0, y: 32 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (step === 'silhouette') advance()
                }}
              >
                <div className="modal-card__rarity">
                  <span className="modal-card__rarity-tier">{item.rarity}</span>
                  <span className="modal-card__rarity-label">{RARITY_LABELS[item.rarity]}</span>
                  {wasPity && <span className="modal-card__pity">保底</span>}
                </div>

                <div className="supply-ceremony__icon-wrap">
                  <EquipmentArtwork
                    item={item}
                    className={`supply-ceremony__icon${step === 'silhouette' ? ' supply-ceremony__icon--silhouette' : ''}`}
                  />
                </div>

                {/* Category tease visible from step 2 onward */}
                {!hasEquipmentHeroArt(item) && (
                  <p className="supply-ceremony__category-hint">
                    {EQUIPMENT_CATEGORY_LABELS[item.category]}
                  </p>
                )}

                {/* Full reveal */}
                <AnimatePresence>
                  {step === 'revealed' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28 }}
                    >
                      <h2 className="modal-card__name">{meta.name}</h2>
                      <p className="supply-ceremony__effect">{meta.effectText}</p>
                      <button
                        type="button"
                        className="modal-card__close"
                        onClick={(e) => { e.stopPropagation(); onClose() }}
                      >
                        收下
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {step !== 'revealed' && (
                  <p className="recruit-ceremony__tap-hint" aria-hidden>
                    點擊繼續
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
