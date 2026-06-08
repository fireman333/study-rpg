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
  type ConnectomeEventMap,
  type ConnectomeEventName,
  type ConnectomeListener,
} from '../connectome'
import type { ConductionFlow } from '../maze/economy'
import { CONNECTOME_CONDUCTION_EPOCH } from '@study-rpg/content-neurons-tw'
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
import { emitAnswerCorrect, emitAnswerWrong } from '../maze/answer-feedback'
import type { ContentPack } from '@study-rpg/core'

export const events = new ConnectomeEventEmitter()

// Expedition-driven connectome tuning (rework-neurons-connectome-expedition-driven,
// dogfood-tunable). A subject is "repaired today" at ≥ REPAIR_K repairs; pairs only
// form/strengthen on a day with an effective expedition completion (≥ EFFECTIVE_REPAIR
// _THRESHOLD repairs, or a <5 wrong pool cleared with ≥ SMALL_POOL_MIN); at most
// DAILY_PAIR_CAP pairs/day.
const REPAIR_K = 2
const DAILY_PAIR_CAP = 3
const EFFECTIVE_REPAIR_THRESHOLD = 5
const SMALL_POOL_MIN = 2

const dailyRepairKey = (date: string): string => `connectome:dailyRepair:${date}`
const dailyWiredPairsKey = (date: string): string => `connectome:dailyWiredPairs:${date}`

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

  // Expedition streak: break it if the prior effective completion is ≥ 2 days ago
  // (a day was missed). lastComplete === yesterday keeps the streak alive (today is
  // simply not done yet). (rework-neurons-connectome-expedition-driven)
  const lastComplete = (await db.meta.get('expeditionLastCompleteDate'))?.value
  if (lastComplete && daysBetweenISO(lastComplete, today) >= 2) {
    await db.meta.put({ key: 'expeditionStreak', value: '0' })
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

/**
 * Post-commit per-family first-pull grant (add-neurons-first-pull-path-rep). The
 * first answer (correct OR incorrect) for a family mints one guaranteed-P5 → its
 * path representative. Dynamic import avoids a static cycle (first-pull →
 * variant-gacha → connectome); best-effort so it never breaks the answer flow.
 */
async function maybeGrantFirstPull(familyId: string): Promise<void> {
  try {
    const { grantFirstPullIfNeeded } = await import('./first-pull')
    await grantFirstPullIfNeeded(familyId, (id) => id)
  } catch (err) {
    console.error('[first-pull] grant failed:', err)
  }
}

export async function recordCorrectAnswer(familyId: string): Promise<void> {
  const today = todayISO()
  let pending: PendingEvent[] = []
  let masteryUpdate: MasteryUpdate | null = null
  // Mastery-axis energy acceleration (wire-mastery-energy-acceleration): the
  // answered family's mastery tier multiplies the single live correct-answer
  // energy faucet — the per-family maze-signal accrual. (The old global
  // neuralEnergyEarned currency was retired by promote-maze-to-home; there is no
  // second faucet now.) Derived once in-tx (post-increment), reused at the
  // post-commit maze faucet.
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
    // AP gain = flat +1 per correct (family-buff multiplies the post-commit maze
    // faucet, not AP). Co-fire wiring is REMOVED (rework-neurons-connectome-
    // expedition-driven): synapses now form/strengthen from EXPEDITION co-repair,
    // credited at expedition settlement via `creditConnectomeFromExpedition` — NOT
    // per answer. `firedToday` / `sameDayCorrect` fields are retained on the row
    // (zero-schema) but no longer drive any wiring.
    const newAp = prevAp + 1
    const updatedAccrual: FamilyAccrualRow = {
      familyId,
      ap: newAp,
      firedToday: accrual.firedToday,
      lastFireDate: today,
      unlockedSlots: accrual.unlockedSlots,
      sameDayCorrect: accrual.sameDayCorrect,
      pullCount: accrual.pullCount,
    }
    await db.familyAccrual.put(updatedAccrual)
  })

  emitAll(pending)
  if (masteryUpdate) emitMasteryUpdated(masteryUpdate)
  // Post-commit: achievement diff against prev snapshot. Wrapped in its own
  // try/catch inside triggerAchievementCheck so failure doesn't break gameplay.
  await triggerAchievementCheck(prevStats)

  // Post-commit: maze per-FAMILY energy accrual (redesign-neurons-maze-rotjs-grid).
  // This is the SOLE correct-answer energy faucet now — accrued directly into the
  // answered subject's OWN family pool (no NT-branch indirection), scaled by streak
  // + mastery tier (mastery accelerates energy per wire-mastery-energy-acceleration)
  // + the acceleration energy pool `energyAccel(familyId)` (add-neurons-acceleration-
  // system — additive + hard-capped; folds in an active family-buff + global bolus +
  // owned energy-lane equipment). The family-scoped collection speed-buff × speedAccel
  // × synapse LTP bonus are applied inside accrueMazeEnergy. Dynamic import avoids a
  // circular static dep; best-effort (channel `[maze]`).
  try {
    const { accrueMazeEnergy, CORRECT_ANSWER_ENERGY, streakMultiplier } = await import('../maze/economy')
    const { getStreaks } = await import('./streak')
    const { current } = await getStreaks()
    const accel = await energyAccel(familyId)
    await accrueMazeEnergy(
      familyId,
      CORRECT_ANSWER_ENERGY * streakMultiplier(current) * masteryMult * accel,
    )
    // Contextual camera (design D-camera): zoom the maze to the answered family's
    // walker so the player watches the action-potential propagate / settle.
    const { emitMazeFocus } = await import('../maze/maze-focus')
    emitMazeFocus(familyId)
  } catch (err) {
    console.error('[maze] correct-answer energy accrual failed:', err)
  }

  // Presentational feedback signal → expedition band companion pulse
  // (neurons-juice-animations). In-memory, best-effort; never persisted.
  emitAnswerCorrect(familyId)

  // Post-commit: per-family first-pull grant (best-effort, channel [first-pull]).
  await maybeGrantFirstPull(familyId)
}

