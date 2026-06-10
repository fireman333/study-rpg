import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import {
  getGuidedComplete,
  setGuidedComplete,
  getExpeditionSpotlightSeen,
  setExpeditionSpotlightSeen,
  maybeAutoCompleteForExistingPlayer,
  ONBOARDING_KEYS,
} from '../lib/services/onboarding'

/**
 * improve-neurons-onboarding §7.1 — device-local onboarding flags + the
 * existing-player auto-complete backstop + reset clear.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seedAnsweredQuestion(everWrong: boolean): Promise<void> {
  await db.questionHistory.put({
    questionId: 'q1',
    family: '藥理學',
    lastResult: everWrong ? 'wrong' : 'correct',
    everWrong,
    lastAnsweredAt: 1,
    updatedAt: 1,
  })
}

describe('onboarding flag get/set', () => {
  it('flags default to false on a fresh save', async () => {
    expect(await getGuidedComplete()).toBe(false)
    expect(await getExpeditionSpotlightSeen()).toBe(false)
  })

  it('set then get round-trips each flag', async () => {
    await setGuidedComplete()
    await setExpeditionSpotlightSeen()
    expect(await getGuidedComplete()).toBe(true)
    expect(await getExpeditionSpotlightSeen()).toBe(true)
  })
})

describe('maybeAutoCompleteForExistingPlayer', () => {
  it('leaves a brand-new save (no history) unmarked so the overlay shows', async () => {
    await maybeAutoCompleteForExistingPlayer()
    expect(await getGuidedComplete()).toBe(false)
  })

  it('marks an existing player (any answered history) as complete', async () => {
    await seedAnsweredQuestion(false)
    await maybeAutoCompleteForExistingPlayer()
    expect(await getGuidedComplete()).toBe(true)
  })

  it('is idempotent and never un-sets an already-complete flag', async () => {
    await setGuidedComplete()
    await maybeAutoCompleteForExistingPlayer() // no history, already complete
    expect(await getGuidedComplete()).toBe(true)
  })
})

describe('account reset clears onboarding flags (resetConnectomeForDebug pattern)', () => {
  it('deleting ONBOARDING_KEYS re-surfaces onboarding', async () => {
    await setGuidedComplete()
    await setExpeditionSpotlightSeen()
    // Mirror the in-transaction reset loop in resetConnectomeForDebug.
    for (const key of ONBOARDING_KEYS) await db.meta.delete(key)
    for (const key of ONBOARDING_KEYS) {
      expect(await db.meta.get(key)).toBeUndefined()
    }
    expect(await getGuidedComplete()).toBe(false)
  })
})
