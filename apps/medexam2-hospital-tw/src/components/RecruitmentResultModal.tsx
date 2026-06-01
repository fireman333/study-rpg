import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { RARITY_LABELS, getRoomHintForSubject } from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { lookupSprite } from '../lib/sprite-lookup'
import type { DoctorRow } from '../db/schema'
import lobbySprite from '../assets/recruitment/lobby.png'
import doorLeftSprite from '../assets/recruitment/door-left.png'
import doorRightSprite from '../assets/recruitment/door-right.png'
import { EmojiIcon } from './EmojiIcon'

// entry → hospital doors → rarity-flash → (900ms) → silhouette → (1100ms) → revealed → (tap) → close
type RevealStep = 'entry' | 'rarity-flash' | 'silhouette' | 'revealed'

interface Props {
  doctor: DoctorRow | null
  wasPity: boolean
  onClose: () => void
}

const STEP_AUTO_ADVANCE_MS: Partial<Record<RevealStep, number>> = {
  'rarity-flash': 900,
  'silhouette': 1100,
}

function nextStep(current: RevealStep): RevealStep | null {
  if (current === 'entry') return 'rarity-flash'
  if (current === 'rarity-flash') return 'silhouette'
  if (current === 'silhouette') return 'revealed'
  return null
}

interface EntranceProps {
  doctor: DoctorRow
  rarityVar: string
  spriteUrl: string | undefined
  onOpen: () => void
}

function HospitalEntrance({ doctor, rarityVar, spriteUrl, onOpen }: EntranceProps) {
  const [opening, setOpening] = useState(false)

  function handleOpen() {
    if (opening) return
    setOpening(true)
    window.setTimeout(onOpen, 780)
  }

  return (
    <motion.div
      className="recruit-entrance"
      style={{ ['--rarity-color' as string]: rarityVar }}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, y: -18 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`recruit-entrance__stage${opening ? ' recruit-entrance__stage--opening' : ''}`}
        onClick={handleOpen}
        disabled={opening}
      >
        <img className="recruit-entrance__lobby" src={lobbySprite} alt="" draggable={false} />
        <span className="recruit-entrance__light" aria-hidden />
        <span className="recruit-entrance__spark recruit-entrance__spark--one" aria-hidden />
        <span className="recruit-entrance__spark recruit-entrance__spark--two" aria-hidden />
        <span className="recruit-entrance__spark recruit-entrance__spark--three" aria-hidden />

        <span className="recruit-entrance__doctor" aria-hidden>
          {spriteUrl ? (
            <img src={spriteUrl} alt="" draggable={false} />
          ) : (
            <span className="recruit-entrance__doctor-emoji">🩺</span>
          )}
        </span>

        <span className="recruit-entrance__doors" aria-hidden>
          <img
            className="recruit-entrance__door recruit-entrance__door--left"
            src={doorLeftSprite}
            alt=""
            draggable={false}
          />
          <img
            className="recruit-entrance__door recruit-entrance__door--right"
            src={doorRightSprite}
            alt=""
            draggable={false}
          />
        </span>

        <span className="recruit-entrance__cta">
          {opening ? `${doctor.rarity} 面談中` : '開始面談'}
        </span>
      </button>
    </motion.div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function RecruitmentResultModal({ doctor, wasPity, onClose }: Props) {
  const [step, setStep] = useState<RevealStep>('entry')

  // Reset to entry step whenever a new doctor is shown
  useEffect(() => {
    if (doctor) setStep('entry')
  }, [doctor?.id])

  // Auto-advance timed steps
  useEffect(() => {
    if (!doctor) return
    const delay = STEP_AUTO_ADVANCE_MS[step]
    if (delay === undefined) return
    const timer = setTimeout(() => {
      const next = nextStep(step)
      if (next) setStep(next)
    }, delay)
    return () => clearTimeout(timer)
  }, [doctor, step])

  function advance() {
    const next = nextStep(step)
    if (next) setStep(next)
    else onClose()
  }

  const rarityVar = `var(--rarity-${doctor?.rarity.toLowerCase()})`
  const doctorSpriteUrl = doctor
    ? lookupSprite(doctor.spriteKey, THEME_PIXEL_HOSPITAL.sprites, doctor.rarity)
    : undefined

  return (
    <AnimatePresence>
      {doctor && (
        <motion.div
          className="modal-backdrop recruit-ceremony"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // Tapping the backdrop advances steps 1-3; entry requires explicit swipe
          onClick={step !== 'entry' ? advance : undefined}
        >

          {/* ── Step 0: Hospital entrance ceremony ── */}
          <AnimatePresence>
            {step === 'entry' && (
              <HospitalEntrance
                doctor={doctor}
                rarityVar={rarityVar}
                spriteUrl={doctorSpriteUrl}
                onOpen={advance}
              />
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
                transition={{ duration: 0.35 }}
              >
                <motion.span
                  className="recruit-ceremony__rarity-text"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: [0.4, 1.25, 1], opacity: 1 }}
                  transition={{ duration: 0.55, times: [0, 0.6, 1] }}
                >
                  {doctor.rarity}
                </motion.span>
                <motion.span
                  className="recruit-ceremony__rarity-label"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  {RARITY_LABELS[doctor.rarity]}
                  {wasPity && ' · 保底'}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Steps 2 & 3: Doctor card ── */}
          <AnimatePresence>
            {(step === 'silhouette' || step === 'revealed') && (
              <motion.div
                className="modal-card"
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
                  <span className="modal-card__rarity-tier">{doctor.rarity}</span>
                  <span className="modal-card__rarity-label">{RARITY_LABELS[doctor.rarity]}</span>
                  {wasPity && <span className="modal-card__pity">保底</span>}
                </div>

                <div className="modal-card__sprite">
                  {(() => {
                    return doctorSpriteUrl ? (
                      <img
                        src={doctorSpriteUrl}
                        alt=""
                        className={`modal-card__sprite-img${step === 'silhouette' ? ' recruit-ceremony__sprite--silhouette' : ''}`}
                      />
                    ) : (
                      <span
                        className={`modal-card__sprite-emoji${step === 'silhouette' ? ' recruit-ceremony__sprite--silhouette' : ''}`}
                        aria-hidden
                      >
                        <EmojiIcon char="🩺" size={64} />
                      </span>
                    )
                  })()}
                </div>

                {/* Specialty tease visible from step 2 onward */}
                <p className="recruit-ceremony__specialty">{doctor.subjectId}</p>

                {/* Full reveal: name, stats, close button */}
                <AnimatePresence>
                  {step === 'revealed' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <h2 className="modal-card__name">{doctor.name}</h2>
                      <dl className="modal-card__meta">
                        <div>
                          <dt>科別</dt>
                          <dd>{doctor.subjectId}</dd>
                        </div>
                        <div>
                          <dt>×力</dt>
                          <dd>{doctor.powerMultiplier.toFixed(1)}</dd>
                        </div>
                        <div>
                          <dt>適合</dt>
                          <dd>{getRoomHintForSubject(doctor.subjectId)}</dd>
                        </div>
                      </dl>
                      <button type="button" className="modal-card__close" onClick={onClose}>
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
