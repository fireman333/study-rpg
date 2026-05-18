## 1. Content package constants

- [x] 1.1 Add `TARGETED_REROLL_CAP = 5` constant to `packages/content-medexam2-tw/src/fate-cards.ts` (export named constant)
- [x] 1.2 Confirm `FATE_CARD_TARGETED_TICKET_RARITY` (existing, line 106-109) still maps `targeted-p3-ticket → P3` and `targeted-p2-ticket → P2`; no change expected
- [x] 1.3 Run `pnpm --filter @study-rpg/content-medexam2-tw build` to confirm content pkg builds clean

## 2. Dexie schema bump (二階 HospitalDB v9)

- [x] 2.1 In `apps/medexam2-hospital-tw/src/db/schema.ts`, append `this.version(9).stores({ targetedTickets: 'id, status, subjectId, obtainedAt, updatedAt', targetedTicketHistory: 'ticketId, at, event' })`
- [x] 2.2 Add `TargetedTicket` and `TargetedTicketHistoryRow` interfaces (per design.md schema definitions: `id / subjectId / minRarity / status / obtainedAt / assignedAt / consumedAt / resultDoctorId / sourceFateCardTier / updatedAt`)
- [x] 2.3 Register `targetedTickets` and `targetedTicketHistory` as typed Dexie `Table<>` properties on `HospitalDB` class
- [x] 2.4 Smoke-loaded `localhost:5177/study-rpg/hospital/` — Dexie reports stored version `90` (= v9) on existing-data profile, no console errors during boot; `objectStoreNames` includes `targetedTickets` + `targetedTicketHistory`

## 3. Targeted ticket service layer

- [x] 3.1 Create `apps/medexam2-hospital-tw/src/services/targeted-ticket.ts` with helpers: `createPendingTargetedTicket(tier: 'epic' | 'legendary')`, `assignTargetedTicket(id, subjectId)`, `consumeTargetedTicket(id, subject)`, `getPendingTargetedTickets()`, `getAssignedTargetedTickets()`
- [x] 3.2 In the same file, implement rarity-floor reroll loop per design.md decision #3 — call `rollGacha` with `RECRUITMENT_WEIGHTS` + empty pity stats up to `TARGETED_REROLL_CAP = 5` times; if all sub-floor, force the floor tier via degenerate weight table
- [x] 3.3 Force-floor implementation — `rollGacha` with `tiers: [{ id: minRarity, weight: 1 }]` guarantees floor tier; sprite + doctor row creation reuses existing `resolveSpriteKey` from `services/recruitment.ts`
- [x] 3.4 Wire `consumeTargetedTicket` to atomically (Dexie transaction wrapping `targetedTickets + targetedTicketHistory + doctors`): roll → insert `doctors` row → update `targetedTickets.status = 'consumed'` + `resultDoctorId` → append `targetedTicketHistory` row with `event = 'consumed'` + rarity meta
- [x] 3.5 Confirmed: targeted consume transaction excludes `db.tickets` and `db.gachaStats`; `rollGacha` invoked with empty stats `{ totalRolls: 0, rollsSinceLast: {} }` + empty `pityRules: []` so neither global ticket counter nor pity counter is touched

## 4. Fate card resolution rewrite

- [x] 4.1 In `apps/medexam2-hospital-tw/src/services/fate-card.ts:145-152`, replaced fallback `grantTickets(1)` for `targeted-p3-ticket` and `targeted-p2-ticket` cases with `createPendingTargetedTicket('epic')` / `createPendingTargetedTicket('legendary')`; added `db.targetedTickets, db.targetedTicketHistory` to outer transaction's table list for nested-tx join
- [x] 4.2 Extended `RewardEffectResult` + `FateCardServiceResult` with optional `targetedTicketId` field; UI consumer reads this to open picker modal at the just-created row
- [x] 4.3 Confirmed `createPendingTargetedTicket` appends `targetedTicketHistory` row with `event = 'obtained'` + `sourceFateCardTier` meta (per service implementation Section 3.1)
- [x] 4.4 Verified common (`recruitment-ticket-x3`) and rare (`recruitment-ticket-x10`) paths untouched — both still call `grantTickets(N)` into global `tickets.available` pool

## 5. FateCardPage UI: subject picker modal + double-step confirm

