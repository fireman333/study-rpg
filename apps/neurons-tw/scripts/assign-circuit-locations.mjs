/**
 * assign-circuit-locations — build-time: stamp each maze crossing-synapse with a
 * real neuroanatomical location name (name-neurons-maze-circuit-locations).
 *
 * Reads the committed grid-graph.json + the CIRCUIT_LOCATIONS pool (from the
 * content package's circuit-locations.ts), assigns each synapse a `location`
 * (中文) deterministically (synapses sorted by cell y,x → round-robin over the
 * pool), and writes grid-graph.json back. ONLY adds `synapses[].location` —
 * routes / nodes / weave are untouched (does NOT re-run the maze generator).
 *
 * Run: node ./scripts/assign-circuit-locations.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GRAPH = resolve(__dirname, '../src/assets/maze/grid-graph.json')
const LOC_TS = resolve(__dirname, '../../../packages/content-neurons-tw/src/circuit-locations.ts')

// circuit-locations.ts is a self-contained pure-data module (no imports) — eval
// its array literal directly (avoids needing a JS build of the content package).
const locTxt = readFileSync(LOC_TS, 'utf8')
const open = locTxt.indexOf('[', locTxt.indexOf('CIRCUIT_LOCATIONS'))
const close = locTxt.lastIndexOf(']')
if (open < 0 || close < 0) throw new Error('could not locate CIRCUIT_LOCATIONS array literal')
// eslint-disable-next-line no-new-func
const POOL = new Function('return ' + locTxt.slice(open, close + 1))()
if (!Array.isArray(POOL) || POOL.length === 0) throw new Error('empty CIRCUIT_LOCATIONS pool')

const graph = JSON.parse(readFileSync(GRAPH, 'utf8'))
if (!Array.isArray(graph.synapses)) throw new Error('grid-graph.json has no synapses[]')

// deterministic assignment order: sort by cell (y, then x); map cellKey → index
const order = [...graph.synapses].sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0])
const idxByCell = new Map(order.map((s, i) => [`${s.cell[0]},${s.cell[1]}`, i]))

let assigned = 0
for (const s of graph.synapses) {
  const i = idxByCell.get(`${s.cell[0]},${s.cell[1]}`) ?? 0
  s.location = POOL[i % POOL.length].zh
  assigned++
}

writeFileSync(GRAPH, JSON.stringify(graph, null, 0) + '\n')
const unique = new Set(graph.synapses.map((s) => s.location)).size
console.log(`assigned ${assigned} synapse locations (${unique} unique names from a pool of ${POOL.length}) → ${GRAPH}`)
console.log('sample:', graph.synapses.slice(0, 3).map((s) => `${s.cell}→${s.location}`).join('  '))
