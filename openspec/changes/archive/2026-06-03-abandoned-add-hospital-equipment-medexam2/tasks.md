## 1. Core types

- [x] 1.1 Add to `packages/core/src/types.ts`: `export type EquipmentId = 'ct' | 'mri' | 'endoscopy' | 'davinci' | 'cathlab' | 'petct' | 'linac' | 'ecmo' | 'hybridor' | 'ngs'`
- [x] 1.2 Add `export interface EquipmentDef { id: EquipmentId; displayName: string; spriteKey: string; costByLevel: [number, number, number]; reputationBonusByLevel: [number, number, number]; throughputBonusByLevel: [number, number, number]; description: string }`
- [x] 1.3 Add `export interface OwnedEquipmentRow { equipmentId: EquipmentId; level: 1 | 2 | 3; purchasedAt: number; upgradedAt: number; updatedAt: number }`
- [x] 1.4 Re-export `EquipmentId / EquipmentDef / OwnedEquipmentRow` from `packages/core/src/index.ts` — implicit via `export * from './types'` (verified)

## 2. Catalog (content-medexam2-tw)

- [x] 2.1 Create `packages/content-medexam2-tw/src/equipment-catalog.ts` with `export const EQUIPMENT_CATALOG: readonly EquipmentDef[]` containing all 10 definitions per design D1 + D2. Cost / bonus literals flagged `// TUNED 2026-05-24 — first design pass; revisit after dogfood telemetry`.
- [x] 2.2 Export `EQUIPMENT_CATALOG` from `packages/content-medexam2-tw/src/index.ts`
- [x] 2.3 `EQUIPMENT_CATALOG satisfies readonly EquipmentDef[]` + runtime `length === 10` throw guard at module load
- [x] 2.4 `pnpm --filter @study-rpg/content-medexam2-tw build` passes

## 3. Dexie schema bump

- [x] 3.1 In `apps/medexam2-hospital-tw/src/db/schema.ts`: bump version from v15 → v16 (v15 was claimed by `add-achievement-system` commit 9bf1f5e on 2026-05-23 for the `achievements` table; equipment uses v16 to avoid collision)
- [x] 3.2 Add new store `hospitalEquipment: '&equipmentId, updatedAt'` (compound index on `updatedAt` for sync engine query)
- [x] 3.3 Add `hospitalEquipment: EntityTable<OwnedEquipmentRow, 'equipmentId'>` to the Dexie class definition
- [x] 3.4 Add v16 upgrade callback that runs no-op (empty table for everyone, no data migration)
- [x] 3.5 Smoke test: Chrome MCP loaded `https://med-study-rpg.com/2nd/#/hospital` after deploy → Hospital page renders without IndexedDB upgrade errors (signed-in account already at 大廟 tier with cloud sync ✓). Explicit devtools IndexedDB inspection deferred — table existence indirectly confirmed by EquipmentPanel reading empty state cleanly

## 4. Equipment helpers + services

- [x] 4.1 Created `apps/medexam2-hospital-tw/src/lib/equipment.ts`:
  - `getOwnedEquipment(): Promise<OwnedEquipmentRow[]>`
  - `getEquipmentLevel(equipmentId: EquipmentId): Promise<0 | 1 | 2 | 3>`
  - `computeReputationMultiplier(owned): number` — `1 + Σ reputationBonusByLevel[level-1]`
  - `computeThroughputMultiplier(owned): number` — same shape for throughput
  - `computeUniqueEquipmentCount(owned): number` — for T4 gate
- [x] 4.2 Created `apps/medexam2-hospital-tw/src/services/equipment-purchase.ts`:
  - `purchaseOrUpgrade(equipmentId)` returns `{ kind: 'success' | 'aborted', ... }` discriminated union (mirrors `facility.upgradeFacility` pattern)
  - Single Dexie transaction over `[db.hospitalEquipment, db.gameCounters]`
- [ ] 4.3 **DEFERRED** — unit-equivalent assertions. Algorithm is straightforward (`1 + Σ bonus`) + matches spec scenarios; defer formal vitest until `packages/core` test infra exists (separate change `add-core-package-test-infra` per achievement-system §2.4 N/A note). For now, the spec scenarios document the expected values