export interface ExpeditionConnectomeResult {
  /** Whether today reached an effective expedition completion (gate + streak bar). */
  effectiveCompletion: boolean
  /** Cumulative repairs today (across all expeditions). */
  todayRepairs: number
  /** Pairs formed (formed=true) or strengthened (formed=false) by this settlement. */
  newlyWired: { pairKey: string; formed: boolean }[]
  /** Synaptic-conduction flows granted by this settlement's batched energy. */
  conductionFlows: ConductionFlow[]
  /** Current expedition streak (after this settlement). */
  streak: number
}

const sumValues = (m: Record<string, number>): number =>
  Object.values(m).reduce((a, b) => a + b, 0)

/**
 * Credit the connectome from a completed WRONG-question expedition settlement
 * (rework-neurons-connectome-expedition-driven). Called by the wrong-pool
 * expedition's onComplete ONLY (NOT the year-set exam, NOT normal quiz). Steps:
 *   1. Accumulate today's per-subject repair counts (wrong→correct flips; in a
 *      wrong-only pool every correct IS a repair).
 *   2. Effective-completion gate (≥5 repairs today, or a <5 pool cleared with ≥2)
 *      → increments the daily streak (once/day) AND gates pair processing.
 *   3. Wiring: repaired-today subjects (≥K) pair up; ≤ DAILY_PAIR_CAP/day by
 *      priority (new > weak→strong > longest-since > higher repair product).
 *   4. Conduction: each subject's batched earned energy flows to its eligible wired
 *      neighbors (additive, capped, visible pulses) — runs regardless of the gate.
 * Best-effort caller; returns a result for the settlement ledger / ritual.
 */
