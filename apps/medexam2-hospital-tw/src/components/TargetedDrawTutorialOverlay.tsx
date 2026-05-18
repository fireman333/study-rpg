/**
 * One-shot tutorial overlay shown BEFORE the subject picker on the player's
 * very first epic or legendary targeted draw. Subsequent draws of the same
 * tier skip this overlay (gated by `counters.tutorial.firedTips[<key>]`).
 *
 * Dismiss → persists the milestone flag → caller proceeds to open picker.
 */

import { useState } from 'react'
import { getHospitalDB } from '../db/schema'

export const FIRST_EPIC_TARGETED_KEY = 'firstEpicTargetedDraw'
export const FIRST_LEGENDARY_TARGETED_KEY = 'firstLegendaryTargetedDraw'

interface TargetedDrawTutorialOverlayProps {
  tier: 'epic' | 'legendary'
  onDismiss: () => void
}

const COPY: Record<'epic' | 'legendary', { title: string; body: string }> = {
  epic: {
    title: '🎫 你抽到了第一張史詩 targeted ticket！',
    body: '選一科 unlocked 的 banner 指派給這張券，使用時保證 P3+ 等級。指派後不可改科 — 確認前會有再次提示，避免誤觸。',
  },
  legendary: {
    title: '🌟 傳奇 targeted ticket！',
    body: '同樣選一科指派，這次保證 P2+ 等級。一旦指派就無法改科 — 點選後會跳出二次確認，仔細想清楚再按「確認指派」。',
  },
}

export function TargetedDrawTutorialOverlay({
  tier,
  onDismiss,
}: TargetedDrawTutorialOverlayProps) {
  const [busy, setBusy] = useState(false)
  const key = tier === 'epic' ? FIRST_EPIC_TARGETED_KEY : FIRST_LEGENDARY_TARGETED_KEY
  const { title, body } = COPY[tier]

  async function handleDismiss() {
    setBusy(true)
    try {
      const db = getHospitalDB()
      await db.transaction('rw', db.gameCounters, async () => {
        const c = await db.gameCounters.get('singleton')
        if (!c) return
        await db.gameCounters.put({
          ...c,
          tutorial: {
            ...c.tutorial,
            firedTips: { ...c.tutorial.firedTips, [key]: true },
          },
        })
      })
      onDismiss()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && handleDismiss()}>
      <div
        className="modal frame targeted-tutorial-overlay"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="targeted ticket 教學"
      >
        <header className="targeted-tutorial-overlay__head">
          <h2>{title}</h2>
        </header>
        <div className="targeted-tutorial-overlay__body">
          <p>{body}</p>
        </div>
        <footer className="targeted-tutorial-overlay__foot">
          <button
            type="button"
            className="event-modal__primary-btn"
            disabled={busy}
            onClick={() => void handleDismiss()}
          >
            {busy ? '寫入中…' : '了解，繼續選科'}
          </button>
        </footer>
      </div>
    </div>
  )
}
