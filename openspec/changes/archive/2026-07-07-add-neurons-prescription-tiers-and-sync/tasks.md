## 1. Plan tier-spec fields + tier derivation (pure fns)

- [x] 1.1 Extend `PrescriptionPlan` in `apps/neurons-tw/src/lib/services/prescription.ts` with the frozen tier-spec fields `t2Kind` / `t2Extra` / `t3Kind` / `t3Target` / `t4Kind` / `t4Target` (all optional for legacy-plan tolerance: a plan missing them → tier panel hidden, derivation returns tier-absent). Document dogfood-tunable defaults: T2 ≈ 3 extra corrections, T3 target 1 synapse, T4 ≈ 12 cumulative corrections AND 2 synapses; energy 10/15/20/25 (Σ = 70).
- [x] 1.2 Add `deriveTierSpec(...)` pure fn computing the frozen tier spec at plan generation from the SAME frozen snapshots: T2 pool = `wrongEligibleQuestionIds` overflow beyond the T1 target; auto-shrink + frozen fallback chain when short — `t2Kind: 'wrongOverflow' → 'breadth' → 'cram'` with the cram fallback DOUBLING the target (`t2Extra × 2`, counted via `cramRescue:{date}:{qid}` keys); T4 targets shrink to what the frozen pools make achievable. NEVER freeze an unachievable objective (spec: no「今天不可能達成」dead state).
- [x] 1.3 Wire `deriveTierSpec` into `getOrCreateTodayPlan` so every NEW plan freezes its tier spec at generation (existing frozen plans stay untouched — reader tolerance, no migration).
- [x] 1.4 Add `deriveTier(plan, progress)` pure fn: `derivedTier` from the winner plan's frozen spec + UNION'd progress key counts (wrong/breadth/cramRescue/wire), and `displayTier = max(derivedTier, highestClaimedTier)` where `highestClaimedTier` derives from `reward:{date}` + `tierClaim:{date}:{2|3|4}` presence (claim-floor; same-day monotonic display). Export both for tests. Extend `PrescriptionStatus` with the tier fields the card needs.

## 2. Synced-key matcher + plan MIN-LWW post-pass

- [x] 2.1 Add the new key mints in `prescription.ts`: `wireKey(date, pairKey)` → `prescription:v1:wire:{date}:{pairKey}` and `tierClaimKey(date, tier)` → `prescription:v1:tierClaim:{date}:{2|3|4}` (value `{claimedAt, energy, familyId}`), both write-once.
- [x] 2.2 Export a single-source prescription synced-key matcher from `prescription.ts` (mirror `IMPRINT_PREFIX` single-sourcing), e.g. `isSyncedPrescriptionKey(key, todayISO())`: `plan:` / `wrong:` / `breadth:` / `cramRescue:` / `wire:` / `tierClaim:` match within today ±1 local day; `completed:` / `reward:` match ALL dates; `lightsOut:` / `localSeed` NEVER match. Unit-test the window edges (yesterday ✓, tomorrow ✓, −2 days ✗).
- [x] 2.3 `apps/neurons-tw/src/lib/sync/tables.ts` (`isSyncedMetaKey`, ~line 506): add the imported matcher as a third clause (`SYNCED_META_KEYS.has(key) || key.startsWith(IMPRINT_SYNC_PREFIX) || isSyncedPrescriptionKey(key)`). Snapshot and apply already share this test — CONFIRM no other membership test exists.
- [x] 2.4 NEW `apps/neurons-tw/src/lib/sync/backfill/prescription-plan.ts`: earliest-createdAt-wins MIN-LWW post-pass over in-window `plan:{date}` keys — keep min `(createdAt, seed)` (min createdAt, tie-break min seed); malformed/unparsable incoming → keep local. Register it in `backfill/index.ts` `runOnPullComplete` (own step + try/catch isolation, mirroring steps 1b–1e).

## 3. Tier claims + wire keys + energy grant + synapse listener

