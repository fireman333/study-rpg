/** Per-Q reputation hook factory. */

import { quizEvents, type SubjectId } from '@study-rpg/core'
import { computeThroughput, type Room } from './rooms'
import type { Rarity } from './recruitment'

/** Minimal doctor shape the listener needs. Matches `DoctorRow` in
 *  `apps/medexam2-hospital-tw/src/db/schema.ts` (a subset). */
export interface PerQDoctor {
  id: string
  rarity: Rarity
  subjectId: SubjectId
  powerMultiplier: number
}

export interface PerQReputationListenerOptions {
  /** Async fetch all rooms (current state). */
  getRooms: () => Promise<Pick<Room, 'baseRate' | 'roomFacility' | 'type' | 'assignedDoctorId'>[]>
  /** Async fetch all doctors (current state). */
  getDoctors: () => Promise<PerQDoctor[]>
  /** Atomically add `delta.reputation` to the persistent reputation counter. */
  updateCounters: (delta: { reputation: number }) => Promise<void>
  /** Optional error sink (otherwise logs to console). */
  onError?: (err: unknown) => void
}

/** Per-Q reputation share of total throughput (the other 70% is idle tick). */
export const PER_Q_REPUTATION_SHARE = 0.3

export function createPerQReputationListener(
  opts: PerQReputationListenerOptions,
): () => void {
  const handler = () => {
    void runOnce(opts).catch((err) => {
      if (opts.onError) opts.onError(err)
      else if (typeof console !== 'undefined') console.error('[reputation] per-Q hook failed', err)
    })
  }
  return quizEvents.on('correct-answer', handler)
}

async function runOnce(opts: PerQReputationListenerOptions): Promise<void> {
  const [rooms, doctors] = await Promise.all([opts.getRooms(), opts.getDoctors()])
  const doctorMap = new Map(doctors.map((d) => [d.id, d]))
  let totalThroughput = 0
  for (const room of rooms) {
    const doctor = room.assignedDoctorId ? doctorMap.get(room.assignedDoctorId) ?? null : null
    totalThroughput += computeThroughput(room, doctor)
  }
  if (totalThroughput === 0) return
  const deltaReputation = (PER_Q_REPUTATION_SHARE * totalThroughput) / 60
  await opts.updateCounters({ reputation: deltaReputation })
}
