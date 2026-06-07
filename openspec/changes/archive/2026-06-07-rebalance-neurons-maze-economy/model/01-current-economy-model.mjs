// Neurons maze pacing model — rebalance-neurons-* design artifact (2026-06-07)
// Source-of-truth constants read from packages/content-neurons-tw + apps/neurons-tw.

// ── Constants (current, live) ────────────────────────────────────────────────
const CORRECT_ANSWER_ENERGY = 3
const PACING_BASE = 14
const PACING_K = 0.1
// rarity roll weights (P0 excluded once owned; P0 via soft-pity)
const WEIGHTS = { P5: 59, P4: 25, P3: 10, P2: 4, P1: 1.3 } // non-P0 roll table
const P0_BASE = 0.007, P0_PITY_START = 40, P0_PITY_RAMP = 0.05
// route-1 pyramid slots per family
const R1_SLOTS = { P0: 1, P1: 1, P2: 2, P3: 2, P4: 2, P5: 2 } // = 10
const R1_NODES = 10, R2_NODES = 10 // per family
// mastery energy multiplier by tier
const MASTERY_MULT = { none: 1.0, P5: 1.0, P4: 1.05, P3: 1.1, P2: 1.2, P1: 1.3 }
const TIER_GATES = [ // correct, accuracy
  { tier: 'P1', c: 200, a: 0.9 }, { tier: 'P2', c: 80, a: 0.8 },
  { tier: 'P3', c: 30, a: 0.7 }, { tier: 'P4', c: 10, a: 0.6 },
]
const SPEED_BUFF_PER = 0.04, SPEED_BUFF_CAP = 1.0 // collection buff → +100% cap

// ── Cost ramp ────────────────────────────────────────────────────────────────
function nodeCost(n) { return Math.round(PACING_BASE * (1 + PACING_K * Math.max(0, n))) }
function cumCost(s) { let t = 0; for (let i = 0; i < s; i++) t += nodeCost(i); return t }

// ── Helpers ──────────────────────────────────────────────────────────────────
function masteryTier(correct, accuracy) {
  if (correct < 5) return 'none'
  for (const g of TIER_GATES) if (correct >= g.c && accuracy >= g.a) return g.tier
  return 'P5'
}
function effP0(pc) { return Math.min(1, Math.max(0, P0_BASE + Math.max(0, pc - P0_PITY_START) * P0_PITY_RAMP)) }
function rollTier(pc, p0Owned, rng) {
  if (!p0Owned && rng() < effP0(pc)) return 'P0'
  const ids = Object.keys(WEIGHTS), tot = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
  let r = rng() * tot
  for (const id of ids) { r -= WEIGHTS[id]; if (r < 0) return id }
  return 'P1'
}

// ── Monte Carlo: settles needed to 100%-collect ONE family ───────────────────
// Route-2 (settles 10..19) auto-fills the 10 location variants deterministically.
// Route-1 (10 uniques) must be filled by random pulls at settles 0..9 AND 20+.
function simFamily(rng) {
  const owned = {} // "tier:slot" -> true
  const tierFilled = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
  let settles = 0
  const need = (t) => tierFilled[t] < R1_SLOTS[t]
  const r1Done = () => Object.keys(R1_SLOTS).every((t) => tierFilled[t] >= R1_SLOTS[t])
  let guard = 0
  while (!r1Done() && guard++ < 100000) {
    const isRoute2 = settles >= R1_NODES && settles < R1_NODES + R2_NODES
    const pc = settles + 1
    if (isRoute2) { settles++; continue } // deterministic location variant, no route-1 progress
    const p0Owned = tierFilled.P0 >= 1
    const tier = rollTier(pc, p0Owned, rng)
    // within-tier uniform pick among that tier's slots
    const slot = Math.floor(rng() * R1_SLOTS[tier])
    const key = `${tier}:${slot}`
    if (!owned[key]) { owned[key] = true; tierFilled[tier]++ }
    settles++
  }
  return settles // total settles (incl the 10 route-2) to reach 100% route-1+route-2
}

function mc(trials = 20000) {
  let mkrng = (s) => () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const arr = []
  for (let i = 0; i < trials; i++) arr.push(simFamily(mkrng(i * 2654435761 + 1)))
  arr.sort((a, b) => a - b)
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const p50 = arr[Math.floor(arr.length * 0.5)], p90 = arr[Math.floor(arr.length * 0.9)]
  return { mean, p50, p90 }
}

