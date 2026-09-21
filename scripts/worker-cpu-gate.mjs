#!/usr/bin/env node
// Downgrade gate for change fit-sync-worker-under-free-plan-cpu-limit (openspec `sync-worker-cpu-budget`).
//
// Reads 7 days of `workersInvocationsAdaptive` for study-rpg-sync-worker at datetimeMinute granularity
// and answers one question: did ANY minute bucket reach the Free plan's 10 ms CPU limit (cpuTimeP99)?
// Exit 0 only when none did across a full 7-day window. Also prints the per-cron maxima and the
// ordinary-request tail so the day-1 / day-7 decisions in tasks.md are made on numbers.
//
// Token: ~/.cf-analytics-token (Account Analytics:Read). The wrangler OAuth token does NOT have it.
// Usage: node scripts/worker-cpu-gate.mjs [--days 7] [--script study-rpg-sync-worker]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const ACCOUNT = '43631a35f33f4132484a6ce024cc502a'
const LIMIT_US = 10_000
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : []).filter(Boolean))
const DAYS = Number(args.days ?? 7)
const SCRIPT = args.script ?? 'study-rpg-sync-worker'
// Scheduled invocations sometimes land in the minute after their trigger, so each job owns two minutes.
const CRON_MINUTES = { '二階 leaderboard (:00/:30)': ['00', '01', '30', '31'], 'neurons leaderboard (:05/:35)': ['05', '06', '35', '36'] }
const SWEEP_HHMM = ['03:20', '03:21']

const token = readFileSync(resolve(homedir(), '.cf-analytics-token'), 'utf8').trim()
const end = new Date(); end.setUTCSeconds(0, 0)
const start = new Date(end.getTime() - DAYS * 86_400_000)

async function gql(query, variables) {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors))
  return json.data.viewer.accounts[0]
}

// One query per day: the per-minute dataset is capped at 10k rows per request.
const rows = []
for (let d = 0; d < DAYS; d++) {
  const s = new Date(start.getTime() + d * 86_400_000), e = new Date(Math.min(s.getTime() + 86_400_000, end.getTime()))
  const acc = await gql(`query($a:String!,$s:Time!,$e:Time!,$n:String!){viewer{accounts(filter:{accountTag:$a}){
    workersInvocationsAdaptive(limit:10000,filter:{datetime_geq:$s,datetime_lt:$e,scriptName:$n}){
      dimensions{datetimeMinute status} sum{requests errors} quantiles{cpuTimeP50 cpuTimeP99}}}}}`,
    { a: ACCOUNT, s: s.toISOString(), e: e.toISOString(), n: SCRIPT })
  rows.push(...acc.workersInvocationsAdaptive)
}

const minuteOf = (r) => r.dimensions.datetimeMinute.slice(14, 16)
const hhmmOf = (r) => r.dimensions.datetimeMinute.slice(11, 16)
const over = rows.filter((r) => r.quantiles.cpuTimeP99 >= LIMIT_US)
const daysCovered = new Set(rows.map((r) => r.dimensions.datetimeMinute.slice(0, 10))).size
const fmt = (us) => `${(us / 1000).toFixed(1)} ms`

console.log(`# worker-cpu-gate — ${SCRIPT}, ${start.toISOString()} → ${end.toISOString()} (${daysCovered} day(s) with data)`)
console.log(`buckets: ${rows.length}  requests: ${rows.reduce((a, r) => a + r.sum.requests, 0)}  errors: ${rows.reduce((a, r) => a + r.sum.errors, 0)}`)

console.log('\n## per-job max cpuTimeP99')
for (const [label, mins] of Object.entries(CRON_MINUTES)) {
  const b = rows.filter((r) => mins.includes(minuteOf(r)))
  const mx = b.length ? Math.max(...b.map((r) => r.quantiles.cpuTimeP99)) : NaN
  console.log(`- ${label}: ${b.length ? fmt(mx) : 'no data'} over ${b.length} bucket(s) ${mx >= LIMIT_US ? '❌' : '✅'}`)
}
{
  const b = rows.filter((r) => SWEEP_HHMM.includes(hhmmOf(r)))
  const mx = b.length ? Math.max(...b.map((r) => r.quantiles.cpuTimeP99)) : NaN
  console.log(`- note-image sweep (03:20): ${b.length ? fmt(mx) : 'no data'} over ${b.length} bucket(s) ${mx >= LIMIT_US ? '❌' : '✅'}`)
}

const cronMins = new Set(Object.values(CRON_MINUTES).flat())
const ordinary = rows.filter((r) => !cronMins.has(minuteOf(r)) && !SWEEP_HHMM.includes(hhmmOf(r)))
const ordReq = ordinary.reduce((a, r) => a + r.sum.requests, 0)
const tailP50 = ordinary.filter((r) => r.quantiles.cpuTimeP50 >= LIMIT_US).reduce((a, r) => a + r.sum.requests, 0)
const tailP99 = ordinary.filter((r) => r.quantiles.cpuTimeP99 >= LIMIT_US).reduce((a, r) => a + r.sum.requests, 0)
console.log(`\n## ordinary-request tail (non-cron minutes)\nrequests ${ordReq}; in buckets with P50 ≥ 10 ms: ${tailP50} (${(100 * tailP50 / Math.max(ordReq, 1)).toFixed(2)}%, lower bound); with P99 ≥ 10 ms: ${tailP99} (${(100 * tailP99 / Math.max(ordReq, 1)).toFixed(2)}%, upper bound)`)

console.log(`\n## buckets with cpuTimeP99 ≥ 10 ms: ${over.length}`)
for (const r of over.sort((a, b) => b.quantiles.cpuTimeP99 - a.quantiles.cpuTimeP99).slice(0, 30)) {
  console.log(`  ${r.dimensions.datetimeMinute} ${r.dimensions.status} req=${r.sum.requests} P50=${fmt(r.quantiles.cpuTimeP50)} P99=${fmt(r.quantiles.cpuTimeP99)}`)
}

const full = daysCovered >= DAYS
console.log(`\n## verdict: ${over.length === 0 && full ? 'PASS — safe to downgrade' : full ? 'FAIL — buckets over budget' : `INCOMPLETE — only ${daysCovered}/${DAYS} days of data`}`)
process.exit(over.length === 0 && full ? 0 : 1)
