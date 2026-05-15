## Why

`wire-hospital-tycoon-engine` shipped 2026-05-15 — players can now assign doctors to rooms and watch revenue + reputation tick up. But **the counters lead nowhere**. There's no reason to push reputation past 100, no progression goal, no surgery / ward rooms to unlock. The closed game loop in `hospital-management-mode` master spec (4-step) calls for a「hospital upgrade → more room slots → encourages answering more questions」beat that's currently missing — the loop has a head + body but no spine pulling the player forward.

This change locks the tier progression contract that `hospital-management-mode` L40-48 + L52-54 explicitly deferred to:

- 3 discrete tiers: **診所 → 區域醫院 → 醫學中心**
- Reputation thresholds that trigger upgrades
- Room slot counts + room-type mix per tier
- Header tier label so the player sees what tier they're at + how close to next

Together with future `wire-hospital-reputation` (formula tuning), this completes the M_2nd progression spine.

## What Changes

- **Tier table** in `packages/content-medexam2-tw/src/clinic-tiers.ts` (new file):
  - `HospitalTier` union: `'診所' | '區域醫院' | '醫學中心'`
  - `TIER_ORDER: HospitalTier[]` = `['診所', '區域醫院', '醫學中心']`
  - `TIER_UPGRADE_THRESHOLDS: Record<HospitalTier, number | null>`:
    - 診所 → 區域醫院: reputation ≥ **1,000**
    - 區域醫院 → 醫學中心: reputation ≥ **10,000**
    - 醫學中心 → null (terminal)
  - `TIER_ROOMS: Record<HospitalTier, Room[]>` — full room roster per tier:
    - 診所: 3 outpatient (current `INITIAL_ROOMS`)
    - 區域醫院: 3 outpatient + 1 surgery + 1 outpatient = **5 rooms** (4 outpatient + 1 surgery)
    - 醫學中心: 4 outpatient + 1 surgery + 1 ward + 1 surgery = **7 rooms** (4 outpatient + 2 surgery + 1 ward)
  - `getNextTier(current)` / `getTierThreshold(current)` helpers

- **Schema** in `apps/medexam2-hospital-tw/src/db/schema.ts`:
  - Add `hospitalTier` field to `GameCountersRow`: `tier: HospitalTier` (default `'診所'` on seed)
  - Dexie v2 → v3 additive bump (counters table schema unchanged, only the singleton row gets a new field)
  - `ensureSeed` extended: when seeding counters, include `tier: '診所'`

- **Tier upgrade in tick** in `apps/medexam2-hospital-tw/src/lib/tick.ts`:
  - After writing accumulated reputation, check if reputation crossed the current tier's threshold
  - If so: advance `tier` to next; append new rooms (`TIER_ROOMS[newTier] \ existing room ids`) to `db.rooms` table; return `upgradedTo?: HospitalTier` in `TickResult`
  - Idempotent: room ids are deterministic (`outpatient-N`, `surgery-N`, `ward-N`) so re-running the upgrade is a no-op

- **Upgrade notification UI** in `apps/medexam2-hospital-tw/src/App.tsx`:
  - Add `onUpgrade?: (newTier: HospitalTier) => void` to `useTickLoop`
  - When upgrade fires, display celebratory banner (similar pattern to `offline-cap-notice`): `🎉 升級為 區域醫院！解鎖手術房 + 1 個門診`
  - Banner auto-dismisses after 8 seconds

- **Tier label in HomePage header**:
  - Add tier badge to `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` showing current tier + progress to next (e.g., `醫院：診所 (聲望 234 / 1,000 → 區域醫院)`)
  - Already-at-final-tier shows just `醫院：醫學中心 ⭐`

- **Hospital page header** in `apps/medexam2-hospital-tw/src/pages/Hospital.tsx`:
  - Replaces current `總產能 X 患者/分` with a richer header: `診所 · 總產能 X 患者/分 · 房間 N/M`
  - Empty room CTA also shows `「指派醫師」` regardless of tier (no special UI for newly unlocked rooms)

- **Bump `INITIAL_ROOMS` removal** in `packages/content-medexam2-tw/src/rooms.ts`:
  - `INITIAL_ROOMS` was the 診所 baseline; replaced by `TIER_ROOMS['診所']`
  - The `INITIAL_ROOMS` export is **removed** (callers updated to use `TIER_ROOMS`)

