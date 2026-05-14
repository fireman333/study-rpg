import { rollLoot, initialLootStats } from '../packages/core/src/lib/loot.ts'
import { ITEM_CATALOG } from '../packages/theme-pixel-medical/src/items.ts'

let stats = { ...initialLootStats }
const tally = { N: 0, R: 0, SR: 0, SSR: 0, UR: 0 }
let pitySR = 0
let pitySSR = 0
for (let i = 0; i < 10000; i++) {
  const r = rollLoot(ITEM_CATALOG, stats)
  if (!r) {
    console.error('no item @', i)
    break
  }
  tally[r.rarity]++
  if (r.wasPity) {
    if (r.rarity === 'SR') pitySR++
    if (r.rarity === 'SSR') pitySSR++
  }
  stats = r.newStats
}
console.log('10000 rolls →', tally)
console.log('pity SR fired:', pitySR, ' / pity SSR fired:', pitySSR)
console.log('expected ~ N:6000 R:2500 SR:1000 SSR:400 UR:100')
console.log('final stats:', stats)