export async function creditConnectomeFromExpedition(input: {
  repairsBySubject: Record<string, number>
  energyBySubject: Record<string, number>
  sessionPool: number
}): Promise<ExpeditionConnectomeResult> {
  const today = todayISO()
  const pending: PendingEvent[] = []
  // Pairs that first reached `strong` this settlement → unlock their connector
  // post-commit (add-neurons-connector-neuron-family). Collected in-tx (the
  // connectorNeurons table is outside this tx's scope), applied after commit.
  const strongTransitions: string[] = []
  const result: ExpeditionConnectomeResult = {
    effectiveCompletion: false,
    todayRepairs: 0,
    newlyWired: [],
    conductionFlows: [],
    streak: 0,
  }

  await db.transaction('rw', [db.synapses, db.familyAccrual, db.meta], async () => {
    pending.push(...(await runDailyResetIfNeededInTx(today)))

    // 1. Accumulate today's per-subject repair counts (JSON map keyed by date).
    const drKey = dailyRepairKey(today)
    const dr: Record<string, number> = JSON.parse((await db.meta.get(drKey))?.value ?? '{}')
    for (const [sub, n] of Object.entries(input.repairsBySubject)) {
      if (n > 0) dr[sub] = (dr[sub] ?? 0) + n
    }
    await db.meta.put({ key: drKey, value: JSON.stringify(dr) })
    const todayRepairs = sumValues(dr)
    result.todayRepairs = todayRepairs

    // 2. Effective-completion gate.
    const sessionRepairs = sumValues(input.repairsBySubject)
    const smallPoolCleared =
      input.sessionPool < EFFECTIVE_REPAIR_THRESHOLD &&
      sessionRepairs >= input.sessionPool &&
      todayRepairs >= SMALL_POOL_MIN
    const effective = todayRepairs >= EFFECTIVE_REPAIR_THRESHOLD || smallPoolCleared
    result.effectiveCompletion = effective

    // streak (once per day on first effective completion).
    const lastComplete = (await db.meta.get('expeditionLastCompleteDate'))?.value
    let streak = Number((await db.meta.get('expeditionStreak'))?.value ?? '0') || 0
    if (effective && lastComplete !== today) {
      streak += 1
      await db.meta.put({ key: 'expeditionStreak', value: String(streak) })
      await db.meta.put({ key: 'expeditionLastCompleteDate', value: today })
      // Track recent effective-completion dates (pruned to ~14 days) for 本週 X/7.
      const datesRaw = (await db.meta.get('expeditionCompletionDates'))?.value
      const dates: string[] = datesRaw ? JSON.parse(datesRaw) : []
      const pruned = [...dates.filter((d) => d !== today && daysBetweenISO(d, today) < 14), today]
      await db.meta.put({ key: 'expeditionCompletionDates', value: JSON.stringify(pruned) })
    }
    result.streak = streak

    // 3. Wiring — only when the gate is met.
    if (effective) {
      const repaired = Object.entries(dr)
        .filter(([, n]) => n >= REPAIR_K)
        .map(([s]) => s)
      if (repaired.length >= 2) {
        const wpKey = dailyWiredPairsKey(today)
        const wiredSet = new Set<string>(JSON.parse((await db.meta.get(wpKey))?.value ?? '[]'))
        const synapses = await db.synapses.toArray()
        const synMap = new Map(synapses.map((s) => [s.pairKey, s]))

        const candidates: { key: string; a: string; b: string; existing?: SynapseRow }[] = []
        for (let i = 0; i < repaired.length; i++) {
          for (let j = i + 1; j < repaired.length; j++) {
            const key = pairKey(repaired[i], repaired[j])
            if (wiredSet.has(key)) continue
            candidates.push({ key, a: repaired[i], b: repaired[j], existing: synMap.get(key) })
          }
        }
        // Priority: new pair > weak→strong candidate > longest since co-repair > higher product.
        candidates.sort((x, y) => {
          const xn = x.existing ? 1 : 0
          const yn = y.existing ? 1 : 0
          if (xn !== yn) return xn - yn
          const xws = x.existing?.state === 'weak' ? 0 : 1
          const yws = y.existing?.state === 'weak' ? 0 : 1
          if (xws !== yws) return xws - yws
          const xd = x.existing ? daysBetweenISO(x.existing.lastCoFireDate, today) : 0
          const yd = y.existing ? daysBetweenISO(y.existing.lastCoFireDate, today) : 0
          if (xd !== yd) return yd - xd
          return dr[y.a] * dr[y.b] - dr[x.a] * dr[x.b]
        })

        for (const c of candidates.slice(0, DAILY_PAIR_CAP)) {
          if (!c.existing) {
            const newSynapse: SynapseRow = {
              pairKey: c.key,
              state: 'dormant',
              lastCoFireDate: today,
              createdAt: today,
            }
            await db.synapses.put(newSynapse)
            pending.push({ name: 'connectome.synapseFormed', payload: { pairKey: c.key, state: 'dormant' } })
            result.newlyWired.push({ pairKey: c.key, formed: true })
          } else if (c.existing.lastCoFireDate !== today) {
            const fromState: SynapseState = c.existing.state
            const toState = nextStateOnStrengthen(fromState)
            await db.synapses.update(c.key, { state: toState, lastCoFireDate: today })
            if (toState !== fromState) {
              pending.push({
                name: 'connectome.synapseStrengthened',
                payload: { pairKey: c.key, fromState, toState },
              })
              // First time this pair reached `strong` → unlock its connector
              // (post-commit, below). dormant→weak can never be 'strong', so this
              // captures exactly the weak→strong transition.
              if (toState === 'strong') strongTransitions.push(c.key)
            }
            result.newlyWired.push({ pairKey: c.key, formed: false })
          }
          wiredSet.add(c.key)
        }
        await db.meta.put({ key: wpKey, value: JSON.stringify([...wiredSet]) })
      }
    }
  })

  emitAll(pending)

  // 4. Post-commit conduction (runs regardless of the wiring gate). Dynamic import
  // avoids a static cycle (connectome → economy → connectome).
  try {
    const { synapticConduction } = await import('../maze/economy')
    for (const [sub, energy] of Object.entries(input.energyBySubject)) {
      const flows = await synapticConduction(sub, energy)
      for (const f of flows) events.emit('connectome.conductionPulse', f)
      result.conductionFlows.push(...flows)
    }
  } catch (err) {
    console.error('[conduction] expedition-settlement conduction failed:', err)
  }

  // 5. Post-commit connector unlocks for pairs that first reached `strong` this
  // settlement (add-neurons-connector-neuron-family). Outside the settlement tx
  // (connectorNeurons is a separate table); dynamic import + best-effort so a
  // connector failure never breaks settlement. unlockConnector is idempotent.
  if (strongTransitions.length > 0) {
    try {
      const { unlockConnector } = await import('./connector')
      for (const key of strongTransitions) await unlockConnector(key)
    } catch (err) {
      console.error('[connector] unlock on strong transition failed:', err)
    }
  }

  return result
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

  // Presentational feedback signal → expedition band synapse-decay dim
  // (neurons-juice-animations). In-memory, best-effort; never persisted.
  emitAnswerWrong(familyId)

  // Post-commit: per-family first-pull grant (the first answer for a family —
  // correct OR incorrect — grants its P5 representative; best-effort).
  await maybeGrantFirstPull(familyId)
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

export interface ConnectomeStatus {
  /** Today's effective expedition completion reached. */
  todayCompleted: boolean
  /** Cross-day completion streak. */
  streak: number
  /** Effective-completion days within the rolling 7-day window (本週 X/7). */
  weeklyCount: number
  /** Strong VALIDATED synapses (legacy 早期連線 excluded — design D12). */
  stableLinks: number
  /** pairKey of the strongest/most-recent validated pair, or null. */
  strongestPair: string | null
  /** Total conduction energy received today across all wires. */
  todayConductionEnergy: number
}

/**
 * Narrative connectome indicators for the homepage (rework-neurons-connectome-
 * expedition-driven, D6): 今日出征 / 連續 N 天 / 本週 X/7 / 穩定連線數 / 最強 pair /
 * 今日連線額外獲得 X 能量. NOT a 116/116 collection bar. Legacy synapses are excluded
 * from the stable-link + strongest-pair stats until re-validated.
 */
export async function getConnectomeStatus(): Promise<ConnectomeStatus> {
  await runDailyResetIfNeeded()
  const today = todayISO()
  const [synapses, streakRow, lastCompleteRow, datesRow] = await Promise.all([
    db.synapses.toArray(),
    db.meta.get('expeditionStreak'),
    db.meta.get('expeditionLastCompleteDate'),
    db.meta.get('expeditionCompletionDates'),
  ])
  const validated = synapses.filter((s) => s.lastCoFireDate >= CONNECTOME_CONDUCTION_EPOCH)
  const stableLinks = validated.filter((s) => s.state === 'strong').length
  const ranked = validated
    .filter((s) => s.state !== 'dormant')
    .sort((a, b) => {
      const rank = (st: string): number => (st === 'strong' ? 0 : 1)
      if (rank(a.state) !== rank(b.state)) return rank(a.state) - rank(b.state)
      return a.lastCoFireDate < b.lastCoFireDate ? 1 : -1 // most recent first
    })
  const dates: string[] = datesRow?.value ? JSON.parse(datesRow.value) : []
  const weeklyCount = dates.filter((d) => daysBetweenISO(d, today) < 7).length
  let todayConductionEnergy = 0
  try {
    const { readTodayConductionTotal } = await import('../maze/economy')
    todayConductionEnergy = await readTodayConductionTotal()
  } catch (err) {
    console.error('[connectome] readTodayConductionTotal failed:', err)
  }
  return {
    todayCompleted: lastCompleteRow?.value === today,
    streak: Number(streakRow?.value ?? '0') || 0,
    weeklyCount,
    stableLinks,
    strongestPair: ranked[0]?.pairKey ?? null,
    todayConductionEnergy,
  }
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
    // Re-arm the per-family first-pull (add-neurons-first-pull-path-rep) so a
    // reset player's next answer per family grants a fresh P5 representative.
    await db.meta.delete('firstPullFamilies')
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
