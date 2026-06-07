// Candidate rebalance tuning — target: 100% all 220 ≈ ~6000 correct (2-month達標).
// Compares CURRENT vs CANDIDATE under a realistic dynamic grind (multipliers grow).

const CORRECT_ANSWER_ENERGY = 3
const WEIGHTS = { P5: 59, P4: 25, P3: 10, P2: 4, P1: 1.3 }
const P0_BASE = 0.007, P0_PITY_START = 40, P0_PITY_RAMP = 0.05
const R1_SLOTS = { P0: 1, P1: 1, P2: 2, P3: 2, P4: 2, P5: 2 }
const R1_NODES = 10, R2_NODES = 10
const MASTERY_MULT = { none: 1, P5: 1, P4: 1.05, P3: 1.1, P2: 1.2, P1: 1.3 }
const TIER_GATES = [{ tier: 'P1', c: 200, a: 0.9 }, { tier: 'P2', c: 80, a: 0.8 }, { tier: 'P3', c: 30, a: 0.7 }, { tier: 'P4', c: 10, a: 0.6 }]
const SPEED_BUFF_PER = 0.04, SPEED_BUFF_CAP = 1.0

function masteryTier(c, a) { if (c < 5) return 'none'; for (const g of TIER_GATES) if (c >= g.c && a >= g.a) return g.tier; return 'P5' }
function effP0(pc) { return Math.min(1, Math.max(0, P0_BASE + Math.max(0, pc - P0_PITY_START) * P0_PITY_RAMP)) }

// cfg: { base, k, rampCapN, preferUnowned, p1PityStart, p1PityRamp, fusionK(unused-here) }
function makeCost(cfg) {
  return (n) => Math.round(cfg.base * (1 + cfg.k * Math.min(Math.max(0, n), cfg.rampCapN ?? Infinity)))
}

// Roll a tier. Optional rare pity for P1 (mirrors P0 pity) to bound the 1.3% wall.
function rollTier(pc, p0Owned, p1Owned, cfg, rng) {
  if (!p0Owned && rng() < effP0(pc)) return 'P0'
  if (cfg.p1PityStart && !p1Owned) {
    const p1r = Math.max(0, (pc - cfg.p1PityStart)) * (cfg.p1PityRamp ?? 0)
    if (p1r > 0 && rng() < Math.min(1, p1r)) return 'P1'
  }
  const ids = Object.keys(WEIGHTS), tot = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
  let r = rng() * tot
  for (const id of ids) { r -= WEIGHTS[id]; if (r < 0) return id }
  return 'P1'
}

// Dynamic solo grind for ONE family → correct answers to 100% (route-1 unique + route-2 det).
function dyn(cfg, sc, seed = 1) {
  const cost = makeCost(cfg)
  const cum = (s) => { let t = 0; for (let i = 0; i < s; i++) t += cost(i); return t }
  let energy = 0, settles = 0, correct = 0, collected = 0, guard = 0
  const owned = {}, filled = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
  let s = seed; const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const r1Done = () => Object.keys(R1_SLOTS).every((t) => filled[t] >= R1_SLOTS[t])
  const ms = {}
  while (guard++ < 5_000_000) {
    correct++
    const mt = MASTERY_MULT[masteryTier(correct, sc.accuracy)]
    const sb = 1 + Math.min(collected * SPEED_BUFF_PER, SPEED_BUFF_CAP)
    energy += CORRECT_ANSWER_ENERGY * sc.streak * mt * sc.energyAccel * sb * sc.speedAccel * sc.synapse
    while (cum(settles + 1) <= energy) {
      settles++; collected = Math.min(collected + 1, 999)
      const idx = settles - 1
      const isR2 = idx >= R1_NODES && idx < R1_NODES + R2_NODES
      if (!isR2) {
        const pc = settles
        const tier = rollTier(pc, filled.P0 >= 1, filled.P1 >= 1, cfg, rng)
        let slot
        if (cfg.preferUnowned) {
          // pick an unowned slot in tier if any, else random (dupe)
          const open = []; for (let k = 0; k < R1_SLOTS[tier]; k++) if (!owned[`${tier}:${k}`]) open.push(k)
          slot = open.length ? open[Math.floor(rng() * open.length)] : Math.floor(rng() * R1_SLOTS[tier])
        } else slot = Math.floor(rng() * R1_SLOTS[tier])
        const key = `${tier}:${slot}`
        if (!owned[key]) { owned[key] = true; filled[tier]++ }
      }
      if (settles === 1 && !ms.first) ms.first = correct
      if (settles === R1_NODES && !ms.r1) ms.r1 = correct
      if (settles === R1_NODES + R2_NODES && !ms.both) ms.both = correct
      if (r1Done() && !ms.full) { ms.full = correct; ms.fullSettles = settles }
    }
    if (ms.full) break
  }
  return ms
}

// Average over seeds (RNG variance in the rare-slot tail).
function avg(cfg, sc, trials = 60) {
  const acc = { first: 0, r1: 0, both: 0, full: 0, fullSettles: 0 }
  const fulls = []
  for (let i = 0; i < trials; i++) { const m = dyn(cfg, sc, i * 7919 + 3); for (const k in acc) acc[k] += m[k] || 0; fulls.push(m.full) }
  for (const k in acc) acc[k] = Math.round(acc[k] / trials)
  fulls.sort((a, b) => a - b); acc.fullP90 = fulls[Math.floor(trials * 0.9)]
  return acc
}

const SC = { accuracy: 0.9, streak: 1.3, energyAccel: 1, speedAccel: 1, synapse: 1 } // studious solo, no DMN meta

const CURRENT = { base: 14, k: 0.1, rampCapN: Infinity, preferUnowned: false }
const CANDIDATES = {
  'A: cap@24 + prefer-unowned + P1-pity(40,.04)': { base: 14, k: 0.1, rampCapN: 24, preferUnowned: true, p1PityStart: 40, p1PityRamp: 0.04 },
  'B: base12 + cap@22 + prefer-unowned + P1-pity(35,.05)': { base: 12, k: 0.1, rampCapN: 22, preferUnowned: true, p1PityStart: 35, p1PityRamp: 0.05 },
  'C: base11 + cap@20 + prefer-unowned + P1-pity(30,.06)': { base: 11, k: 0.1, rampCapN: 20, preferUnowned: true, p1PityStart: 30, p1PityRamp: 0.06 },
}

function show(name, cfg) {
  const a = avg(cfg, SC)
  const cost = makeCost(cfg)
  console.log(`\n── ${name} ──`)
  console.log(`   cost ramp: N0=${cost(0)} N9=${cost(9)} N20=${cost(20)} N30=${cost(30)} N50=${cost(50)} (cap=${cfg.rampCapN})`)
  console.log(`   per-family correct: 1st settle=${a.first}  route-1 lit=${a.r1}  both lit=${a.both}  100%=${a.full} (p90 ${a.fullP90}, ~${a.fullSettles} settles)`)
  console.log(`   FULL 220 (×11): light all ≈ ${a.both * 11} correct | 100% all ≈ ${a.full * 11} correct (p90 ≈ ${a.fullP90 * 11})`)
}

console.log('TARGET: 100% all-220 ≈ ~6000 correct (2-month達標). Early snappy (hook). SC = studious 90%/streak1.3, no DMN accel.')
show('CURRENT (live)', CURRENT)
for (const [n, c] of Object.entries(CANDIDATES)) show(n, c)
