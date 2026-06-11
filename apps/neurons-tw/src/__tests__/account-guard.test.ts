/**
 * Account-switch guard tests — ownership marker, gate decision, wipe scope,
 * adopt-account failure ordering, and push-trigger hook coverage locks.
 *
 * Spec: openspec/changes/fix-neurons-account-switch-guard/specs/neurons-cloud-sync/spec.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { db, type NeuronsDB } from '../lib/db'
import { NEURONS_ADAPTERS, SYNCED_META_KEYS } from '../lib/sync/tables'
import {
  adoptAccount,
  clearLocalSyncedData,
  evaluateAccountGate,
  readLastSyncedUserId,
  writeLastSyncedUserId,
} from '../lib/sync/account-guard'
import { attachTableHooks, detachTableHooks, SYNCED_TABLES } from '../lib/sync/useSync'

// ---- localStorage mock (vitest runs in node — no DOM storage) --------------

function installLocalStorageMock(): void {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  }
}

function removeLocalStorageMock(): void {
  delete (globalThis as Record<string, unknown>).localStorage
}

// ---- Seed rows: minimal valid PK per table (v20 schema) --------------------

const SEED_ROWS: Record<string, object> = {
  synapses: { pairKey: 'a|b', lastCoFireDate: '2026-06-01', state: 'wired' },
  familyAccrual: { familyId: '解剖學', ap: 5, pullCount: 1 },
  familyMastery: { familyId: '解剖學', correct: 3, total: 5 },
  neuronVariants: { familyId: '解剖學', slotIndex: 0, rolledAt: 1, copies: 1 },
  achievements: { id: 'ach-1', unlockedAt: 1, notificationShown: true },
  leaderboardProfile: { user_id: 'user-a', nickname_lower: 'wlk', last_pushed_at: 1 },
  dmnCards: { cardId: 'card-1', obtainedAt: 1, rarity: 'P4' },
  dmnEventLog: { cardId: 'card-1', dispatchedAt: 1 },
  dmnActiveBuffs: { expiresAt: Date.now() + 60_000, buffKind: 'family-buff', sourceCardId: 'card-1' },
  questionBookmarks: { questionId: 'q-1', family: '解剖學', addedAt: 1, updatedAt: 1 },
  questionBookmarkTombstones: { questionId: 'q-2', updatedAt: 1 },
  questionFlags: { questionId: 'q-1', easyMarked: true, guessedMarked: false, updatedAt: 1 },
  questionHistory: {
    questionId: 'q-1',
    family: '解剖學',
    lastResult: 'wrong',
    everWrong: true,
    lastAnsweredAt: 1,
    updatedAt: 1,
  },
  neuronInstances: { instanceId: 'inst-1', familyId: '解剖學', slotIndex: 0, rarity: 'P4', consumedAt: null },
  instanceNicknames: { instanceId: 'inst-1', nickname: '小藍', updatedAt: 1 },
  inventory: { kind: 'accelerant', count: 2, updatedAt: 1 },
  equipment: { equipmentId: 'eq-1', rarity: 'P4', obtainedAt: 1, updatedAt: 1 },
  connectorNeurons: { pairKey: 'a|b', unlockedAt: 1, updatedAt: 1 },
  mockExamVariants: { variantId: 'mv-1', rarity: 'P4', copies: 1, firstRolledAt: 1, lastRolledAt: 1 },
  mockExamDrafts: { paperKeyHash: '110-1-1', updatedAt: 1 },
}

const DEVICE_LOCAL_META_KEY = 'guidedComplete'
const SYNCED_META_SAMPLE = ['totalStudyMinutes', 'maxQuizCorrectStreak', 'firstPullFamilies']

async function seedAllTables(): Promise<void> {
  for (const [name, row] of Object.entries(SEED_ROWS)) {
    await db.table(name).put(row)
  }
  for (const key of SYNCED_META_SAMPLE) {
    await db.meta.put({ key, value: 'synced-value' } as never)
  }
  await db.meta.put({ key: DEVICE_LOCAL_META_KEY, value: 'device-local' } as never)
}

beforeEach(async () => {
  installLocalStorageMock()
  for (const name of Object.keys(SEED_ROWS)) {
    await db.table(name).clear()
  }
  await db.meta.clear()
})

afterEach(() => {
  removeLocalStorageMock()
  detachTableHooks(db)
})

// ---- Marker ----------------------------------------------------------------

describe('ownership marker', () => {
  it('read returns null when never written', () => {
    expect(readLastSyncedUserId()).toBeNull()
  })

  it('write then read round-trips', () => {
    writeLastSyncedUserId('user-a')
    expect(readLastSyncedUserId()).toBe('user-a')
  })

  it('fails open when localStorage is unavailable', () => {
    removeLocalStorageMock()
    expect(readLastSyncedUserId()).toBeNull()
    expect(() => writeLastSyncedUserId('user-a')).not.toThrow()
  })
})

// ---- Gate decision (three branches) ----------------------------------------

describe('evaluateAccountGate', () => {
  it('no marker → proceed-and-write (first sign-in / anonymous upgrade)', () => {
    expect(evaluateAccountGate(null, 'user-a')).toBe('proceed-and-write')
  })

  it('same user → proceed (returning account, no prompt)', () => {
    expect(evaluateAccountGate('user-a', 'user-a')).toBe('proceed')
  })

  it('different user → prompt (engine must stay unmounted)', () => {
    expect(evaluateAccountGate('user-a', 'user-b')).toBe('prompt')
  })
})

// ---- Wipe scope -------------------------------------------------------------

describe('clearLocalSyncedData', () => {
  it('clears all adapter tables + mockExamDrafts, prunes synced meta, keeps device-local meta', async () => {
    await seedAllTables()

    await clearLocalSyncedData(db)

    for (const name of Object.keys(SEED_ROWS)) {
      expect(await db.table(name).count(), `table ${name} should be empty`).toBe(0)
    }
    for (const key of SYNCED_META_SAMPLE) {
      expect(await db.meta.get(key), `synced meta ${key} should be deleted`).toBeUndefined()
    }
    const kept = await db.meta.get(DEVICE_LOCAL_META_KEY)
    expect(kept, 'device-local meta key should survive the wipe').toBeDefined()
  })

  it('covers every adapter-registered table (registry-derived, not hand-listed)', () => {
    const seeded = new Set(Object.keys(SEED_ROWS))
    for (const adapter of NEURONS_ADAPTERS) {
      if (adapter.name === 'meta') continue
      expect(seeded.has(adapter.name), `seed map missing adapter table ${adapter.name}`).toBe(true)
    }
  })
})

// ---- Adopt-account failure ordering -----------------------------------------

describe('adoptAccount', () => {
  it('wipes then writes the marker', async () => {
    await seedAllTables()
    writeLastSyncedUserId('user-a')

    await adoptAccount(db, 'user-b')

    expect(readLastSyncedUserId()).toBe('user-b')
    expect(await db.questionHistory.count()).toBe(0)
  })

  it('does NOT write the marker when the wipe throws', async () => {
    writeLastSyncedUserId('user-a')
    const brokenDb = {
      table: () => {
        throw new Error('boom')
      },
    } as unknown as NeuronsDB

    await expect(adoptAccount(brokenDb, 'user-b')).rejects.toThrow('boom')
    expect(readLastSyncedUserId()).toBe('user-a')
  })
})

// ---- Push-trigger hook coverage locks ---------------------------------------

describe('push-trigger hook coverage', () => {
  it('SYNCED_TABLES is exactly the adapter registry', () => {
    const adapterNames = new Set(NEURONS_ADAPTERS.map((a) => a.name))
    expect(SYNCED_TABLES).toEqual(adapterNames)
  })

  it('every adapter name resolves to a real Dexie table (no silent hook skip)', () => {
    const tableNames = new Set(db.tables.map((t) => t.name))
    for (const adapter of NEURONS_ADAPTERS) {
      expect(tableNames.has(adapter.name), `adapter ${adapter.name} has no Dexie table`).toBe(true)
    }
  })

  it('SYNCED_META_KEYS is exported and non-empty (wipe + adapter share one source)', () => {
    expect(SYNCED_META_KEYS.size).toBeGreaterThan(0)
    expect(SYNCED_META_KEYS.has('totalStudyMinutes')).toBe(true)
  })

  it('regression: bookmark / flag / nickname writes schedule a push', async () => {
    const onChange = vi.fn()
    attachTableHooks(db, onChange)

    await db.questionBookmarks.put({ questionId: 'q-9', family: '解剖學', addedAt: 1, updatedAt: 1 } as never)
    await db.questionFlags.put({ questionId: 'q-9', easyMarked: true, guessedMarked: false, updatedAt: 1 } as never)
    await db.instanceNicknames.put({ instanceId: 'inst-9', nickname: '阿米巴', updatedAt: 1 } as never)

    expect(onChange).toHaveBeenCalledTimes(3)
  })
})
