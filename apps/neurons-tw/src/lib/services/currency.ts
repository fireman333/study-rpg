/**
 * Neural-energy currency (Collection 2.0) — the study-gated gacha pull currency.
 *
 * Stored as two MONOTONIC meta counters so it syncs correctly cross-device via the
 * existing `backfill/counters.ts` MAX-merge post-pass (a plain balance key would
 * never propagate under the first-write-wins meta adapter, and an LWW envelope would
 * discard a device's earns + spends on conflict):
 *
 *   balance = neuralEnergyEarned − neuralEnergySpent   (derived, never negative)
 *
 * Faucet: +CORRECT_ANSWER_ENERGY per correct answer (connectome tx) +
 * READING_MINUTE_ENERGY per accrued reading minute (reading-timer). Sink: PULL_COST
 * per pull (gacha tx). Numbers live in @study-rpg/content-neurons-tw (dogfood-tuned).
 *
 * Known limitation: concurrent OFFLINE earns under-count under MAX-merge (not SUM) —
 * acceptable for a spine + single-device dogfood; revisit if telemetry shows loss.
 */

import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../db'

export const NEURAL_ENERGY_EARNED_KEY = 'neuralEnergyEarned'
export const NEURAL_ENERGY_SPENT_KEY = 'neuralEnergySpent'

function parseIntSafe(v: string | undefined): number {
  if (v === undefined) return 0
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

async function bumpMeta(key: string, delta: number): Promise<void> {
  const cur = parseIntSafe((await db.meta.get(key))?.value)
  await db.meta.put({ key, value: String(Math.max(0, cur + delta)) })
}

/** Earn — MUST run inside a caller Dexie 'rw' tx whose scope includes db.meta. */
export async function awardEnergyInTx(amount: number): Promise<void> {
  if (amount <= 0) return
  await bumpMeta(NEURAL_ENERGY_EARNED_KEY, amount)
}

/** Spend — MUST run inside a caller Dexie 'rw' tx whose scope includes db.meta. */
export async function spendEnergyInTx(amount: number): Promise<void> {
  if (amount <= 0) return
  await bumpMeta(NEURAL_ENERGY_SPENT_KEY, amount)
}

/** Standalone earn (wraps its own tx) — used by the reading-timer minute hook. */
export async function awardEnergy(amount: number): Promise<void> {
  if (amount <= 0) return
  await db.transaction('rw', db.meta, () => awardEnergyInTx(amount))
}

export async function readEarned(): Promise<number> {
  return parseIntSafe((await db.meta.get(NEURAL_ENERGY_EARNED_KEY))?.value)
}

export async function readSpent(): Promise<number> {
  return parseIntSafe((await db.meta.get(NEURAL_ENERGY_SPENT_KEY))?.value)
}

export async function readBalance(): Promise<number> {
  const [earned, spent] = await Promise.all([readEarned(), readSpent()])
  return Math.max(0, earned - spent)
}

/** Live neural-energy balance (earned − spent) for the collection-page HUD. */
export function useEnergyBalance(): number {
  const [balance, setBalance] = useState(0)
  useEffect(() => {
    const sub = liveQuery(async () => {
      const [earned, spent] = await Promise.all([readEarned(), readSpent()])
      return Math.max(0, earned - spent)
    }).subscribe({
      next: setBalance,
      error: (err) => console.error('[currency] balance liveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, [])
  return balance
}

/* DEV-only debug handle for manual smoke tests. */
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __energy?: unknown }).__energy = {
    balance: readBalance,
    earned: readEarned,
    spent: readSpent,
    grant: async (n: number) => {
      await awardEnergy(n)
      console.info(`[currency] DEV granted ${n} → balance ${await readBalance()}`)
    },
  }
}
