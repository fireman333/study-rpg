/**
 * Answer-feedback signal bus (polish-neurons-juice-animations / capability
 * neurons-juice-animations).
 *
 * A one-shot UI-feedback signal pushed from the answer flow
 * (`connectome.recordCorrectAnswer` / `recordIncorrectAnswer`) to the visible
 * expedition band (`MazeExpedition`):
 *   - CORRECT → companion marchers blink/pulse once.
 *   - WRONG   → the band plays a one-shot synapse-decay dim.
 *
 * Kept separate from the `connectome/events.ts` data-event bus on purpose: that
 * bus carries semantic domain events (synapse formed/strengthened/decayed);
 * these are purely presentational feedback signals. Mirrors the lightweight
 * module-level emitter pattern of `maze-focus.ts` (and masteryEvents / the
 * first-pull bridge).
 *
 * Purely in-memory + ephemeral: no Dexie / R2 write, nothing persisted, nothing
 * replayed cross-device. Best-effort — a thrown listener never breaks the
 * answer flow.
 */

type AnswerListener = (familyId: string) => void

const correctListeners = new Set<AnswerListener>()
const wrongListeners = new Set<AnswerListener>()

function emit(listeners: Set<AnswerListener>, familyId: string, channel: string): void {
  listeners.forEach((l) => {
    try {
      l(familyId)
    } catch (e) {
      console.error(`[answer-feedback] ${channel} listener threw`, e)
    }
  })
}

/** Subscribe to correct-answer feedback (the expedition band). Returns unsubscribe. */
export function onAnswerCorrect(listener: AnswerListener): () => void {
  correctListeners.add(listener)
  return () => correctListeners.delete(listener)
}

/** Subscribe to wrong-answer feedback (the expedition band). Returns unsubscribe. */
export function onAnswerWrong(listener: AnswerListener): () => void {
  wrongListeners.add(listener)
  return () => wrongListeners.delete(listener)
}

/** Signal a correct answer for `familyId` (companion pulse). */
export function emitAnswerCorrect(familyId: string): void {
  emit(correctListeners, familyId, 'correct')
}

/** Signal a wrong answer for `familyId` (band synapse-decay dim). */
export function emitAnswerWrong(familyId: string): void {
  emit(wrongListeners, familyId, 'wrong')
}