// ── Dynamic sim: correct answers to hit milestones (multipliers grow) ─────────
// One family, all-correct grind at given accuracy; streak/accel/synapse flat params.
function dynamicSolo({ accuracy, streak, energyAccel, speedAccel, synapse }) {
  let energy = 0, settles = 0, correct = 0, collected = 0
  const milestones = {}
  let guard = 0
  // route-1 collection tracking for the "100%" milestone
  const owned = {}, tierFilled = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
  const rng = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff } })()
  const r1Done = () => Object.keys(R1_SLOTS).every((t) => tierFilled[t] >= R1_SLOTS[t])
  while (guard++ < 1000000) {
    correct++
    const mt = MASTERY_MULT[masteryTier(correct, accuracy)]
    const sb = 1 + Math.min(collected * SPEED_BUFF_PER, SPEED_BUFF_CAP)
    const perCorrect = CORRECT_ANSWER_ENERGY * streak * mt * energyAccel * sb * speedAccel * synapse
    energy += perCorrect
    // settle while affordable
    while (cumCost(settles + 1) <= energy) {
      settles++
      collected = Math.min(collected + 1, R1_NODES + R2_NODES) // approx: each settle ~ +1 collected (dupes overcount but buff is capped)
      const isRoute2 = settles - 1 >= R1_NODES && settles - 1 < R1_NODES + R2_NODES
      if (!isRoute2) {
        const pc = settles
        const tier = rollTier(pc, tierFilled.P0 >= 1, rng)
        const slot = Math.floor(rng() * R1_SLOTS[tier])
        const key = `${tier}:${slot}`
        if (!owned[key]) { owned[key] = true; tierFilled[tier]++ }
      }
      if (settles === 1 && !milestones.firstSettle) milestones.firstSettle = correct
      if (settles === R1_NODES && !milestones.route1Lit) milestones.route1Lit = correct
      if (settles === R1_NODES + R2_NODES && !milestones.bothLit) milestones.bothLit = correct
      if (r1Done() && !milestones.full100) milestones.full100 = correct
    }
    if (milestones.full100) break
  }
  return milestones
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log('═══ CURRENT settle cost ramp (per-family settle index N, uncapped) ═══')
console.log(`  N=0  cost ${nodeCost(0)}   N=9  cost ${nodeCost(9)}   N=10 cost ${nodeCost(10)}   N=19 cost ${nodeCost(19)}   N=29 cost ${nodeCost(29)}   N=39 cost ${nodeCost(39)}`)
console.log(`  cumCost: 10 settles=${cumCost(10)}  20 settles=${cumCost(20)}  30=${cumCost(30)}  40=${cumCost(40)}`)
console.log('')
console.log('═══ Monte-Carlo: settles to 100%-collect ONE family (route-1 coupon-collector) ═══')
const m = mc()
console.log(`  mean ${m.mean.toFixed(1)} settles | median ${m.p50} | p90 ${m.p90}`)
console.log(`  → energy at mean: ${cumCost(Math.round(m.mean))} | at p90: ${cumCost(m.p90)}`)
console.log(`  (vs 20 settles=546 energy to merely LIGHT both routes — the completionist tail is settles 20..${m.p90})`)
console.log('')
console.log('═══ Energy→correct-answers at FLAT multipliers (per family, to milestone) ═══')
const ms = [['×1.0 (onboarding)', 1], ['×1.5', 1.5], ['×2.5', 2.5], ['×5', 5], ['×10', 10]]
const E = (s) => cumCost(s)
console.log('  multiplier         | 1st settle | route-1 lit(10) | both lit(20) | 100% (~p90 ' + m.p90 + ' settles)')
for (const [label, mult] of ms) {
  const q = (e) => Math.ceil(e / (CORRECT_ANSWER_ENERGY * mult))
  console.log(`  ${label.padEnd(18)} | ${String(q(E(1))).padStart(6)} ans | ${String(q(E(10))).padStart(11)} ans | ${String(q(E(20))).padStart(8)} ans | ${q(cumCost(m.p90))} ans`)
}
console.log('')
console.log('═══ Dynamic solo grind (mastery + collection-buff grow with play) ═══')
for (const sc of [
  { name: 'studious 80% acc, no streak/accel', accuracy: 0.8, streak: 1.0, energyAccel: 1, speedAccel: 1, synapse: 1 },
  { name: 'studious 90% acc, streak×1.3', accuracy: 0.9, streak: 1.3, energyAccel: 1, speedAccel: 1, synapse: 1 },
  { name: 'engaged 90% acc, streak×1.5 + light accel', accuracy: 0.9, streak: 1.5, energyAccel: 1.5, speedAccel: 1.3, synapse: 1.1 },
  { name: 'meta-optimized (caps)', accuracy: 0.9, streak: 1.5, energyAccel: 2.5, speedAccel: 2.0, synapse: 1.3 },
]) {
  const r = dynamicSolo(sc)
  console.log(`  ${sc.name}`)
  console.log(`     1st settle: ${r.firstSettle} correct | route-1 lit: ${r.route1Lit} | both lit: ${r.bothLit} | 100% family: ${r.full100} correct`)
}
console.log('')
console.log('═══ FULL GAME (×11 families, rough) ═══')
const r1 = dynamicSolo({ accuracy: 0.9, streak: 1.3, energyAccel: 1, speedAccel: 1, synapse: 1 })
console.log(`  studious 90%/streak1.3: ~${r1.bothLit * 11} correct to light all (220 nodes), ~${r1.full100 * 11} correct to 100%-collect all 220`)
