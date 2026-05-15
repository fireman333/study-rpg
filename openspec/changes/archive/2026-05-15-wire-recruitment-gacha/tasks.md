## 1. Core: generic gacha API (refactor loot.ts)

- [x] 1.1 Create `packages/core/src/lib/gacha.ts` with `GachaTier`, `PityRule`, `GachaConfig`, `GachaStats` types and `rollGacha(config, stats, rng?)` function
- [x] 1.2 Export `rollGacha` and related types from `packages/core/src/index.ts`
- [x] 1.3 Refactor `packages/core/src/lib/loot.ts` so `rollRarity` internally delegates to `rollGacha`, preserving identical signature and return shape for `rollLoot`
- [x] 1.4 Run `pnpm --filter @study-rpg/core typecheck` — must pass clean
- [x] 1.5 Smoke verify 一階 unaffected: `apps/medexam-tw` boots on :5173, char sprite + stats area render, 0 console errors after refactor (Chrome MCP verified)
- [x] 1.6 (Optional) seed-locked 10k roll distribution check: before/after rarity counts identical (0 mismatches, all 5 tier counts byte-equal, pity counts equal — exceeds chi-square requirement)

## 2. Content pack: recruitment data table

- [x] 2.1 Create `packages/content-medexam2-tw/src/recruitment.ts` exporting:
  - `RECRUITMENT_THRESHOLDS: Record<SubjectId, number>` with the 14 locked values from design.md Decision 5
  - `RECRUITMENT_WEIGHTS: GachaTier[]` with the P5/P4/P3/P2/P1 = 60/25/10/4/1 distribution
  - `RECRUITMENT_PITY_RULES: PityRule[]` matching design.md Decision 3 (30 → P3+, 100 → P2+)
  - `RARITY_POWER_MULTIPLIER: Record<Rarity, number>` with `{P1:5.0, P2:3.5, P3:2.0, P4:1.0, P5:0.5}`
  - `RARITY_LABELS: Record<Rarity, string>` with the Chinese tier labels
- [x] 2.2 Add a build-time assertion in `packages/content-medexam2-tw/scripts/build.ts` (or new check) that each subjectId in `RECRUITMENT_THRESHOLDS` exists in built `subjects.json`, and fail build with `imported/skipped/total` summary if mismatch
- [x] 2.3 Export the recruitment module from `packages/content-medexam2-tw/src/index.ts`
- [x] 2.4 Run `pnpm --filter @study-rpg/content-medexam2-tw typecheck` and `pnpm --filter @study-rpg/content-medexam2-tw build` — both must pass

## 3. App: Dexie schema v1 for medexam2-hospital-tw

- [x] 3.1 Create `apps/medexam2-hospital-tw/src/db/schema.ts` defining Dexie database `study-rpg-medexam2-hospital-tw` with v1 stores: `affinity`, `doctors`, `gachaStats`, `tickets`
- [x] 3.2 Add type-safe wrappers `getAffinity(subjectId)`, `incrementAffinity(subjectId)`, `getAllAffinities()`, `getTickets()`, `consumeTicket()`, `getGachaStats()`, `setGachaStats(s)`, `addDoctor(d)`, `listDoctors()`, `countDoctorsForSubject(subjectId)`
- [x] 3.3 On db init / boot, run `refreshDailyTickets()` that reads `tickets.lastRefreshDay`, computes day delta, adds `min(delta, 99 - available)` tickets, updates `lastRefreshDay`
- [x] 3.4 First-boot seed via `ensureSeed()`: initializes `tickets` row with `INITIAL_TICKETS` + `currentEpochDay()`; initializes `gachaStats` row with zeroed `rollsSinceLast` for each pity-rule tier; affinity rows lazily created on first increment

## 4. App: recruitment service layer

- [x] 4.1 Create `apps/medexam2-hospital-tw/src/services/recruitment.ts` exporting `attemptRoll(subjectId, displayName): Promise<RollOutcome>` that:
  - reads `affinity[subjectId]` and `tickets.available`
  - returns `{ ok: false, reason: 'banner-locked', missing: N }` if `affinity < threshold`
  - returns `{ ok: false, reason: 'no-tickets' }` if `tickets.available < 1`
  - else calls `rollGacha` with content-pack's `RECRUITMENT_WEIGHTS` + `RECRUITMENT_PITY_RULES`, decrements ticket, increments `gachaStats.totalRolls`, persists new doctor, returns `{ ok: true, doctor, wasPity }`
- [x] 4.2 Doctor name generation inlined in `attemptRoll` via `countDoctorsForSubject` — returns `"<displayName> 醫師 #<count+1>"`
- [x] 4.3 Unlock notification fires from HomePage `handleAffinityIncrement` (cross-threshold detect) — kept in UI layer for direct access to toast state

## 5. App: HomePage UI with 14 banners

- [x] 5.1 Replace placeholder content in `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` — banner grid 3-col desktop / 2-col tablet (≤900px) / 1-col mobile (≤600px)
- [x] 5.2 Create `RecruitmentBanner` component accepting `{subject, affinity, threshold, ticketsAvailable, onRoll}` — locked state with `「再答對 N 題<科別>解鎖」` text + greyed; unlocked state with active roll button colored by `subject.color`
- [x] 5.3 Header bar shows `🎟️ available / 99` ticket counter + roster nav link
- [x] 5.4 HomePage uses `useLiveQuery` for `db.affinity.toArray()` and `db.tickets.get('global')` reactivity