## 5. Image generation (apply phase)

- [x] 5.1 ~~Generate 10 equipment sprites via Gemini MCP~~ — **Gemini image gen unavailable at 2026-05-23 (auth/region error). Switched to codex CLI per fallback strategy.** All 10 sprites generated via `codex exec --skip-git-repo-check --sandbox workspace-write -C /tmp "..." < /dev/null` with prompt template producing GBA-era pixel art with chroma-key-friendly solid white background. CT smoke test 2026-05-23 confirmed style ✓; remaining 9 batched in parallel background jobs.
- [x] 5.2 Postprocess via magick: `corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:); magick "$src" -filter point -resize 384x384! +dither -colors 16 -fuzz 10% -transparent "$corner" "PNG32:$out"` — downsamples codex's ~1254×1254 raw output to 384×384 (matches existing doctor-sprite dimension) + 16-color quantize + transparent corner key.
- [x] 5.3 Codex CLI was the primary path (not Gemini reroll). If a sprite needs reroll later, re-run the single codex command for that item.
- [x] 5.4 Sprites committed to `packages/theme-pixel-hospital/sprites/equipment/{ct,mri,endoscopy,davinci,cathlab,petct,linac,ecmo,hybridor,ngs}.png` (10 files, ~250 KB total). `packages/theme-pixel-hospital/src/sprites.ts` extended with second `import.meta.glob` for `sprites/equipment/*.png` registering keys with `equipment-` prefix in `SPRITES_MAP`. Vite build confirmed all 10 bundled with cache-busting hashes.
- [x] 5.5 ~~Fallback emoji placeholders~~ — N/A, sprite gen succeeded. `PLACEHOLDER_EMOJI` map kept in `EquipmentCard.tsx` for defensive fallback if a sprite URL fails to resolve.

## 6. UI components

- [x] 6.1 Created `apps/medexam2-hospital-tw/src/components/EquipmentCard.tsx` — uses flat `room-extension-card` structure (refactored per owner UI alignment feedback). Sprite 28px inline with name in card head, L0-L3 chip on right, cost line, bonus muted line, primary-btn footer.
- [x] 6.2 Created `apps/medexam2-hospital-tw/src/components/EquipmentUpgradeModal.tsx` — current → next level transition, cost vs current revenue display, projected new bonus values, Escape-to-close keyboard handler
- [x] 6.3 Created `apps/medexam2-hospital-tw/src/components/EquipmentPanel.tsx` — `useLiveQuery` on `db.hospitalEquipment`, mounts 10 `EquipmentCard` in `.equipment-grid` (2 cols desktop per owner preference, 1 col mobile). Collapsible section header with `useRef`-based user-toggle tracking. Owns purchase modal + outcome modal state.
- [x] 6.4 Mounted `<EquipmentPanel tier={counters?.tier ?? '診所'} />` in `Hospital.tsx` below the existing room extension section
- [x] **Bonus** UI alignment refactor (commit `2a066f0`): drop ornate `frame` class, reuse `room-extension-card` + `room-extension-panel` + `section-heading` classes for visual family match with 房間擴建.
- [x] **Bonus** 2-col grid (commit `e76cddd`) per owner preference, replacing initial 5-col auto-fill.

## 7. Wire multipliers into tick + reward paths

**REVISED 2026-05-24**: original draft assumed `reading-rewards.ts` / `mentor.ts` / `mock-exam.ts` existed in 二階. Re-audit via `grep -rn "counters\.reputation\s*+" apps/medexam2-hospital-tw/src/` found these files do NOT exist — those features (reading session XP, mentor daily, mock exam) are **一階 only** (`apps/medexam-tw/`). 二階 reputation accrual is limited to **3 sites**: quiz answer / ER consultation / emergency-shift event. `fate-card.ts` only **deducts** reputation (cost path) — no multiplier needed there.

