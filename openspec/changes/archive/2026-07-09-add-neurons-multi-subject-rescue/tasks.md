## 1. Sync keys — per-family key family (`rescue-sync-keys.ts`)

- [x] 1.1 Add per-family plan key `rescue:v1:plan:{familyId}` (prefix `RESCUE_PLAN_KEY_PREFIX`) + a `rescuePlanKey(familyId)` mint; keep the legacy `rescue:v1:plan` constant importable as migration input only. Verify: unit test mints/round-trips the per-family key.
- [x] 1.2 Change `conf`/`ovr` key mints to `rescue:v1:conf:{planCreatedAt}:{familyId}:{qid}` and `rescue:v1:ovr:{planCreatedAt}:{familyId}:{cid}`; `parseRunCreatedAt` still reads the leading `:`-token. Verify: parser test on the new 3-segment shape returns the createdAt unchanged; window logic unaffected.
- [x] 1.3 Extend `isSyncedRescueKey` to admit `rescue:v1:plan:{familyId}` (always) + windowed `conf:`/`ovr:` (new shape); reject any other `rescue:v1:*` (telemetry stays local). Verify: matcher test covers per-family plan, in/out-of-window conf/ovr, and a telemetry key (rejected).
- [x] 1.4 Confirm the LWW pickers (`pickPlanEnvelopeLWW`/`pickConfLWW`/`pickOvrLWW`) are per-key and unchanged in shape (they operate on one raw value); no logic change needed beyond keys. Verify: existing picker tests still green.

## 2. Store — per-family mirror + mutations (`rescue-store.ts`)

