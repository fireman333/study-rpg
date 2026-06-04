/**
 * Shared persistence for the 神經元遠征隊 animation band visibility preference
 * (rework-neurons-squads). Single source of truth for the localStorage key so the
 * maze homepage band and the QuizModal compact band honor the same opt-out choice.
 *
 * Opt-out semantics: the band shows by default; this flag records an explicit hide.
 */
const EXPEDITION_HIDDEN_KEY = 'neurons:maze:expeditionHidden'

/** True when the player has hidden the expedition band (default false = shown). */
export function getExpeditionHidden(): boolean {
  try {
    return localStorage.getItem(EXPEDITION_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Persist the hide preference (no-op on storage failure, e.g. private mode). */
export function setExpeditionHiddenPref(hidden: boolean): void {
  try {
    localStorage.setItem(EXPEDITION_HIDDEN_KEY, hidden ? '1' : '0')
  } catch {
    /* private mode / storage disabled — preference simply doesn't persist */
  }
}
