/**
 * Milestone tips dispatcher — `redesign-hospital-economy` §9.5.5.
 *
 * Subscribes to live IDB state via Dexie's useLiveQuery and surfaces a single
 * `MilestoneTipToast` payload to the caller whenever a tip's threshold is first
 * crossed. Dismiss writes `tutorial.firedTips[tipId] = true` so each tip fires
 * at most once per save.
 *
 * Implements 4 of the 5 tips defined in `content-medexam2-tw/tutorial.ts`:
 *   - revenue_1000               : revenue ≥ 1000 (first crossing)
 *   - reputation_48k_gate_blocked: rep ≥ 48,000 AND diversification gate not met
 *   - tier_unlocked_fate_cards   : tier transition to 醫學中心
 *   - training_pity_5            : any doctor pityCounter ≥ 5
 *
 * `net_rate_slow` requires multi-tick history (5 consecutive ticks of slow net
 * rate) — deferred to a follow-up slice that adds a tick history buffer.
 */

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  MILESTONE_TIPS,
  TIER_DIVERSIFICATION_REQUIREMENTS,
  TIER_UPGRADE_THRESHOLDS,
  countDistinctSubjectsAtRarity,
  rarityIsAtLeast,
  type MilestoneTipId,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

interface PendingTip {
  id: MilestoneTipId
  message: string
}

const TIP_BY_ID = new Map(MILESTONE_TIPS.map((t) => [t.id, t]))

export function useMilestoneTips(): {
  pending: PendingTip | null
  dismiss: () => void
} {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const doctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []

  const [pending, setPending] = useState<PendingTip | null>(null)
  const [scheduled, setScheduled] = useState<MilestoneTipId | null>(null)

  // Evaluate triggers whenever live state changes
  useEffect(() => {
    if (!counters) return
    const fired = counters.tutorial?.firedTips ?? {}

    function pick(id: MilestoneTipId): PendingTip | null {
      if (fired[id]) return null
      const def = TIP_BY_ID.get(id)
      if (!def) return null
      return { id, message: def.message }
    }

    // 1. revenue_1000
    if (!fired.revenue_1000 && counters.revenue >= 1000) {
      const p = pick('revenue_1000')
      if (p && !scheduled) {
        setPending(p)
        setScheduled(p.id)
        return
      }
    }

    // 2. reputation_48k_gate_blocked — rep crosses 診所→區域醫院 threshold AND diversification unmet
    if (!fired.reputation_48k_gate_blocked && counters.tier === '診所') {
      const threshold = TIER_UPGRADE_THRESHOLDS['診所']
      if (threshold !== null && counters.reputation >= threshold) {
        const req = TIER_DIVERSIFICATION_REQUIREMENTS['診所']
        const distinct = countDistinctSubjectsAtRarity(doctors, req.minRarity)
        if (distinct < req.requiredCount) {
          const p = pick('reputation_48k_gate_blocked')
          if (p && !scheduled) {
            setPending(p)
            setScheduled(p.id)
            return
          }
        }
      }
    }

    // 3. tier_unlocked_fate_cards — tier === 醫學中心
    if (!fired.tier_unlocked_fate_cards && counters.tier === '醫學中心') {
      const p = pick('tier_unlocked_fate_cards')
      if (p && !scheduled) {
        setPending(p)
        setScheduled(p.id)
        return
      }
    }

    // 4. training_pity_5 — any doctor with pityCounter >= 5
    if (!fired.training_pity_5) {
      const hit = doctors.some((d) => d.pityCounter >= 5)
      if (hit) {
        const p = pick('training_pity_5')
        if (p && !scheduled) {
          setPending(p)
          setScheduled(p.id)
          return
        }
      }
    }

    // Hard P1 requirement reminder (not in MILESTONE_TIPS but useful) — skip
    // until net_rate_slow buffer infrastructure lands.

    // Reserved for future: also rarityIsAtLeast usage when more tips need it
    void rarityIsAtLeast
  }, [counters, doctors, scheduled])

  async function dismiss() {
    if (!pending) return
    const id = pending.id
    setPending(null)
    setScheduled(null)
    await db.transaction('rw', db.gameCounters, async () => {
      const c = await db.gameCounters.get('singleton')
      if (!c) return
      await db.gameCounters.put({
        ...c,
        tutorial: {
          ...c.tutorial,
          firedTips: { ...c.tutorial.firedTips, [id]: true },
        },
      })
    })
  }

  return { pending, dismiss }
}
