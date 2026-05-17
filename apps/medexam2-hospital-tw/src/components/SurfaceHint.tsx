/**
 * Surface hint card — `redesign-hospital-economy` §9.5.2.
 *
 * Per-page first-visit hint. Reads `tutorial.firstVisit[surfaceId]` from
 * `gameCounters.singleton`; if missing, renders an overlay card with the
 * matching `SURFACE_HINTS` entry from the content pack. Dismiss writes
 * `firstVisit[surfaceId] = true` so the hint stays seen across reloads.
 *
 * Layer L2 of the tutorial system (per design D10):
 *   L1 onboarding modal — first save, sequential
 *   L2 surface hints — first visit to each surface, one-shot
 *   L3 milestone tips — toast on threshold cross
 *   L4 help menu — always available
 */

import { useLiveQuery } from 'dexie-react-hooks'
import {
  SURFACE_HINTS,
  type TutorialSurfaceId,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

export interface SurfaceHintProps {
  surfaceId: TutorialSurfaceId
}

export function SurfaceHint({ surfaceId }: SurfaceHintProps) {
  const counters = useLiveQuery(() => getHospitalDB().gameCounters.get('singleton'))
  if (!counters) return null
  const seen = counters.tutorial?.firstVisit?.[surfaceId] === true
  if (seen) return null

  const hint = SURFACE_HINTS.find((h) => h.id === surfaceId)
  if (!hint) return null

  const dismiss = async () => {
    const db = getHospitalDB()
    await db.transaction('rw', db.gameCounters, async () => {
      const row = await db.gameCounters.get('singleton')
      if (!row) return
      const tutorial = row.tutorial ?? { completedSteps: {}, firstVisit: {}, firedTips: {} }
      await db.gameCounters.put({
        ...row,
        tutorial: {
          ...tutorial,
          firstVisit: { ...(tutorial.firstVisit ?? {}), [surfaceId]: true },
        },
      })
    })
  }

  return (
    <div className="surface-hint" role="status" aria-live="polite">
      <span className="surface-hint__icon" aria-hidden>💡</span>
      <div className="surface-hint__body">
        <h3 className="surface-hint__title">{hint.title}</h3>
        <p className="surface-hint__text">{hint.body}</p>
      </div>
      <button
        type="button"
        className="surface-hint__close"
        onClick={() => void dismiss()}
        aria-label="關閉提示"
      >
        ×
      </button>
    </div>
  )
}