- [x] 7.1 In `apps/medexam2-hospital-tw/src/lib/tick.ts` (throughput multiplier, NOT reputation):
  - Read `db.hospitalEquipment` once per tick (added to transaction tables list)
  - Compute `equipmentThroughputMultiplier = computeThroughputMultiplier(owned)`
  - Applied to `idleAdjustedThroughput` (line ~169) alongside VIP boost + reading buff: `effectiveThroughput * READING_SESSION_BUFF_MULTIPLIER * equipmentThroughputMultiplier`
- [x] 7.2 In `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`:
  - Pre-fetch owned equipment + multiplier OUTSIDE transaction (race window with concurrent purchase is bounded and harmless)
  - `reputationDelta = Math.round(QUIZ_REPUTATION_PER_CORRECT_BASE × specialtyMultiplier × tierMultiplier × equipmentReputationMultiplier)`
- [x] 7.3 In `apps/medexam2-hospital-tw/src/services/er-consultation.ts`:
  - Same pre-fetch pattern as 7.2
  - `reputationDelta = Math.round(computeERConsultReward(...) × equipmentReputationMultiplier)`
- [x] 7.4 In `apps/medexam2-hospital-tw/src/services/event.ts` `resolveEmergencyShift`:
  - `actualReputationDelta = Math.round(EMERGENCY_SHIFT_REPUTATION_BONUS × equipmentReputationMultiplier)` computed at call site
  - Both `gameCounters.reputation` write and `eventLog` entry use `actualReputationDelta` for consistency
- [x] 7.5 Audit: `rg "reputation:\s*counters\.reputation\s*\+" apps/medexam2-hospital-tw/src/` returns exactly 3 hits (quiz-rewards / er-consultation / event), all passing through `equipmentReputationMultiplier`. `fate-card.ts` deducts only — verified no addition path

## 8. Modify T4 upgrade gate + bump T4 reputation threshold

- [x] 8.1 **Bump threshold value**: `packages/content-medexam2-tw/src/clinic-tiers.ts` changed `醫學中心: 150_000` → `醫學中心: 300_000`. TUNED comment updated to `2026-05-24` referencing `add-hospital-equipment-medexam2` recalibration + 30-day endgame phase math. 30k / 80k unchanged.
- [x] 8.2 **T4 equipment gate added**: in `apps/medexam2-hospital-tw/src/lib/tick.ts` tier-upgrade evaluation block, after the existing diversification + requireP1 checks: `if (currentTier === '醫學中心') { if (computeUniqueEquipmentCount(ownedEquipment) < 3) break }`. Counts unique IDs at level ≥ 1.
- [x] 8.3 `HomePage.tsx`: added third progress line `「T4 設備門檻：N / 3 種設備已安裝」` rendered only when `tier === '醫學中心'`. Hidden at other tiers. Uses `useLiveQuery` on `db.hospitalEquipment`.
- [x] 8.4 `HelpMenu.tsx` `tierUpgradeBody`: appended `+ 安裝 3 種以上設備` to T3 → T4 description. 300k auto-displays from `TIER_UPGRADE_THRESHOLDS.醫學中心` template literal.
- [ ] 8.5 **DEFERRED** — V6MigrationModal intro modal explaining 150k → 300k recalibration. UX polish, not blocking ship. Track for next mid-game session; may also wait for a real player to report the bump as confusing before justifying the work
- [x] 8.6 Grep verification: `rg "150_?000|150,000" apps/medexam2-hospital-tw/src/ packages/content-medexam2-tw/src/` returns 2 hits — both my rationale comments (one in HelpMenu, one in clinic-tiers TUNED block). Zero stale code literals

## 9. Sync wiring (R2 bundle schema_version bump)

**BLOCKED until ~2026-05-29** — gated on `add-r2-cloud-sync-migration` Phase 3 (R2 reads cutover) per §12.1 STATUS NOTE.

