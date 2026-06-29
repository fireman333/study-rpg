/**
 * Shared persistence for the 神經元遠征隊 animation band visibility preference
 * (rework-neurons-squads). Single source of truth for the localStorage key so the
 * maze homepage band and the QuizModal compact band honor the same opt-out choice.
 *
 * Opt-out semantics: the band shows by default; this flag records an explicit hide.
 *
 * The preference is also a tiny same-tab reactive store (polish-neurons-quiz-hide):
 * any surface that writes it (an on-band `×` hide, or the Help-menu restore) notifies
 * subscribed consumers, so every currently-mounted band reflects the change live —
 * no remount / reload — via `useExpeditionHidden()`.
 */
import { useSyncExternalStore } from 'react'

const EXPEDITION_HIDDEN_KEY = 'neurons:maze:expeditionHidden'

/** Same-tab subscribers re-read the preference when it changes. */
const listeners = new Set<() => void>()

/** True when the player has hidden the expedition band (default false = shown). */
export function getExpeditionHidden(): boolean {
  try {
    return localStorage.getItem(EXPEDITION_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Persist the hide preference (no-op on storage failure, e.g. private mode), then
 * notify subscribers so mounted bands update live. */
export function setExpeditionHiddenPref(hidden: boolean): void {
  try {
    localStorage.setItem(EXPEDITION_HIDDEN_KEY, hidden ? '1' : '0')
  } catch {
    /* private mode / storage disabled — preference simply doesn't persist */
  }
  listeners.forEach((fn) => fn())
}

/** Subscribe to preference changes; returns an unsubscribe fn. */
export function subscribeExpeditionHidden(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Live-reactive read of the hide preference (re-renders on any same-tab change). */
export function useExpeditionHidden(): boolean {
  return useSyncExternalStore(subscribeExpeditionHidden, getExpeditionHidden, () => false)
}
