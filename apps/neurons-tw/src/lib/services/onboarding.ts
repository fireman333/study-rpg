/**
 * New-player onboarding state (improve-neurons-onboarding; rebuilt as a full
 * guided tour by rebuild-neurons-onboarding-as-guided-tour — same two flags,
 * NO new keys).
 *
 * Pure device-local `meta` flags — NOT in SYNCED_META_KEYS, NO Dexie schema
 * bump, NO R2 bundle change. Onboarding is a one-time first-run EXPERIENCE,
 * not cross-device game progress, so it stays local (mirrors the existing
 * `homepageOnboardingDismissed` pattern). The account-reset path
 * (`resetConnectomeForDebug`) clears these so a reset player re-experiences it.
 *
 * Two onboarding moments, two flags:
 *   - guidedComplete           — the guided tour (welcome card + element
 *                                spotlights) finished or was skipped.
 *   - expeditionSpotlightSeen  — the just-in-time benefit spotlight has fired once.
 *
 * Tour step definitions / transition logic live in `onboarding-tour.ts`
 * (pure + unit-tested); the React side is `components/onboarding/`.
 *
 * The ⚔️ expedition entry's one-way reveal is NOT a separate flag — it derives
 * from the monotonic `questionHistory.everWrong` signal in OverviewPage (already
 * maintained for the wrong-answer list), which is itself the persistent latch.
 *
 * Spec: openspec/specs/neurons-onboarding/spec.md
 */
import { db } from '../db'

export const ONBOARDING_GUIDED_COMPLETE_KEY = 'neurons:onboarding:guidedComplete'
export const ONBOARDING_EXPEDITION_SPOTLIGHT_SEEN_KEY = 'neurons:onboarding:expeditionSpotlightSeen'

/** All onboarding flag keys — cleared together on account reset. */
export const ONBOARDING_KEYS = [
  ONBOARDING_GUIDED_COMPLETE_KEY,
  ONBOARDING_EXPEDITION_SPOTLIGHT_SEEN_KEY,
] as const

/**
 * Legacy onboarding meta keys left behind by an earlier implementation
 * (`improve-neurons-onboarding`). No current code reads these — the ⚔️ expedition reveal now
 * derives from the monotonic `questionHistory.everWrong` signal — so they are orphaned. Deleted on
 * a best-effort one-time startup pass (`cleanupLegacyOnboardingKeys`) and on account reset so no
 * stale onboarding key persists. Kept out of `SYNCED_META_KEYS` (device-local; never synced).
 */
export const ONBOARDING_LEGACY_KEYS = ['neurons:onboarding:expeditionRevealed'] as const

/** Best-effort deletion of orphaned onboarding keys. Never throws / never blocks boot. */
export async function cleanupLegacyOnboardingKeys(): Promise<void> {
  for (const key of ONBOARDING_LEGACY_KEYS) {
    try {
      await db.meta.delete(key)
    } catch (err) {
      console.warn(`[onboarding] legacy key cleanup ${key} failed:`, err)
    }
  }
}

async function getFlag(key: string): Promise<boolean> {
  try {
    return (await db.meta.get(key))?.value === 'true'
  } catch {
    // Fail closed (don't nag / don't re-reveal) on a read error.
    return true
  }
}

async function setFlag(key: string): Promise<void> {
  try {
    await db.meta.put({ key, value: 'true' })
  } catch (err) {
    console.warn(`[onboarding] persist ${key} failed:`, err)
  }
}

export const getGuidedComplete = (): Promise<boolean> => getFlag(ONBOARDING_GUIDED_COMPLETE_KEY)
export const setGuidedComplete = (): Promise<void> => setFlag(ONBOARDING_GUIDED_COMPLETE_KEY)

export const getExpeditionSpotlightSeen = (): Promise<boolean> =>
  getFlag(ONBOARDING_EXPEDITION_SPOTLIGHT_SEEN_KEY)
export const setExpeditionSpotlightSeen = (): Promise<void> =>
  setFlag(ONBOARDING_EXPEDITION_SPOTLIGHT_SEEN_KEY)

/**
 * Migration-friendly default: an EXISTING player (one who has already answered
 * any question) should not be shown the first-run guided overlay on the ship of
 * this change. If `guidedComplete` is unset but the save already has answered
 * history, mark it complete (they can still replay from HelpMenu). A brand-new
 * save (zero history) is left unmarked so the overlay shows. Idempotent.
 */
export async function maybeAutoCompleteForExistingPlayer(): Promise<void> {
  try {
    if (await getGuidedComplete()) return
    const answered = await db.questionHistory.count()
    if (answered > 0) await setGuidedComplete()
  } catch (err) {
    console.warn('[onboarding] existing-player auto-complete check failed:', err)
  }
}

// --- Replay bus -------------------------------------------------------------
// Lightweight module-level emitter (mirrors maze-focus.ts) so HelpMenu can ask
// the OnboardingHost to re-run the guided overlay after it has been completed
// or skipped. In-memory only; nothing persisted.

type ReplayListener = () => void
const replayListeners = new Set<ReplayListener>()

/** Subscribe to guided-onboarding replay requests. Returns unsubscribe. */
export function onReplayGuided(listener: ReplayListener): () => void {
  replayListeners.add(listener)
  return () => replayListeners.delete(listener)
}

/** Ask the OnboardingHost to re-run the guided overlay (HelpMenu「重看新手引導」). */
export function requestReplayGuided(): void {
  replayListeners.forEach((l) => {
    try {
      l()
    } catch (err) {
      console.error('[onboarding] replay listener threw:', err)
    }
  })
}