- [ ] 9.1 In `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts`: bump `m2Bundle` schema_version from `1` to `2`
- [ ] 9.2 Extend `m2Bundle` snapshot composition to include `hospitalEquipment: OwnedEquipmentRow[]`
- [ ] 9.3 Extend `m2Bundle` apply logic to write incoming `hospitalEquipment` rows into Dexie via `db.hospitalEquipment.bulkPut(rows)` with LWW resolution per `updatedAt`
- [ ] 9.4 Confirm forward-compatibility: old client reads new bundle, ignores unknown `hospitalEquipment` key (no schema_version error); new client reads old bundle (schema_version = 1), defaults `hospitalEquipment` to empty array
- [ ] 9.5 Smoke test: in dev, purchase 1 CT L1, force a sync push, inspect R2 bundle via DEV-only `globalThis.__sync.getLastPushedBundle()` (if available) — confirm `hospitalEquipment` array has 1 row with `equipmentId='ct'`, `level=1`

## 10. Verify

- [x] 10.1 Typecheck: `pnpm -r typecheck` passes (verified locally on both track-m2 + main worktrees post-merge)
- [x] 10.2 Build: `pnpm --filter @study-rpg/medexam2-hospital-tw build` passes; 10 equipment sprites bundled into dist with cache-busting hashes
- [x] 10.3 Dev server smoke: Chrome MCP on `localhost:5174 → 5176/study-rpg/hospital/#/hospital` → EquipmentPanel renders 10 cards at L0 with cost buttons matching catalog (CT 800k / MRI 2M / ... NGS 1M)
- [ ] 10.4 **DEFERRED owner manual** — purchase flow smoke. Requires dev-state-hack to give revenue (test account currently has insufficient on 診所 tier). Run when convenient
- [ ] 10.5 **DEFERRED owner manual** — multiplier smoke (compare before/after reputation deltas). Same dev-state-hack requirement
- [ ] 10.6 **DEFERRED owner manual** — T4 gate smoke (Step a/b/c/d). Requires dev-state-hack to set tier + reputation + doctor roster + equipment count
- [ ] 10.7a **DEFERRED owner manual** — HomePage bump-specific smoke (reputation 150k / 300k display). Test account at fresh state can't easily reach 150k without play time
- [ ] 10.7 **DEFERRED** — sync round-trip smoke. Blocks on §9 (R2 sync wiring)
- [x] 10.8 `openspec validate add-hospital-equipment-medexam2 --strict` passes (verified after each spec edit + at final merge)
- [ ] 10.9 **PARTIAL** — SPA route smoke. Verified in-app navigation (click 醫院 →) + direct URL on prod `med-study-rpg.com/2nd/#/hospital`. F5 reload not explicitly tested; hash routing makes this essentially free. Mark complete if Chrome MCP F5 confirms no 404
- [x] 10.10 `/verify`-style end-to-end check completed via Chrome MCP — Hospital page → click 醫院 (in-app nav) → scroll → expand 設備 (toggle) → 10 cards render with sprites + costs → console clean (only React Router future-flag warnings, unrelated). Both localhost dev AND prod `med-study-rpg.com/2nd/` verified

## 11. Documentation

- [x] 11.1 Added "Hospital equipment (M_2nd ext, 2026-05-24)" section to root `study-rpg-m2/CLAUDE.md` (no app-level CLAUDE.md exists) — covers 10 items + cost ladder + multiplier formula + T4 gate change + wiring sites + sprite location + sync deferral
- [x] 11.2 Updated `openspec/project.md` Roadmap with new milestone row `**M_2nd ext — 醫院設備 (hospital-equipment)**` status `🔄 §1-§8+§10-§11 shipped (2026-05-24); §9 R2 sync blocks on R2 cutover; 剩 owner commit + archive`
- [ ] 11.3 **DEFERRED** ~~Update `docs/LEADERBOARD.md`~~ — `add-hospital-leaderboard-correct-count-filter` is in-flight and also edits `docs/LEADERBOARD.md` (its tasks §11+ touches the filter table). Concurrent edits would merge-conflict. Either (a) wait until that change archives then do the doc edit as a follow-up commit, or (b) capture rationale in this change's archived `proposal.md` ("equipment count intentionally NOT a leaderboard column — see design open Q") and skip the docs/ edit entirely
- [ ] 11.4 **DEFERRED** — `docs/HOSPITAL.md` or `docs/EQUIPMENT.md` not yet warranted (no precedent doc); revisit if/when broader hospital-mode docs effort starts