- [x] 3.1 Claim + grant helper in `prescription.ts`: inside a Dexie tx write the claim key ONLY if absent (`reward:{date}` = T1's marker, now carrying the +10 grant; `tierClaim:{date}:{tier}` for T2–T4); when THIS tx did the absent→present transition, post-commit grant the FLAT energy — direct `earned = current + energy` on `maze:<familyId>:earned` (import `earnedKey` from `maze/economy.ts`; deliberately NOT `accrueMazeEnergy`, no multipliers) — then toast. Grant family = plan's `breadthFamilyId` when non-null, else deterministic fallback from the frozen plan's `date + seed` over `FAMILY_IDS` (never random/time-dependent).
- [x] 3.2 Pull-replay safety: applying an incoming claim via sync marks the tier claimed (claim-floor) but MUST NOT re-grant locally — grants fire ONLY on the local absent→present transition in 3.1. Add a code comment naming this the load-bearing idempotency point.
- [x] 3.3 Tier-crossing hooks: (a) tail of `recordPrescriptionAnswer` — after progress writes, recompute `deriveTier` and claim any newly-crossed tier; (b) the cram record point (`recordCramRescueAnswer` tail) — same recompute when T2 is in cram-fallback mode; (c) the synapse listener (3.4) — recompute after a new wire key. Return crossing info so `QuizModal.tsx` can surface the toast at the verdict moment.
- [x] 3.4 Synapse-event listener: boot-time registration (mirror `initializeDmnTrigger` in `dmn-trigger.ts`, idempotent on StrictMode double-mount) on `connectome.synapseFormed` + `connectome.synapseStrengthened` → write-once `wire:{date}:{pairKey}` → tier recompute. **Anti-farm (design D6, judgment call)**: credit a wire key toward tiers only when the settlement's counted repairs include pre-today wrongs — recommended: check intersection with the plan's frozen `wrongEligibleQuestionIds` at the settlement hook point (`creditConnectomeFromExpedition` call site in `OverviewPage.tsx`) where flipped question ids are known; fallback: `everWrong`-before-today gate. Either satisfies the spec outcome — pick during apply, document in code.
- [x] 3.5 Celebration-once: gate the 「今日處方箋完成」celebration + NG-0717 stage-up presentation on `justCompleted` (the local absent→present transition of `completed:{date}`), NOT on `dayComplete` observed after a pull — a device learning completion via sync renders the completed state silently. CONFIRM the current card doesn't re-celebrate on pull-applied completion (fix if it does).

## 4. R2 SCHEMA_VERSION bump

- [x] 4.1 `apps/neurons-tw/src/lib/sync/r2/bundles.ts`: CONFIRM `SCHEMA_VERSION` is still 25 (line ~211 — pin-queue took 25; a racing change moves the base), then bump 25 → **26** and append the version-history comment (v26: prescription daily-quest date-windowed meta families + wire/tierClaim keys, plan MIN-LWW post-pass). Reader tolerance is the existing bundle contract — no other gating.

## 5. UI (progressive-disclosure tier panel)

- [x] 5.1 `apps/neurons-tw/src/components/DailyPrescriptionCard.tsx`: tier panel renders ONLY when T1 (`dayComplete`) is done — before that, NO rows / locked placeholders / teasers (mirror the 考前救援 visibility gate). Un-reached tiers use invite tone; T1 remains the only thing worded 「完成」.
- [x] 5.2 All static tier copy as exported constants in `apps/neurons-tw/src/lib/calm-copy.ts` (joins the copy-guard literals). No 還差/未達成/落後/連續/countdown/denominator anywhere; invite phrasing only.
- [x] 5.3 T3 ephemeral glow: transient UI effect at T3 crossing (this-session only, never persisted). T4 optional cosmetic pulse: purely decorative, NO exclusive power/stat — keep it subtle.
- [x] 5.4 `QuizModal.tsx`: surface tier-crossing toasts from 3.3's returned crossing info at the verdict moment (non-punishing tone, mirror the existing 「連結已固化」note pattern).

## 6. Tests

- [x] 6.1 Tier derivation table test (pure fns): tier spec auto-shrink + fallback chain (wrongOverflow → breadth → cram×2); `deriveTier` across progress combinations; T4 requires BOTH ~12 cumulative corrections AND ≥2 synapses; legacy plan without tier fields → tier-absent.
- [x] 6.2 Claim tests: (a) idempotency — double-crossing the same tier grants once; (b) pull-replay — applying an incoming `tierClaim` does NOT grant energy locally; (c) divergent-plan-no-downgrade — after a losing plan is replaced by the MIN-LWW winner, `displayTier` never drops below the claimed tier (claim-floor).
- [x] 6.3 Wire-key dedup test: formed + strengthened same pair same day → ONE wire key, count 1; two distinct pairs → 2; cross-device UNION via snapshot→apply round-trip.
- [x] 6.4 Plan post-pass convergence test (mirror the imprint-keepsake suite): both pull orders converge to min `(createdAt, seed)`; seed tie-break; malformed incoming keeps local; progress keys from the losing plan survive (UNION).
- [x] 6.5 Matcher tests: window edges per 2.2; `lightsOut`/`localSeed` never sync; `completed`/`reward` all-dates; both snapshot AND apply directions honor the matcher.
- [x] 6.6 `SCHEMA_VERSION === 26` pin + connectome event-name pin (assert the listener subscribes exactly `'connectome.synapseFormed'` / `'connectome.synapseStrengthened'` so a rename breaks visibly).
- [x] 6.7 Copy-guard extension in `apps/neurons-tw/src/__tests__/cram-coverage.test.ts`: add 未達成|落後 to the banned regex (還差/連續 already present) and append all new tier copy constants to the guarded literals list.
- [x] 6.8 **DELIBERATE RED → update `apps/neurons-tw/src/__tests__/imprint-keepsake-sync.test.ts`**: the `SCHEMA_VERSION` pin (lines 43–45, expects 25 → 26) and the sibling local-only assertions (lines 54–94: `completed:`/`wrong:` now SYNC; `localSeed` stays false; the snapshot/apply cases that assert `completed:` is dropped now expect inclusion) flip red BY DESIGN — update the assertions to the new contract, do NOT "fix" by reverting the matcher.

## 7. Verify

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw test` all green + `pnpm -r typecheck` clean.
- [x] 7.2 `pnpm lint:dexie-fixtures` MUST NOT flag this change (zero Dexie `.version()` bump — if it flags, a Dexie bump snuck in; remove it).
- [x] 7.3 `openspec validate add-neurons-prescription-tiers-and-sync --strict` green.

## 8. Prod cross-device smoke (parent session — Chrome MCP)

- [ ] 8.1 After deploy: on prod (`med-study-rpg.com/neurons/`) with a signed-in account — complete T1 on device/profile A (celebration plays once) → pull on device/profile B (completed state renders silently, no second celebration); cross T2 on A → B shows the claimed tier + the grant family's energy reflects ONE flat +15 (Performance API for the R2 PUT, per the chrome_mcp_preflight import); verify `plan:{date}` converged (same frozen plan on both) and `lightsOut`/`localSeed` never appear in the pushed bundle.
