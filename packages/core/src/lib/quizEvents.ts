/** Process-singleton quiz event emitter. */

export type QuizEventName = 'correct-answer'

type Listener = () => void

const listeners: Map<QuizEventName, Set<Listener>> = new Map()

export const quizEvents = {
  on(event: QuizEventName, listener: Listener): () => void {
    let bucket = listeners.get(event)
    if (!bucket) {
      bucket = new Set()
      listeners.set(event, bucket)
    }
    bucket.add(listener)
    return () => bucket!.delete(listener)
  },
  emit(event: QuizEventName): void {
    const bucket = listeners.get(event)
    if (!bucket) return
    for (const listener of bucket) {
      try {
        listener()
      } catch (err) {
        if (typeof console !== 'undefined') console.error('[quizEvents] listener threw', err)
      }
    }
  },
}
