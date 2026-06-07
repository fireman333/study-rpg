/**
 * Maze contextual-camera focus bus (redesign-neurons-maze-rotjs-grid;
 * manual sticky focus + recenter added by add-neurons-maze-zoom-and-focus).
 *
 * Two emit paths:
 *   - AUTO (manual=false): a correct answer in subject S emits S's familyId; the
 *     renderer zooms the camera to that family's walker for a few seconds, then
 *     falls back to the whole-map framing.
 *   - MANUAL (manual=true): tapping a subject in the family picker (or starting a
 *     per-subject reading session) emits a STICKY focus — the renderer holds the
 *     family framing until the next user interaction (pan/zoom/another family/
 *     recenter). An auto-focus does NOT interrupt an active sticky manual focus.
 *
 * `emitMazeRecenter` clears any sticky focus and returns to the whole-map framing.
 * Lightweight module-level emitters (mirror masteryEvents / first-pull bridge).
 * Best-effort — a thrown listener never breaks the answer / reading flow.
 */

type FocusListener = (familyId: string, manual: boolean) => void
type RecenterListener = () => void

const focusListeners = new Set<FocusListener>()
const recenterListeners = new Set<RecenterListener>()

/** Subscribe to maze-focus requests (the renderer). Returns unsubscribe. */
export function onMazeFocus(listener: FocusListener): () => void {
  focusListeners.add(listener)
  return () => focusListeners.delete(listener)
}

/**
 * Request a camera focus on a family. `opts.manual === true` makes it a sticky
 * focus (family picker tap / reading start); the default (auto) is the time-boxed
 * answer-driven focus.
 */
export function emitMazeFocus(familyId: string, opts?: { manual?: boolean }): void {
  const manual = opts?.manual ?? false
  focusListeners.forEach((l) => {
    try {
      l(familyId, manual)
    } catch (e) {
      console.error('[maze-focus] focus listener threw', e)
    }
  })
}

/** Subscribe to recenter requests (the renderer). Returns unsubscribe. */
export function onMazeRecenter(listener: RecenterListener): () => void {
  recenterListeners.add(listener)
  return () => recenterListeners.delete(listener)
}

/** Clear sticky focus and return the camera to the whole-map framing. */
export function emitMazeRecenter(): void {
  recenterListeners.forEach((l) => {
    try {
      l()
    } catch (e) {
      console.error('[maze-recenter] listener threw', e)
    }
  })
}