- [x] 5.1 New `TargetedTicketPicker.tsx` component opened from `FateCardPage.tsx` after `pickerTicketId !== null && outcome === null` (i.e., user dismissed outcome modal); picker hosts its own two-stage flow (pick → confirm) and self-closes on assign / save-for-later
- [x] 5.2 Picker lists `subjects.filter(s => affinity[s.id] >= RECRUITMENT_THRESHOLDS[s.id])` using `getContentPack` + `useLiveQuery(db.affinity.toArray())` — flat grid of unlocked banners only
- [x] 5.3 Tap on subject row → sets `confirmSubject` state → Stage 2 modal renders with copy「確定要把這張 ${tier} targeted ticket 指派給 ${subjectDisplayName}？此操作不可逆」+「我再想想」/「確認指派」buttons
- [x] 5.4 「確認指派」 → `assignTargetedTicket(ticketId, subjectId)` → `onAssigned` callback fires → page sets `assignedToast` state for 3.5s banner「✓ targeted ticket 已指派給 ${subjectDisplayName}」 → picker closes via `onClose`
- [x] 5.5 「我再想想」 → `setConfirmSubject(null)` → Stage 1 re-renders, ticket row remains `status = 'pending'`
- [x] 5.6 Stage 1 footer has 「稍後再決定」secondary button → calls `onClose` → ticket stays `pending`; backdrop click also closes Stage 1
- [x] 5.7 Empty state (no unlocked banners) renders copy「目前沒有解鎖中的 banner — ticket 已存為 pending，解鎖任一科後即可指派」+ single 「了解」close button

## 6. FateCardPage UI: pending ticket chip

- [x] 6.1 Added `useLiveQuery(() => db.targetedTickets.where('status').equals('pending').toArray())` to `FateCardPage.tsx`
- [x] 6.2 Conditional `.targeted-ticket-pending-chip` rendered right under SurfaceHint when `pendingTickets.length > 0`; tap → `setPickerTicketId(pendingTickets[0].id)` reopens picker for the first pending row
- [x] 6.3 Chip is gated by `pendingTickets.length > 0`; auto-hides when count drops to 0

## 7. RecruitmentPage UI: targeted ticket section

- [x] 7.1 Created `apps/medexam2-hospital-tw/src/components/TargetedTicketSection.tsx` — composite component (row list + confirm modal) renders 0-row hide, subject + floor badge + tier label per assigned ticket
- [x] 7.2 Wired into `HomePage.tsx` above `<section className="banners">`; `useLiveQuery` reads `targetedTickets` where `status = 'assigned'`
- [x] 7.3 Component returns `null` when `assigned.length === 0`, satisfying「No targeted tickets hides the section」scenario
- [x] 7.4 Consume button opens internal confirm modal「確定使用 ${displayName} 的 ${tier} targeted ticket？保證 ${minRarity}+」→「確認使用」calls `consumeTargetedTicket(id, subject)` → emits doctor to HomePage via `onConsumed` callback → HomePage reuses existing `RecruitmentResultModal` via `setModal({ outcome: { ok: true, doctor, wasPity: false } })`
- [x] 7.5 After consume, `status = 'consumed'` filter excludes the row from `useLiveQuery` results → row auto-disappears on next render

## 8. Cloud sync integration (二階 sync engine already shipped — wire new tables now)

- [x] 8.1 Created `supabase/migrations/0008_targeted_tickets.sql` — `targeted_tickets` table follows `hospital_doctors` blob pattern (`user_id, id, data JSONB, updated_at, app_version`, PK `(user_id, id)`)
- [x] 8.2 Same migration: `idx_targeted_tickets_user_updated ON targeted_tickets (user_id, updated_at)` for sync pull queries
- [x] 8.3 Same migration: ENABLE ROW LEVEL SECURITY + 4 policies on targeted_tickets (SELECT/INSERT/UPDATE/DELETE; all `auth.uid() = user_id`)
- [x] 8.4 Same migration: `targeted_ticket_history` table with composite PK `(user_id, ticket_id, event)` (3 events × 1 ticket = max 3 rows) + matching index + 4 RLS policies
- [x] 8.5 Created `supabase/migrations/0009_upsert_lww_targeted.sql` — `CREATE OR REPLACE FUNCTION upsert_lww` extending whitelist + 2 new `ELSIF` dispatch branches (`targeted_tickets` blob upsert / `targeted_ticket_history` composite-pk upsert); per 0006 "never edit existing migrations in place" convention
- [ ] 8.6 Apply migrations: `supabase db push` (or paste in dashboard SQL editor) **[user action — destructive, pending confirmation]**
- [x] 8.7 Added `TARGETED_TICKETS` (pk = id, mirrors hospital_doctors) + `TARGETED_TICKET_HISTORY` (composite pk by ticket_id + event, queries existing by composite for upsert) adapters to `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`; both registered in `HOSPITAL_ADAPTERS` array (now 7 entries)
- [x] 8.8 Updated `migration.ts` `snapshotLocalToBackup` to read + record both new tables; `wipeLocalSyncedTables` to clear them; `HospitalLocalBackupRecord` schema type extended with optional `targetedTickets?` + `targetedTicketHistory?` fields (post-v9 backups)
- [x] 8.9 `_updatedAt` field is part of `TargetedTicketRow` schema; `TargetedTicketHistoryRow` already auto-injected by Dexie hook (engine handles `_updatedAt` on all cloud-synced tables)
- [ ] 8.10 Sanity SQL (dashboard SQL editor) verify RLS — `set role anon; select count(*) from targeted_tickets;` SHALL fail; `select * from targeted_tickets where user_id = auth.uid();` under authed session SHALL return only own rows **[post-`supabase db push` verification]**