**Out of scope** (明確留給後續 changes):

- ❌ Reputation formula refinement (diminishing returns / room-type weighting / surgery vs outpatient asymmetry) → `wire-hospital-reputation`
- ❌ Pixel-art hospital scene rendering (診所 / 區域 / 中心 三階段建築 sprite + room interior diagrams) → polish layer, future change
- ❌ Room-level upgrades (`roomFacility` from 1.0 → 1.2 → 1.5 via revenue spending) → `wire-hospital-spend`
- ❌ Tier downgrade if reputation somehow drops (reputation is monotonic by design — accumulator never decrements; not applicable)
- ❌ Multi-shift doctors / fatigue mechanics → out of M_2nd scope

## Capabilities

### New Capabilities

- `clinic-level-up`: Three-tier hospital progression contract — tier order, reputation thresholds, per-tier room roster, upgrade trigger semantics, header display obligations.

### Modified Capabilities

- `hospital-tycoon-engine`: The「Fresh save SHALL seed 3 outpatient rooms at 診所 tier baseline」requirement is broadened — seeding is now driven by `TIER_ROOMS[startingTier='診所']`. The 3-room outcome is identical for fresh saves; the spec text updates to make the tier indirection explicit so that future `wire-clinic-level-up` extensions don't require modifying this requirement again. Throughput, atomic assignment, tick math, offline cap, visibility pause, counter banner, assignment UI requirements are UNCHANGED.

## Impact

- **新檔**:
  - `packages/content-medexam2-tw/src/clinic-tiers.ts` (HospitalTier + TIER_ORDER + TIER_UPGRADE_THRESHOLDS + TIER_ROOMS + helpers)
  - `openspec/specs/clinic-level-up/spec.md` (new capability spec)

- **改 file**:
  - `packages/content-medexam2-tw/src/rooms.ts` (remove `INITIAL_ROOMS` const; keep `Room` interface + `computeThroughput` + `ROOM_TYPE_LABELS` + `MAX_OFFLINE_TICK_SEC`)
  - `packages/content-medexam2-tw/src/index.ts` (export clinic-tiers module)
  - `apps/medexam2-hospital-tw/src/db/schema.ts` (Dexie v3 bump + `tier` field on counters + `ensureSeed` uses `TIER_ROOMS['診所']`)
  - `apps/medexam2-hospital-tw/src/lib/tick.ts` (post-tick tier upgrade check + room append + `upgradedTo` in result)
  - `apps/medexam2-hospital-tw/src/App.tsx` (upgrade notification banner)
  - `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` (tier badge in header + progress to next)
  - `apps/medexam2-hospital-tw/src/pages/Hospital.tsx` (enriched header: tier name + 總產能 + 房間 N/M)
  - `apps/medexam2-hospital-tw/src/styles.css` (`.tier-badge`, `.upgrade-notice`, header tweaks)
  - `openspec/specs/hospital-tycoon-engine/spec.md` (MODIFY「Fresh save SHALL seed 3 outpatient rooms」 to reference tier-driven seeding)

- **Bundle size**: ~1 KB new TS code in content pack + ~2 KB new app code. Negligible.

- **Performance**:
  - Tier upgrade check runs after every tick — single `if (reputation >= threshold && nextTier)` check in already-open transaction; negligible
  - Room append on upgrade is one-time event per tier (max 2 events ever per save) — bulkPut of 1-2 new rooms, no perf concern

- **No breaking**: 一階 app, core engine, all content packs unaffected. Existing hospital saves (with `tier` field missing on `gameCountersRow`) get auto-defaulted to `'診所'` on read (Dexie schema bump + migration in `ensureSeed`).

- **Telemetry**: `console.debug('[tier-upgrade]', { from, to, reputation, newRoomIds })` gated by `import.meta.env.DEV` — removed after dogfood validates threshold balance.

- **Dogfood signal expected**:
  - With 1 P3 doctor (×2.0) in 1 outpatient: throughput = 20 患者/分 → revenue 1 per 3 sec → 1,000 takes ~50 min active tab time
  - Hitting 區域 in <1 hour gives「fast first reward」feeling; 中心 at 10,000 is the long-game goal
  - Thresholds conservative on purpose — better to feel reachable than grindy; will tune in next dogfood pass
