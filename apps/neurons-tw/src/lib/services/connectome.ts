import {
  db,
  todayISO,
  HOMEPAGE_ONBOARDING_DISMISSED_KEY,
  type FamilyAccrualRow,
  type SynapseRow,
  type SynapseState,
} from '../db'
import {
  ConnectomeEventEmitter,
  N_THRESHOLD,
  decodePairKey,
  nextStateOnDecay,
  nextStateOnStrengthen,
  pairKey,
  shouldFire,
  type ConnectomeEventMap,
  type ConnectomeEventName,
  type ConnectomeListener,
} from '../connectome'
import {
  recordAttemptInTx,
  emitMasteryUpdated,
  initFamilyMasteryIfEmpty,
  type MasteryUpdate,
} from './mastery'
import { deriveMasteryTier, masteryEnergyMultiplier } from '../mastery'
import { incrementCurrentStreak, resetCurrentStreak } from './streak'
import { buildAchievementStats, triggerAchievementCheck } from './achievement'
import { energyAccel } from './acceleration'
// Cycle-free keys module (NOT ./first-pull — that would cycle via variant-gacha).
import { FIRST_PULL_DONE_KEY, STARTER_FAMILY_KEYS } from './first-pull-keys'
import type { ContentPack } from '@study-rpg/core'

export const events = new ConnectomeEventEmitter()

/**
 * Emit the "a variant entered the collection" signal on the connectome bus
 * (Collection 2.0). Fired by the gacha PULL when a NEW variant is minted — it
 * drives the connectome-tree leaf refresh, the 🧬 chip live-update, and the DMN
 * behavior-axis bonus draw. The `connectome.variantSlotUnlocked` event name is
 * retained from the pre-gacha slot-unlock era (its consumers are unchanged);
 * `wasRedemption` is always false for pulls (pulls are not question-tied).
 */
export function emitVariantCollected(
  payload: ConnectomeEventMap['connectome.variantSlotUnlocked'],
): void {
  events.emit('connectome.variantSlotUnlocked', payload)
}

type PendingEvent =
  | { name: 'connectome.synapseFormed'; payload: ConnectomeEventMap['connectome.synapseFormed'] }
  | {
      name: 'connectome.synapseStrengthened'
      payload: ConnectomeEventMap['connectome.synapseStrengthened']
    }
  | {
      name: 'connectome.synapseDecayed'
      payload: ConnectomeEventMap['connectome.synapseDecayed']
    }

