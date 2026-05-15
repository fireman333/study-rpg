import { motion, AnimatePresence } from 'framer-motion'
import { RARITY_LABELS } from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { lookupSprite } from '../lib/sprite-lookup'
import type { DoctorRow } from '../db/schema'

interface Props {
  doctor: DoctorRow | null
  wasPity: boolean
  onClose: () => void
}

export function RecruitmentResultModal({ doctor, wasPity, onClose }: Props) {
  return (
    <AnimatePresence>
      {doctor && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-card"
            style={{ ['--rarity-color' as string]: `var(--rarity-${doctor.rarity.toLowerCase()})` }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-card__rarity">
              <span className="modal-card__rarity-tier">{doctor.rarity}</span>
              <span className="modal-card__rarity-label">{RARITY_LABELS[doctor.rarity]}</span>
              {wasPity && <span className="modal-card__pity">保底</span>}
            </div>
            <div className="modal-card__sprite">
              {(() => {
                const spriteUrl = lookupSprite(doctor.spriteKey, THEME_PIXEL_HOSPITAL.sprites, doctor.rarity)
                return spriteUrl ? (
                  <img src={spriteUrl} alt="" className="modal-card__sprite-img" />
                ) : (
                  <span className="modal-card__sprite-emoji" aria-hidden>🩺</span>
                )
              })()}
            </div>
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
            </dl>
            <button type="button" className="modal-card__close" onClick={onClose}>
              收下
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
