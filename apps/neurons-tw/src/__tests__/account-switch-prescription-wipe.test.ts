import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { clearLocalSyncedData } from '../lib/sync/account-guard'
import { IMPRINT_PREFIX, PRESCRIPTION_META_PREFIX } from '../lib/services/prescription'

/**
 * fix-neurons-account-switch-prescription-wipe — the account-switch / in-place-reset wipe
 * must clear the WHOLE local-only `prescription:v1:` namespace, not just the synced imprint
 * sub-prefix. The daily-quest state (completed / plan / reward / …) is account-OWNED: it drives
 * the account's NG-0717 maturation stage, so leaving it bleeds the outgoing account's stage /
 * keepsake into the next account (the "混血 NG-0717" leak). Device-local UI prefs that live
 * OUTSIDE `prescription:v1:` (e.g. `prescription:homeCollapsed`, onboarding flags) must survive.
 */

// clearLocalSyncedData touches localStorage (etag / presign cache) — mock it under node.
function installLocalStorageMock(): void {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  }
}

beforeEach(async () => {
  installLocalStorageMock()
  await db.delete()
  await db.open()
})
afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage
})

describe('account-switch wipe clears the whole prescription:v1 namespace', () => {
  it('the wipe prefix is the daily-prescription namespace and subsumes the imprint prefix', () => {
    // Single-sourced from the prescription service; pin the literal so a rename is a
    // deliberate, visible test change. The imprint keepsake prefix is a sub-prefix.
    expect(PRESCRIPTION_META_PREFIX).toBe('prescription:v1:')
    expect(IMPRINT_PREFIX.startsWith(PRESCRIPTION_META_PREFIX)).toBe(true)
  })

  it('wipes every prescription:v1:* key (daily state + NG-0717 stage + imprint) but keeps device-local keys', async () => {
    // Full local-only daily-prescription state for the OUTGOING account…
    const prescriptionKeys = [
      `${PRESCRIPTION_META_PREFIX}plan:2026-07-05`,
      `${PRESCRIPTION_META_PREFIX}wrong:2026-07-05:q1`,
      `${PRESCRIPTION_META_PREFIX}breadth:2026-07-05:q2`,
      `${PRESCRIPTION_META_PREFIX}completed:2026-07-05`, // drives NG-0717 maturation stage
      `${PRESCRIPTION_META_PREFIX}reward:2026-07-05`,
      `${PRESCRIPTION_META_PREFIX}lightsOut:2026-07-05`,
      `${PRESCRIPTION_META_PREFIX}localSeed`,
      `${IMPRINT_PREFIX}藥理學:2026-07-05`, // synced keepsake bud (sub-prefix)
      `${IMPRINT_PREFIX}生理學:2026-07-01`,
    ]
    for (const key of prescriptionKeys) await db.meta.put({ key, value: '1' })
    // …plus a synced allowlist key and two genuinely device-local keys that must survive.
    await db.meta.put({ key: 'totalStudyMinutes', value: '30' }) // synced → wiped
    await db.meta.put({ key: 'prescription:homeCollapsed', value: '1' }) // device-local → survives
    await db.meta.put({ key: 'guidedComplete', value: '1' }) // onboarding flag → survives

    await clearLocalSyncedData(db)

    // Every prescription:v1:* key is gone — no stage / keepsake / progress leaks to the next account.
    for (const key of prescriptionKeys) {
      expect(await db.meta.get(key), `${key} should be wiped`).toBeUndefined()
    }
    // Synced allowlist meta is still wiped (unchanged behaviour).
    expect(await db.meta.get('totalStudyMinutes')).toBeUndefined()
    // Device-local prefs OUTSIDE prescription:v1: survive.
    expect((await db.meta.get('prescription:homeCollapsed'))?.value).toBe('1')
    expect((await db.meta.get('guidedComplete'))?.value).toBe('1')
  })
})
