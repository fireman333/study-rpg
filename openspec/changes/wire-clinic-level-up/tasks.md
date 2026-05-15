## 1. Content pack: clinic-tiers module

- [x] 1.1 Created `packages/content-medexam2-tw/src/clinic-tiers.ts` with `HospitalTier` union + `TIER_ORDER` constant
- [x] 1.2 Added `TIER_UPGRADE_THRESHOLDS = { 診所: 1000, 區域醫院: 10000, 醫學中心: null }`
- [x] 1.3 Added `TIER_ROOMS` map with cumulative rosters: 診所 (3 outpatient) / 區域醫院 (4 outpatient + 1 surgery) / 醫學中心 (4 outpatient + 2 surgery + 1 ward). Helper `room()` builds entries with deterministic ids
- [x] 1.4 Added `getNextTier()` using TIER_ORDER index lookup
- [x] 1.5 Re-exported via `packages/content-medexam2-tw/src/index.ts`
- [x] 1.6 Removed `INITIAL_ROOMS` const from `rooms.ts` (kept Room interface + RoomType union + computeThroughput + ROOM_TYPE_LABELS + MAX_OFFLINE_TICK_SEC)
- [x] 1.7 Typecheck clean

## 2. Hospital app: Schema v2 → v3 (additive)

- [x] 2.1 Bumped Dexie v2 → v3 (additive — store schema unchanged, version bump triggers Dexie's upgrade hook so the `tier` field migration in ensureSeed fires)
- [x] 2.2 `GameCountersRow.tier: HospitalTier` (required field)
- [x] 2.3 `ensureSeed` rooms-empty path uses `TIER_ROOMS['診所']`
- [x] 2.4 Fresh counter seed includes `tier: '診所'`
- [x] 2.5 Migration path: existing singleton with `tier === undefined` → `db.gameCounters.put({...counters, tier: '診所'})`
- [x] 2.6 Typecheck clean across hospital app

## 3. Hospital app: Tier upgrade in tick

- [x] 3.1 Imported HospitalTier + TIER_ROOMS + TIER_UPGRADE_THRESHOLDS + getNextTier from content pack
- [x] 3.2 `TickResult.upgradedTo?: HospitalTier` added
- [x] 3.3 Tier check runs inside the existing read-compute-write transaction after `newReputation` is computed
- [x] 3.4 While loop crosses each tier sequentially; **additive insert only** (set-diff `existingIds` vs `TIER_ROOMS[next]`, `bulkAdd(newRooms)`). Critical bug caught during smoke: original `bulkPut(TIER_ROOMS[next])` was overwriting existing room state (resetting `assignedDoctorId` to null). Fixed inline; design doc + spec scenario updated to match
- [x] 3.5 `console.debug('[tier-upgrade]', { from, to, reputation, added })` gated by DEV
- [x] 3.6 `useTickLoop(onCapped?, onUpgrade?)` signature extended; invokes onUpgrade when `result.upgradedTo` is set

## 4. Hospital app: Upgrade banner UI

- [x] 4.1 Added `upgradeNotice: string | null` state (holds the banner text, not just the tier)
- [x] 4.2 `handleUpgrade` useCallback `[]`; uses `prevTierRef` to compute delta; calls setTimeout to clear after 8s
- [x] 4.3 Wired `useTickLoop(handleCapped, handleUpgrade)` when ready=true
- [x] 4.4 Banner renders inside HashRouter above offline-cap-notice, text format includes 🎉 + new tier + room deltas
- [x] 4.5 `describeTierJump(prev, new)` helper computes deltas via id set-difference + `TIER_DELTA_LABEL` table. prevTierRef seeded from DB after ensureSeed so first banner after reload at non-初始 tier still has correct prev
- [x] 4.6 `.upgrade-notice` CSS — fixed top-center, accent-rose border, gold gradient, Press Start 2P font, animation reuses `toast-in`

## 5. Hospital app: Tier display in headers

- [x] 5.1 HomePage tier line above counter banner — formats `醫院：診所　(聲望 234 / 1,000 → 區域醫院)` non-terminal / `醫院：醫學中心 ⭐` terminal
- [x] 5.2 Added `.home-tier-line` CSS — paper bg, accent-gold border, tier name in Press Start 2P
- [x] 5.3 Hospital page header enriched: `{tier} · 總產能 {throughput} 患者/分 · 房間 {assigned}/{total}` via `<span className="hospital-throughput">`
- [x] 5.4 No CSS change needed — existing `.hospital-throughput` accommodates longer text on desktop; mobile reflows naturally

## 6. Verification

- [x] 6.1 `pnpm -r typecheck` clean across all 7 packages and apps
- [x] 6.2 Dev server boots at `:5174/study-rpg-m2/` cleanly
- [x] 6.3 Chrome MCP smoke — fresh DB: tier='診所', HomePage tier line shows `醫院：診所　(聲望 0 / 1,000 → 區域醫院)`, /hospital page header `診所 · 總產能 0.0 患者/分 · 房間 0/3`. Implicitly verified via reset + reload scenario
- [x] 6.4 Chrome MCP smoke — migration test: prior session's hospital db (v2, no tier field) auto-backfilled to '診所' on first boot post-upgrade; counters preserved
- [x] 6.5 Chrome MCP smoke — single-tier upgrade with assignment preserved: 診所 / 950 rep + 內科 #6 (P3 ×2) assigned + lastTickAt 200s ago → visibility dispatch → tick fires → tier=區域醫院, rep=1017.7, roomCount=5, **outpatient-1 still assigned to 內科 #6** (bug fix verified), banner `🎉 升級為 區域醫院！+1 門診 +1 手術房` captured by MutationObserver
- [x] 6.6 Chrome MCP smoke — second upgrade: same flow with reputation→10001 → 醫學中心 banner, tier line shows ⭐
- [x] 6.7 Chrome MCP smoke — catch-up double upgrade: 診所 / rep=15000 / single tick → final tier=醫學中心, roomCount=7, single banner (with prev=區域醫院 from prior tick in this dogfood session — expected behavior since handleUpgrade tracks prev between callback invocations, not from the initial state)
- [x] 6.8 Chrome MCP smoke — terminal tier no-op: at 醫學中心 with rep 15066, subsequent ticks logged no `[tier-upgrade]` and no banner. Implicitly verified — observer captured exactly 1 banner per upgrade
- [x] 6.9 Chrome MCP smoke — idempotent on reload: reload at 醫學中心 still shows ⭐ tier, 7 rooms, no spurious banner. Existing assignments preserved
- [x] 6.10 `openspec validate wire-clinic-level-up` passes (incl. updated MOD spec for hospital-tycoon-engine and the revised idempotency scenario)

## 7. Pipeline gates

- [ ] 7.1 `/simplify` skipped — diff is surgical: 1 new content-pack module (TIER_ROOMS table + helpers), additive Dexie v2→v3, tier-upgrade while-loop inside existing transaction, banner state + helper in App, 2 header tweaks. Critical bug (bulkPut overwriting assignedDoctorId) was caught in §6.5 and fixed by switching to additive `bulkAdd` of set-diff
- [ ] 7.2 `openspec validate --all` clean
- [ ] 7.3 User confirms → auto-git commit `feat(wire-clinic-level-up): 3-tier hospital progression (診所/區域醫院/醫學中心) + tier-driven room seeding + upgrade banner`