## 9. Tutorial integration (first-targeted-draw overlay)

- [x] 9.1 Used existing `counters.tutorial.firedTips: Record<string, true>` directly with new keys `firstEpicTargetedDraw` / `firstLegendaryTargetedDraw` (exported from `TargetedDrawTutorialOverlay.tsx` constants); no extension of `useMilestoneTips` needed since this trigger is event-driven (post-draw) not polling
- [x] 9.2 Tutorial copy lives in `TargetedDrawTutorialOverlay.tsx`'s `COPY` map:
  - Epic：「🎫 你抽到了第一張史詩 targeted ticket！選一科 unlocked 的 banner 指派給這張券，使用時保證 P3+ 等級。指派後不可改科 — 確認前會有再次提示，避免誤觸。」
  - Legendary：「🌟 傳奇 targeted ticket！同樣選一科指派，這次保證 P2+ 等級。一旦指派就無法改科 — 點選後會跳出二次確認，仔細想清楚再按「確認指派」。」
- [x] 9.3 In `FateCardPage.tsx` `handleDraw`, after `res.targetedTicketId` resolves: read `counters.tutorial.firedTips[firstKey]`; if unset, set `pendingTutorial` state → overlay renders gated by `!outcome && !pickerTicketId`; picker render is gated by `!pendingTutorial`
- [x] 9.4 Overlay's `handleDismiss` writes the flag to gameCounters.tutorial.firedTips via Dexie transaction → calls `onDismiss` → page clears `pendingTutorial` + sets `pickerTicketId` to open Stage 1 picker
- [x] 9.5 On subsequent draws of same tier, `fired[firstKey]` is truthy → skip `setPendingTutorial`, go straight to `setPickerTicketId` (verified at code-path level — runtime smoke deferred to Section 10)

## 10. Smoke + verify

- [ ] 10.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck`
- [ ] 10.2 `pnpm --filter @study-rpg/medexam2-hospital-tw build` (full prod build)
- [ ] 10.3 Dev server + Chrome MCP: at tier `醫學中心`+, first-ever epic targeted draw → tutorial overlay shows → dismiss → picker shows → tap 內科 → confirm modal「確定指派給 內科」 → 「確認指派」 → RecruitmentPage shows 內科 targeted row → consume → doctor reveal with rarity ≥ P3
- [ ] 10.4 Chrome MCP: second epic targeted draw → no tutorial overlay (milestone flag set) → picker opens directly
- [ ] 10.5 Chrome MCP: first legendary targeted draw → legendary tutorial overlay (separate from epic) → P2 floor; verify `consumeTargetedTicket` did not increment global pity (check Dexie `gameCounters` row before/after)
- [ ] 10.6 Chrome MCP: confirm modal「我再想想」cancel path → returns to picker, ticket stays pending
- [ ] 10.7 Chrome MCP: with 0 unlocked banners, force a targeted reward (via dev tool / scripted scenario) → picker shows empty state → "save for later" path → reload page → pending chip persists with count 1
- [ ] 10.8 Chrome MCP: after Task 10.7, unlock 內科 by answering questions → tap pending chip → picker shows 內科 selectable → confirm flow → row appears on RecruitmentPage
- [ ] 10.9 Chrome MCP SPA route test on `/fate-cards` and `/recruitment` (or whichever route names exist): in-app nav + direct URL nav + F5 reload, no 404 or console errors (per `~/.claude/imports/chrome_mcp_preflight.md` SPA verification triplet)
- [ ] 10.10 Cloud sync smoke: sign in with Google → trigger epic draw → assign → consume → log out → log in on second device (or DEV `__sync.pullAllNow()`) → verify `targetedTickets` + `targetedTicketHistory` round-trip cleanly; verify RLS sanity SQL passes per Task 8.10
- [ ] 10.11 Run `openspec validate implement-targeted-fate-card-tickets --strict` to confirm spec deltas parse cleanly
- [ ] 10.12 Run `/opsx:verify` for completeness / correctness / coherence pass
- [ ] 10.13 Run `/verify` for end-to-end check (Chrome MCP smoke + auto-git commit gating per project rules)