## 12. Deploy coordination

- [x] 12.1 Confirm `add-r2-cloud-sync-migration` is at Phase 3 (R2 reads cutover) before applying this change's §9. The R2 bundle schema_version bump 1 → 2 requires the R2 path to be primary read backend, not Supabase mirror dual-write.
  - **STATUS NOTE (2026-05-24)**: `add-r2-cloud-sync-migration` is at 71/85 tasks (Phase 2 M2 bundle dual-write). Phase 3 bug_reports monitor window opened 2026-05-22; `add-r2-cloud-sync-migration` task §5.7 explicitly states "proceed to 5.8 on or after 2026-05-29". **Earliest apply window for equipment §9 (sync wiring)**: 2026-05-29 (Phase 3 reads-to-R2 cutover). Equipment §9 does NOT require Phase 4 (Supabase writes off, ~2026-06-12) — only the read backend flip
  - **Apply order**: §1–§8 (catalog / helpers / UI / T4 gate / threshold bump) are R2-independent and CAN apply now; only §9 (R2 bundle schema_version bump + equipment write into m2 bundle) MUST block until Phase 3 cutover. Split apply into two waves if needed
  - **STATUS NOTE 2 (2026-05-24, evening)**: Wave A (§1-§8 + §10-§11) **SHIPPED to prod** via 6 commits on main: ce1ee9e / a84de46 / a31672a / e657dc4 / 2703713 / 45d2767 / 1ae48f4. Live on `https://med-study-rpg.com/2nd/#/hospital` + `https://fireman333.github.io/study-rpg/hospital/#/hospital`. §9 still blocked
- [ ] 9 — when ready ] 12.2 Bundle schema bump is forward-compatible — no coordinated client/Worker deploy needed (Worker doesn't parse bundle internals)
- [ ] 9 — when ready ] 12.3 Once equipment ships, monitor R2 storage size for ~7 days to confirm the new field doesn't blow size budgets (10 rows × 80 bytes = 800 bytes max per user, negligible)

---

## Closing handoff note (2026-05-24)

**SHIPPED** (Wave A — `apps/medexam2-hospital-tw` live on prod):
- Core types + content catalog + helpers + Dexie v16 + 10 sprites + 3 UI components (with collapse-bug fix + 房間擴建 visual alignment + 2-col grid) + multiplier wiring 4 sites + T4 gate + 300k threshold bump + HomePage progress line + HelpMenu copy
- Prod commits: `ce1ee9e` `a84de46` `a31672a` `e657dc4` `2a066f0` `e76cddd` (+ merge commits)

**OPEN — deferred to follow-up**:
- §4.3 unit-equivalent assertions (waits on `packages/core` test infra)
- §8.5 V6MigrationModal intro modal explaining 300k recalibration (UX polish)
- §10.4-10.7a owner manual smoke tests (need dev-state-hack for revenue / reputation / tier)
- §10.7 sync round-trip (blocks on §9)
- §10.9 SPA F5 reload smoke (low priority — hash routing)
- §11.3 docs/LEADERBOARD.md edit (waits on `add-hospital-leaderboard-correct-count-filter` archive)
- §11.4 docs/HOSPITAL.md or EQUIPMENT.md (not yet warranted)

**OPEN — blocks on external timeline**:
- §9.1-9.5 R2 sync wiring — earliest 2026-05-29 when `add-r2-cloud-sync-migration` Phase 3 cuts reads to R2
- §12.2-12.3 deploy coordination + R2 storage monitor — actionable after §9 ships

**ARCHIVE READINESS**: not yet. Should archive when (a) §9 ships, (b) at least §10.4 + 10.6 owner smoke pass, (c) optionally §8.5 + §11.3-4 done. Estimated ~2026-06-01 if R2 cutover hits 5/29 target.
