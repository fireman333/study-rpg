/**
 * Hospital event toast queue — minimal pub-sub singleton.
 *
 * Toast-class hospital events (負面新聞 / 學會質疑 / 學會獎項) don't write
 * `pendingEventId` — they apply their outcome immediately, write an
 * `eventLog` row, and need a transient UI banner. Pre-rewire this was
 * delivered via `useStudySessionTick`'s `onToastEvent` callback. After
 * `rewire-hospital-events-to-non-reading-trigger` the trigger sits in
 * `services/non-reading-event-trigger.ts` and is fired from multiple
 * hook sites (QuizModal answer, App.tsx nav effect), so we centralize
 * delivery here.
 *
 * Pattern mirrors `achievement-toast-queue.ts`.
 */

import type { EventDefinition, ToastEventOutcome } from '@study-rpg/content-medexam2-tw'

export interface HospitalToastEntry {
  event: EventDefinition
  outcome: ToastEventOutcome
}

type Listener = (latest: HospitalToastEntry | null) => void

class HospitalEventToastQueueImpl {
  private latest: HospitalToastEntry | null = null
  private listeners = new Set<Listener>()

  push(entry: HospitalToastEntry): void {
    this.latest = entry
    this.emit()
  }

  clear(): void {
    if (this.latest === null) return
    this.latest = null
    this.emit()
  }

  snapshot(): HospitalToastEntry | null {
    return this.latest
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.latest)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const snap = this.latest
    for (const l of this.listeners) l(snap)
  }
}

export const hospitalEventToastQueue = new HospitalEventToastQueueImpl()
