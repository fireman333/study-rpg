/**
 * Maze contextual-camera focus bus (redesign-neurons-maze-rotjs-grid).
 *
 * A correct answer in subject S emits S's familyId; the maze renderer subscribes
 * and zooms its camera to that family's walker for a few seconds (the design-D
 * "answering a quiz zooms to the answered family's walker"), then falls back to
 * the whole-map framing. Lightweight module-level emitter (mirrors masteryEvents
 * / first-pull request bridge). Best-effort — a thrown listener never breaks the
 * answer flow.
 */

type FocusListener = (familyId: string) => void

const listeners = new Set<FocusListener>()

/** Subscribe to maze-focus requests (the renderer). Returns unsubscribe. */
export function onMazeFocus(listener: FocusListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Fired post-commit by a correct answer → the maze camera zooms to family S. */
export function emitMazeFocus(familyId: string): void {
  listeners.forEach((l) => {
    try {
      l(familyId)
    } catch (e) {
      console.error('[maze-focus] listener threw', e)
    }
  })
}