function daysBetweenISO(earlier: string, later: string): number {
  const ms = Date.parse(later) - Date.parse(earlier)
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

async function performDailyReset(today: string): Promise<PendingEvent[]> {
  const pending: PendingEvent[] = []

  await db.familyAccrual.toCollection().modify((row) => {
    row.firedToday = false
    row.sameDayCorrect = 0
  })

  const synapses = await db.synapses.toArray()
  for (const synapse of synapses) {
    const daysSince = daysBetweenISO(synapse.lastCoFireDate, today)
    if (daysSince > 7 && synapse.state !== 'dormant') {
      const fromState = synapse.state
      const toState = nextStateOnDecay(fromState)
      await db.synapses.update(synapse.pairKey, {
        state: toState,
        lastCoFireDate: today,
      })
      pending.push({
        name: 'connectome.synapseDecayed',
        payload: { pairKey: synapse.pairKey, fromState, toState },
      })
    }
  }

  await db.meta.put({ key: 'lastResetDate', value: today })
  return pending
}

async function runDailyResetIfNeededInTx(today: string): Promise<PendingEvent[]> {
  const lastReset = await db.meta.get('lastResetDate')
  if (lastReset?.value === today) return []
  return performDailyReset(today)
}

export async function runDailyResetIfNeeded(): Promise<void> {
  const today = todayISO()
  let pending: PendingEvent[] = []
  await db.transaction('rw', db.synapses, db.familyAccrual, db.meta, async () => {
    pending = await runDailyResetIfNeededInTx(today)
  })
  emitAll(pending)
}

export async function recordCorrectAnswer(familyId: string): Promise<void> {
  const today = todayISO()
  let pending: PendingEvent[] = []
  let masteryUpdate: MasteryUpdate | null = null
  // Mastery-axis energy acceleration (wire-mastery-energy-acceleration): the
  // answered family's mastery tier multiplies BOTH correct-answer energy faucets.
  // Derived once in-tx (post-increment), reused at the post-commit maze faucet so
  // the two counters stay in lockstep ("one energy" until #3 unifies them).
  let masteryMult = 1
  // Capture stats BEFORE the write transaction so the achievement diff sees
  // the pre-mutation state. Read-only, no transaction needed.
  const prevStats = await buildAchievementStats()

  await db.transaction(
    'rw',
    [db.synapses, db.familyAccrual, db.meta, db.familyMastery],
    async (tx) => {
    pending.push(...(await runDailyResetIfNeededInTx(today)))
    masteryUpdate = await recordAttemptInTx(tx, familyId, true)
    masteryMult = masteryEnergyMultiplier(
      deriveMasteryTier(masteryUpdate.next.correct, masteryUpdate.next.total),
    )
    // Co-commit streak counter increment with mastery / synapse writes per
    // neurons-achievements spec Req "Streak counter SHALL be persisted...".
    await incrementCurrentStreak()

    const accrual = await db.familyAccrual.get(familyId)
    if (!accrual) {
      throw new Error(
        `[connectome] no familyAccrual row for "${familyId}" — call initFamilyAccrualIfEmpty(pack) before recording answers`,
      )
    }

    const prevAp = accrual.ap
    // family-buff no longer affects AP (realign-dmn-event-rewards-to-maze): it
    // multiplies the post-commit maze-energy faucet instead (AP no longer gates
    // progression post-promote-maze-to-home). AP gain = flat +1 per correct.
    const newAp = prevAp + 1
    const prevFiredToday = accrual.firedToday
    const newSameDayCorrect = accrual.sameDayCorrect + 1

    // AP no longer unlocks variant slots; energy is the per-branch maze fuel
    // accrued post-commit below (promote-maze-to-home / Model A). No in-tx global
    // energy faucet and no variantSlotUnlocked emission here.

    const justFired = !prevFiredToday && shouldFire(newSameDayCorrect)
    const updatedAccrual: FamilyAccrualRow = {
      familyId,
      ap: newAp,
      firedToday: prevFiredToday || justFired,
      lastFireDate: today,
      unlockedSlots: accrual.unlockedSlots,
      sameDayCorrect: newSameDayCorrect,
      pullCount: accrual.pullCount,
    }
    await db.familyAccrual.put(updatedAccrual)

    if (justFired) {
      const firedNow = await db.familyAccrual.toArray()
      const firedFamilyIds = firedNow
        .filter((row) => row.firedToday && row.familyId !== familyId)
        .map((row) => row.familyId)

      for (const otherFamilyId of firedFamilyIds) {
        const key = pairKey(familyId, otherFamilyId)
        const existing = await db.synapses.get(key)
        if (!existing) {
          const newSynapse: SynapseRow = {
            pairKey: key,
            state: 'dormant',
            lastCoFireDate: today,
            createdAt: today,
          }
          await db.synapses.put(newSynapse)
          pending.push({
            name: 'connectome.synapseFormed',
            payload: { pairKey: key, state: 'dormant' },
          })
        } else if (existing.lastCoFireDate !== today) {
          const fromState: SynapseState = existing.state
          const toState = nextStateOnStrengthen(fromState)
          await db.synapses.update(key, {
            state: toState,
            lastCoFireDate: today,
          })
          if (toState !== fromState) {
            pending.push({
              name: 'connectome.synapseStrengthened',
              payload: { pairKey: key, fromState, toState },
            })
          }
        } else if (existing.state === 'strong') {
          await db.synapses.update(key, { lastCoFireDate: today })
        }
      }
    }
  })

  emitAll(pending)
  if (masteryUpdate) emitMasteryUpdated(masteryUpdate)
  // Post-commit: achievement diff against prev snapshot. Wrapped in its own
  // try/catch inside triggerAchievementCheck so failure doesn't break gameplay.
  await triggerAchievementCheck(prevStats)

  // Post-commit: maze per-branch energy accrual (promote-maze-to-home / Model A).
  // This is the SOLE correct-answer energy faucet now — routed to the answered
  // subject's NT branch pool via FAMILY_NT_BRANCH, scaled by streak + mastery
  // tier (mastery accelerates energy per wire-mastery-energy-acceleration) +
  // the acceleration energy pool `energyAccel(familyId)` (add-neurons-
  // acceleration-system — additive + hard-capped; folds in an active family-buff
  // [+1.0 ⇒ the prior ×2] + global bolus + owned energy-lane equipment).
  // Dynamic import avoids a circular static dep; best-effort (channel `[maze]`).
  try {
    const { branchOfFamily } = await import('../maze/graph')
    const branch = branchOfFamily(familyId)
    if (branch) {
      const { accrueMazeEnergy, CORRECT_ENERGY, streakMultiplier } = await import('../maze/economy')
      const { getStreaks } = await import('./streak')
      const { current } = await getStreaks()
      const accel = await energyAccel(familyId)
      await accrueMazeEnergy(
        branch,
        CORRECT_ENERGY * streakMultiplier(current) * masteryMult * accel,
      )
    }
  } catch (err) {
    console.error('[maze] correct-answer energy accrual failed:', err)
  }
}

export async function recordIncorrectAnswer(familyId: string): Promise<void> {
  // Per connectome-collection spec: AP / firedToday / synapse state unchanged.
  // Per neuron-family-mastery spec: total counter increments (correct does not).
  // Per neurons-achievements spec: streak reset to 0 in same tx as mastery.
  let masteryUpdate: MasteryUpdate | null = null
  const prevStats = await buildAchievementStats()
  await db.transaction('rw', db.familyMastery, db.meta, async (tx) => {
    masteryUpdate = await recordAttemptInTx(tx, familyId, false)
    await resetCurrentStreak()
  })
  if (masteryUpdate) emitMasteryUpdated(masteryUpdate)
  // Post-commit: achievement diff (mainly for streak-reset edge case where a
  // related predicate flips — uncommon but cheap to check).
  await triggerAchievementCheck(prevStats)
}

export async function initMasteryForPack(pack: ContentPack): Promise<void> {
  await initFamilyMasteryIfEmpty(pack)
}

export interface ConnectomeSnapshot {
  familyAccrual: FamilyAccrualRow[]
  synapses: SynapseRow[]
  today: string
}

export async function loadConnectome(): Promise<ConnectomeSnapshot> {
  await runDailyResetIfNeeded()
  const [familyAccrual, synapses] = await Promise.all([
    db.familyAccrual.toArray(),
    db.synapses.toArray(),
  ])
  return { familyAccrual, synapses, today: todayISO() }
}

export interface ConnectomeSubscription {
  dispose: () => void
}

export function subscribeConnectomeEvents(
  handlers: Partial<{ [K in ConnectomeEventName]: ConnectomeListener<K> }>,
): ConnectomeSubscription {
  const bound: Array<[ConnectomeEventName, ConnectomeListener<ConnectomeEventName>]> = []
  for (const event of Object.keys(handlers) as ConnectomeEventName[]) {
    const listener = handlers[event] as ConnectomeListener<typeof event> | undefined
    if (!listener) continue
    events.on(event, listener)
    bound.push([event, listener as ConnectomeListener<ConnectomeEventName>])
  }
  return {
    dispose: () => {
      for (const [event, listener] of bound) events.off(event, listener)
    },
  }
}

function shiftIsoDateBackward(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA')
}

export async function advanceDayForDebug(days = 1): Promise<void> {
  if (days < 1) throw new Error('advanceDayForDebug: days must be >= 1')
  const today = todayISO()
  const fakedLastReset = shiftIsoDateBackward(today, days)

  let pending: PendingEvent[] = []
  await db.transaction('rw', db.synapses, db.familyAccrual, db.meta, async () => {
    await db.meta.put({ key: 'lastResetDate', value: fakedLastReset })

    // Age every synapse's lastCoFireDate backward by `days` so that next co-fire
    // is treated as a new day (per spec: strengthening requires lastCoFireDate !== today).
    // Also ages decay clock — 8 advance-day clicks = 8-day gap → triggers LTD on next reset.
    const synapses = await db.synapses.toArray()
    for (const s of synapses) {
      await db.synapses.update(s.pairKey, {
        lastCoFireDate: shiftIsoDateBackward(s.lastCoFireDate, days),
      })
    }
    // Age every accrual's lastFireDate too so firedToday is treated as stale on reset
    const accruals = await db.familyAccrual.toArray()
    for (const a of accruals) {
      if (a.lastFireDate) {
        await db.familyAccrual.update(a.familyId, {
          lastFireDate: shiftIsoDateBackward(a.lastFireDate, days),
        })
      }
    }

    pending = await performDailyReset(today)
  })
  emitAll(pending)
}

export async function resetConnectomeForDebug(): Promise<void> {
  await db.transaction('rw', db.synapses, db.familyAccrual, db.meta, async () => {
    await db.synapses.clear()
    await db.familyAccrual.toCollection().modify((row) => {
      row.ap = 0
      row.firedToday = false
      row.lastFireDate = null
      row.unlockedSlots = []
      row.sameDayCorrect = 0
      row.pullCount = 0
    })
    await db.meta.put({ key: 'lastResetDate', value: todayISO() })
    // Re-surface the homepage onboarding for a reset (fresh-start) user.
    await db.meta.delete(HOMEPAGE_ONBOARDING_DISMISSED_KEY)
    // Re-enable the one-time first-pull + drop stale starter-lit nodes
    // (add-neurons-first-pull) so a reset player starts genuinely fresh.
    await db.meta.delete(FIRST_PULL_DONE_KEY)
    for (const k of STARTER_FAMILY_KEYS) await db.meta.delete(k)
  })
}

export async function dumpStateForDebug(): Promise<void> {
  const snapshot = await loadConnectome()
  const meta = await db.meta.toArray()
  // eslint-disable-next-line no-console
  console.log('[connectome] state dump', {
    today: snapshot.today,
    familyAccrual: snapshot.familyAccrual,
    synapses: snapshot.synapses,
    meta,
    N_THRESHOLD,
  })
}

function emitAll(pending: PendingEvent[]): void {
  for (const event of pending) {
    events.emit(event.name, event.payload as never)
  }
}

export { decodePairKey }