- [x] 2.1 Replace the single `envelope: PlanEnvelope | null` mirror with a per-family `Map<familyId, PlanEnvelope>`; `loadFromRows` groups `rescue:v1:plan:*` by family. Verify: hydrate test loads two plans into the map.
- [x] 2.2 Split reads: `getActivePlan(familyId)` + `getActivePlans(): RescuePlan[]`; `getConfidence`/`getOverride` take a familyId (or resolve via the scene's plan). Verify: reads scope to the right family's createdAt.
- [x] 2.3 `startRescue`: remove the different-family one-at-a-time gate (no more `needsConfirm`); same-family live plan → resume (no new createdAt); different family → append a new per-family plan. Add a same-device `createdAt` +1ms de-dup on mint. Verify: test — starting B while A active yields two plans; starting A again resumes; two same-ms starts get distinct createdAt.
- [x] 2.4 Make `abandonRescue(familyId)`, `archiveIfDue(todayISO)` (iterate ALL plans, archive each at its own examDate+1), `touchLastStudied(familyId)`, `markBlitzDone(familyId, createdAt)` per-family. Verify: archive test with one due + one future plan archives only the due one.
- [x] 2.5 Add `useRescuePlans()` (list) alongside `useRescuePlan(familyId)`; keep the localStorage env-cache per-family (plural cache key). Verify: reactive hook re-renders on any per-family change.
- [x] 2.6 Add `editRescuePlan(familyId, patch)` (update examDate / dailyMinutes with a fresh envelope + startup gate) for the hard-cap 「編輯計畫」 path. Verify: editing examDate rewrites the envelope with fresh updatedAt and is gated on startup sync.

## 3. Backfill + adoption (`backfill/rescue.ts`)

- [x] 3.1 Loop over every incoming `rescue:v1:plan:*` key applying `pickPlanEnvelopeLWW` per family (was single `RESCUE_PLAN_KEY`). Verify: two-device divergent-different-family test converges to holding both plans.
- [x] 3.2 Rewrite the `cloudPlanWins` adoption pass: if the cloud bundle carries NO rescue plan key (brand-new account) → carry all anonymous plans over; else (existing rescue state) → per-family SET: cloud-active wins verbatim, cloud explicit-null wins over anonymous active (no resurrection), anonymous-ONLY family is **dropped**. Verify: four tests — brand-new account carries over; anon plan doesn't overwrite cloud; anon-only subject dropped when account has rescue state; abandoned account plan not resurrected.
- [x] 3.3 Confirm this pass keeps running inside `runOnPullComplete` (so the 412/409/428 recovery pull path via `onRecoveryPull` still reconciles it — don't regress the B2 engine fix). Verify: conflict-recovery test still green after multi-plan change.

## 4. Schema version + downgrade reload prompt

- [x] 4.1 Bump R2 `SCHEMA_VERSION` 27 → 28 in `bundles.ts` + update the SCHEMA_VERSION history comment + any SV pin test to 28. Verify: pin test asserts 28.
- [x] 4.2 Add a one-time "有新版本，請重新整理" prompt on the schema-downgrade push rejection (`r2_schema_downgrade_refused_by_server`): surface the error from `client.ts`/`engine-r2.ts` into an **App-level host** (a `SyncReloadToast` mounted in `App.tsx`, fed by a sync-error event/context — not just `lastError`); fire at most once per session, keep the sync light 🔴. Verify: unit test — the rejection triggers the prompt once, not per dirty cycle.

## 5. UI — RescueScene (overview + per-scene)

- [x] 5.1 Add an overview `phase` listing active plans (per-family cards: family accent color + D + RescueScore + 今日佇列 CTA) + "＋ 新增計畫"; 0 plans → setup directly. Verify: Chrome MCP — header entry opens the list with N cards.
- [x] 5.2 Bind the scene to a `viewingFamily`; all downstream memos (`subjectQuestions`/`assembled`/`warMap`/`daySet`/`blitzPool`) read the viewing family's plan; no mid-session cross-subject switcher (切科 = back to overview). Verify: opening A's chip renders A's queue.
- [x] 5.3 Change setup exam-date default to **2026-07-17** (from `+3`); keep `maxExamISO = +14`; fall back to `today+N` if 07/17 is already past. Verify: setup opens with 2026-07-17 preselected.
- [x] 5.4 Setup guardrails: duplicate-subject → button becomes 「開啟這科救急 / 編輯計畫」 (no new createdAt); soft nudge at 3 active plans; disable add-new-plan at hard cap 5. Verify: Chrome MCP — 6th plan add is disabled; re-adding an active subject opens it, not a restart.
- [x] 5.5 Extend the `startupSyncPending` gate to ALL per-family lifecycle writes (start/abandon/replace/edit-examDate/touchLastStudied/**markBlitzDone**), and make the `archiveIfDue` mount effect iterate all plans after the startup pull lands. Verify: gate holds abandon AND blitz-completion before startup pull; archive sweeps all due plans. **Blitz completion (and study-touch) is DEFERRED, not dropped** — `finishBlitz`/`finishSession`/`finishQuickScan` while gated call `deferBlitzDone` / `deferTouchLastStudied`, which stash into **module-level** state in `rescue-store` (survives the scene unmounting before the pull lands — a component ref would lose it). `flushPendingRescueLifecycle` writes `blitzDoneAt` / bumps `lastStudiedAt` once the startup pull settles — driven BOTH by the sync layer (`useSync` `beginStartupForcePull().then`, cross-unmount) AND by the scene's `startupSyncPending → false` effect (covers the status-poll lag) — only if that run is still active, via the pure `resolvePendingBlitzFlush` (`rescue-blitz-defer.ts`). Dropping it would permanently lose `blitzDoneAt` on cold-boot → immediate blitz, re-running the diagnostic on another device. (Codex/Fable review fix 3)

## 6. UI — homepage cards (`OverviewPage.tsx` / `FamilyPicker.tsx`)

- [x] 6.1 `OverviewPage`: `useRescuePlan()` → `useRescuePlans()`; compute a per-family chip map (D + RescueScore) for every active plan. Verify: two active plans produce two chip entries.
- [x] 6.2 `FamilyPicker`: `rescuePlanFamilyId: string|null` → `rescuePlanFamilyIds: Set` (or chip map); each active-plan card renders its own rescue chip in place of WeaknessIndicator; tapping a chip opens that family's scene. Verify: Chrome MCP — two family cards show chips simultaneously; other cards unchanged.

## 7. UI — QuizModal scene-bound confidence (`QuizModal.tsx`)

- [x] 7.1 Replace the singleton `recordConfidence(q.id, signal)` path with a scene-injected bound callback carrying `{planCreatedAt, familyId}`, so a tap in family A's scene never records under B's run scope. Verify: unit/integration — a confidence tap in A's scene writes `conf:{A.createdAt}:A:{qid}`.

## 8. Migration (legacy single → per-family, before first push)

- [x] 8.1 On hydrate, migrate a legacy active `rescue:v1:plan` envelope into `rescue:v1:plan:{plan.familyId}` **before** the first push; discard a legacy `plan:null` (no familyId — never used to clear per-family plans); seed the localStorage legacy blob into per-family keys. Extend the `migrationPushPending` ordering. Verify: upgrade test — a legacy active plan lands as a per-family key and is pushed; a legacy null does not clear per-family plans.
- [x] 8.2 Cloud legacy migration: in the rescue backfill post-pass, read a legacy `rescue:v1:plan` directly from the **raw pulled bundle meta** (the matcher no longer admits it, so the normal apply path skips it) and write it as `rescue:v1:plan:{familyId}` before the first push. Verify: test — a v27-era cloud legacy plan + a fresh v28 device → the per-family key is present before the first push, not lost to the matcher skip.

## 9. Tests

- [x] 9.1 Per-family LWW convergence + different-family coexistence (extend `rescue-sync.test.ts`). No Dexie bump → no upgrade fixture needed (assert the change touches no `.version()` chain).
- [x] 9.2 Cross-subject override non-collision (same createdAt + shared conceptId across two families → distinct keys).
- [x] 9.3 Adoption SET-wins: anon-no-clobber / anon-only-not-leaked / abandoned-not-resurrected (extend the anon→authed tests).
- [x] 9.4 Full neurons suite + `pnpm -r typecheck` green. (Group 5–7 UI wiring landed; `pnpm -r typecheck` green across all packages; `vitest run` all pass.)
- [x] 9.5 Deferred-blitz-flush unit test (`rescue-blitz-defer.test.ts`): while gated → no flush; gate clears + run still active → flush; replaced run (different createdAt) / abandoned (no plan) / nothing-pending → no flush (never resurrect a dead run).

## 10. Verify + docs

- [ ] 10.1 Chrome MCP end-to-end (localhost): open two subjects → each own scene + own card chip → confidence tap scoped correctly → abandon one leaves the other → cap-5 add disabled → setupExam=07/17. (Cross-device convergence + 409 reload prompt need prod real-device — dev localhost R2 push is unavailable.)
- [ ] 10.2 After deploy: mixed-version smoke — a stale (v27) tab push is 409-refused and shows the reload prompt; two real devices converge on coexisting per-family plans / abandon propagation; confirm SV28 baked in bundle.
- [ ] 10.3 `/verify` + update `docs/NEURONS_FEATURE_NOTES.md` (multi-subject rescue) + `openspec/project.md` roadmap row; note R2 SV 28 taken (next bump 29) in memory.
