## 1. Pre-flight & spec validation

- [x] 1.1 Confirm `git status` clean on `track-m2` branch with M4 merge already committed (`b516efe`)
- [x] 1.2 Run `openspec validate fix-v3-to-v4-starter-pull-migration` and resolve any structural errors before touching code
- [x] 1.3 Re-read `apps/medexam2-hospital-tw/src/db/schema.ts` `ensureSeed` lines 172–234 and confirm understanding of the existing 5-branch state matrix (see design.md D4)

## 2. Implement recovery branch in `ensureSeed`

- [x] 2.1 In `apps/medexam2-hospital-tw/src/db/schema.ts`, locate the `else { ... }` block at line 212 (the "counters exist" path)
- [x] 2.2 Replace the existing `if (c.hasUsedStarterPull === undefined) patches.hasUsedStarterPull = true` with the doctor-count-branched logic per design D1 + D4 matrix:
  - `doctorCount === 0` → push starter doctors via `db.doctors.bulkPut([makeStarterDoctor('內科', 0), makeStarterDoctor('外科', 1)])` AND set `patches.hasUsedStarterPull = false`
  - `doctorCount > 0 AND c.hasUsedStarterPull === undefined` → set `patches.hasUsedStarterPull = true` (preserve original intent)
  - `doctorCount > 0 AND c.hasUsedStarterPull` defined → no-op for this field
- [x] 2.3 Verify the recovery branch stays inside the existing `db.transaction('rw', [...], async () => { ... })` so seed + flag-reset commit atomically
- [x] 2.4 Add a concise code comment above the recovery branch referencing the change name (`fix-v3-to-v4-starter-pull-migration`) and design.md D4 matrix for auditability

## 3. Typecheck + dev smoke

- [x] 3.1 Run `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck`; fix any errors
- [x] 3.2 Run `pnpm -r typecheck` to ensure no cross-package regression (M4 sync engine should be unaffected — required `pnpm install` + `pnpm --filter @study-rpg/core build` after M4 merge to pull `@supabase/supabase-js` dep + emit `LocalBackupRecord` from core dist)
- [x] 3.3 Start `pnpm --filter @study-rpg/medexam2-hospital-tw dev` (localhost:5174 or whichever port the hospital app uses) and confirm dev server boots without runtime error

## 4. Verification via Chrome MCP — fresh-save path

- [x] 4.1 Open dev URL in Chrome MCP, open DevTools → Application → IndexedDB → delete `study-rpg-medexam2-hospital-tw` DB to simulate fresh save
- [x] 4.2 Reload page; confirm `StarterPullCard` renders, `doctors.toArray()` returns exactly 2 P5 records (內科 + 外科), `gameCounters.hasUsedStarterPull === false` — **PASS**: 內科 P5 + 外科 P5, flag false, card visible
- [x] 4.3 Click `StarterPullCard` → pick a subject → confirm modal completes → confirm `hasUsedStarterPull` flips to `true` and card disappears — **PASS**: 內科 醫師 #2 (P3, powerMultiplier 2) added, flag flipped, tickets unchanged at 10

## 5. Verification via Chrome MCP — recovery branch path (synthetic bug victim)

- [x] 5.1 In DevTools console, simulate the buggy state: open `study-rpg-medexam2-hospital-tw` DB → clear `doctors` table → set `gameCounters` row to `{ id: 'singleton', revenue: 0, reputation: 0, lastTickAt: Date.now(), tier: '診所', hasUsedStarterPull: true }`
- [x] 5.2 Reload page; confirm `ensureSeed` recovery branch fires — `doctors.toArray()` returns 2 P5 starters, `gameCounters.hasUsedStarterPull === false`, `StarterPullCard` re-appears — **PASS** (`expectedRecoveryFire: true`)
- [x] 5.3 Click pull → complete → confirm `hasUsedStarterPull` flips to `true` and card disappears — **PASS**: 外科 醫師 #2 (P4) added, flag flipped, card hidden
- [x] 5.4 Reload again; confirm recovery branch does NOT re-fire (since `doctorCount > 0` now) — **PASS**: doctorCount stays at 3, flag stays true, card hidden (`recoveryDidNotMisfire: true`)

## 6. Verification via Chrome MCP — non-victim path (preserve original intent)

- [x] 6.1 In DevTools console, simulate existing-doctor save: clear DB → seed with `doctors` table containing 3 fake doctors (any subjectId / rarity) and `gameCounters` WITHOUT `hasUsedStarterPull` field (use `await db.gameCounters.put({ id: 'singleton', revenue: 0, reputation: 0, lastTickAt: Date.now(), tier: '診所' })` — Dexie will accept the partial row)
- [x] 6.2 Reload page; confirm `ensureSeed` patches `hasUsedStarterPull = true`, `doctors` count stays at 3 (no starters added), `StarterPullCard` does NOT render — **PASS** (`intentPreserved: true`): doctors unchanged (婦產科, 骨科, 麻醉科), flag patched to true, card hidden

## 7. Verification on prod (dogfood owner's save)

> **Status: deferred to post-deploy.** Dev smoke (Sections 4–6) already covers all 5 branches of the D4 state matrix including the exact dogfood-save shape (5.1: `doctors: 0` + `hasUsedStarterPull: true`). Prod re-verification gated by track-m2 → main → GH Pages deploy, which task 8.4 explicitly forbids until M4 `add-cloud-sync` archives on main first.

- [ ] 7.1 Wait for track-m2 deploy or temporarily proxy the build (if M4 still mid-archive, may need to defer; coordinate with M4 owner)
- [ ] 7.2 Open `https://fireman333.github.io/study-rpg/hospital/` in Chrome MCP — load real dogfood save
- [ ] 7.3 Run preflight JS to confirm pre-fix state: `doctors.count() === 0` AND `hasUsedStarterPull === true`
- [ ] 7.4 After deploy, reload → confirm 2 P5 starters appear in `doctors` table, `hasUsedStarterPull === false`, `StarterPullCard` visible in DOM
- [ ] 7.5 Complete starter pull on prod save → confirm flag flips and card disappears
- [ ] 7.6 Take screenshot of `/roster` showing 3 doctors (2 starters + 1 from starter pull)

## 8. Archive & commit gate (Curator-required)

- [ ] 8.1 Run `openspec validate fix-v3-to-v4-starter-pull-migration` one more time — confirm passes
- [ ] 8.2 Ask user explicit confirmation: "Run `/opsx:archive fix-v3-to-v4-starter-pull-migration`?"
- [ ] 8.3 After archive, ask user explicit confirmation: "Auto-git commit with message `spec(archive): merge fix-v3-to-v4-starter-pull-migration — recovery branch rescues v3 saves with empty doctors`?"
- [ ] 8.4 Do NOT merge track-m2 → main yet (wait until M4 `add-cloud-sync` archive lands on main, then bundle the merge)