## 6. App: result modal + roster page

- [x] 6.1 `RecruitmentResultModal` displays Pn tier label (Chinese 夯/頂級/人上人/NPC/拉完了), subject, powerMultiplier, sprite placeholder (emoji + rarity-colored frame); 保底 badge when `wasPity`
- [x] 6.2 Framer Motion spring entry animation (stiffness 240 / damping 22 — lightweight scale+fade)
- [x] 6.3 `DoctorRoster` page at `/roster` (HashRouter) — subject + rarity filter, sorted newest first, empty-state CTA
- [x] 6.4 `App.tsx` wires HashRouter: `/` → HomePage, `/roster` → DoctorRoster; HashRouter chosen to keep GH Pages deploy simple (no SPA fallback needed)

## 7. App: dev-only mock affinity wire

- [x] 7.1 `<DevAffinityControls>` gated by `import.meta.env.DEV`, 14 buttons per subject calling `incrementAffinity`
- [x] 7.2 Mounted inside HomePage below banner grid
- [x] 7.3 Prod build strips component — `grep -c "練習答對" dist/assets/*.js` returns `0` (DEV gate fires dead-code elimination as expected); CSS classes for the panel remain in bundle but never render

## 8. End-to-end smoke (Chrome MCP per chrome_mcp_preflight rule)

- [x] 8.1 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` boots clean on http://localhost:5174/study-rpg-m2/ (HTTP 200, Vite ready in 800ms)
- [x] 8.2 Chrome MCP `list_connected_browsers` → 1 browser, navigated to dev URL
- [x] 8.3 HomePage renders 14 banners, all `0 / N` progress, header shows `🎟️ 10 / 99`, dev panel has 14 buttons, 0 console errors
- [x] 8.4 Bulk-clicked 內科 dev button 66 times → progress `66 / 66`, banner unlocked, toast `「內科 招募解鎖！」` fired, roll button enabled
- [x] 8.5 5 rolls on 內科 → tickets 10→5, modal shows P3/P3/P5/P5/P4 sequence (seq #1–#5 names), /roster lists all 5 doctors
- [x] 8.6 泌尿科 (affinity 0, threshold 9) renders locked state with `「再答對 9 題泌尿科解鎖」`, no roll button, tickets unchanged
- [x] 8.7 IndexedDB manual write `gachaStats.rollsSinceLast.P3 = 30` → next roll yields P3 + 保底 badge visible

## 9. Pipeline gates

- [x] 9.1 `pnpm -r typecheck` clean across all 7 packages and apps
- [x] 9.2 一階 app (`apps/medexam-tw` on :5173) boots, char sprite + stats area render, 0 console errors — loot refactor is non-breaking
- [x] 9.3 `/simplify` review on the diff — 3 parallel review agents (reuse / quality / efficiency) returned 7 actionable findings. Applied: (a) export `randomId` from core, drop duplicate `newDoctorId`; (b) `attemptRoll` takes `Subject` instead of `(subjectId, displayName)`; (c) single `db.transaction('rw', ...)` for ticket+stats+doctor atomicity; (d) `after === threshold` TOCTOU fix; (e) `getGachaStats` and `ensureSeed` use core's `initialGachaStats`; (f) drop dead `color: var(--ink)` CSS line; (g) align meta label "powerMultiplier"→"×力" in modal for roster parity. Rejected `<DoctorCard>` extraction (CSS-namespace divergence makes the abstraction net-zero). Skipped flagged-but-deferred: pagination, content-pack memo, branded SubjectId, move MS_PER_DAY to core (surgical change rule). Smoke re-verified on fresh DB: unlock 泌尿科 (9 affinity) → toast fires once → roll → P4 NPC #1, tickets 10→9.
- [x] 9.4 `/opsx:verify` — completeness 38/41 (remaining 3 = meta-gates), correctness 11/11 requirements have impl evidence, coherence 9/9 design decisions reflected. `openspec validate` PASS. 0 CRITICAL / 0 WARNING / 4 SUGGESTION (uncovered scenarios: wrong-answer vacuous / P2-pity 100 impractical / daily refresh clock-dep / cap clamp by inspection / empty roster markup-only).
- [x] 9.5 `/verify` — task type auto-detected as `vibe-web`. Step 1c Chrome MCP e2e (fresh DB → 14 banners → unlock 泌尿科 at 9 → toast → P4 doctor → tickets 10→9 → 0 console errors). Step 1.5 dead code audit (knip): cleaned 8 Class-1 orphans in schema.ts (helpers inlined into service transaction by 9.3 refactor became unused exports); 4 remaining flags are Class-2 pre-existing (`@study-rpg/theme-pixel-hospital` near-term needed for add-doctor-sprite-roster; core package's `dexie-react-hooks`, `framer-motion`, `@types/react*` are pre-existing scaffold deps not in this diff). Step 2 /simplify skipped (already done in 9.3, findings applied).
- [x] 9.6 User confirmed → committed as `50c7661 feat: wire recruitment gacha for 二階 hospital app` (21 files / +1994 / -95)
