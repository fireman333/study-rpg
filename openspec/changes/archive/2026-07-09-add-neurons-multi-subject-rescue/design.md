## Context

Shipped 考前救急 is single-plan: one `rescue:v1:plan` envelope (LWW on `updatedAt`), an in-memory `envelope: PlanEnvelope | null` mirror, an account-wide one-at-a-time `startRescue` gate, and run-scoped `conf:{createdAt}:{qid}` / `ovr:{createdAt}:{cid}` keys. All state rides the R2 `neurons` bundle `meta` kv (R2 `SCHEMA_VERSION` 27, no Dexie index). The design below was settled by a three-way panel (Opus main line + Codex independent + Fable adversarial), each grounded in the actual code; the load-bearing facts (presign 409 downgrade gate, `createdAt = Date.now()` non-uniqueness, 68 cross-subject conceptIds) were code-verified, not assumed.

## Goals / Non-Goals

**Goals:**
- Multiple rescue plans coexist, one per family, each with its own exam date, daily-minutes, diagnostic-blitz state, queue, confidence, and overrides.
- Every plan syncs cross-device with the same convergence guarantees the single plan has today (bidirectional LWW, abandon propagation, no split-brain, no dropped-abandon).
- Reuse the existing interface pluralized — no new UX paradigm.

**Non-Goals:**
- No cross-subject merged queue / global-ROI scheduling (each plan is independent — owner-locked).
- No Dexie schema bump (rides `meta` kv).
- No mid-session cross-subject switcher inside a scene.
- No change to the answering path, SRS, or telemetry model (telemetry stays device-local).

## Decisions

### Decision 1 — Per-family keys (design "B+"), not a single map

`rescue:v1:plan` (single) → **`rescue:v1:plan:{familyId}`**, each an independent `{plan, updatedAt}` envelope reusing `pickPlanEnvelopeLWW`. Override keys gain a family segment: **`rescue:v1:ovr:{planCreatedAt}:{familyId}:{conceptId}`**; confidence keys take the same segment (`rescue:v1:conf:{planCreatedAt}:{familyId}:{qid}`) for symmetry.

- *Why not Design A (single key holding a `{plans:{[familyId]:...}}` map)*: the envelope is LWW on one `updatedAt`, so two devices each adding a different subject lose one write (whoever writes later wins the whole map). Making it correct requires per-familyId LWW registers inside the map — merge complexity approaching B but concentrated in one opaque key, worse for debugging and back-compat.
- *Why the family segment on `ovr` is mandatory (not "just guarantee createdAt unique")*: `createdAt = Date.now()` (`rescue-store.ts:264`) is only unique per single-device mint; two devices can mint the same ms. The override namespace is `conceptId`, and **68 conceptIds are shared across ≥2 subjects** (verified against `concept-tags.json` — membrane-transport, insulin, cortisol… the exact high-frequency stop-loss hotspots). Same-ms createdAt × shared conceptId × two plans ⇒ override mutual-clobber. The family segment removes the collision structurally, independent of the fragile createdAt-uniqueness invariant. `conf` keys use `qid`, which is 100% globally unique (subject-embedded), so `conf` is technically safe without the segment — but we add it anyway to avoid pinning correctness on a content invariant nothing enforces, and because the corpus concept-tags are still evolving.
- A per-device `createdAt` +1ms de-dup on mint is added regardless (zero cost) so same-device concurrent starts never share a run scope. `parseRunCreatedAt` still reads the first `:`-token, so the 14-day window logic is unchanged.

### Decision 2 — R2 `SCHEMA_VERSION` 27 → 28, and "no dual-write" depends on it

R2 PUT is a **whole-snapshot overwrite**, not a per-key merge. A stale v27 client pushing a snapshot that lacks the per-family keys would erase them from the cloud blob. The only thing preventing that is the presign Worker's downgrade gate (`presign.ts:189-203`: PUT with `schema_version < existing` → 409). So we bump to 28; after the first v28 push lands, every v27 whole-snapshot push is refused.

- **No dual-write of the legacy single key.** This is safe *only because* of the bump — the two decisions are not independent (`no-dual-write ⟸ SV bump`). Dual-writing would reintroduce the LWW-clobber it's meant to avoid.
- No Dexie bump — keys still live in `db.meta`.

### Decision 3 — anon→authed adoption: brand-new account carries over, existing-rescue account drops anon-only

Today `backfillRescueLWW({cloudPlanWins:true})` iterates only the plan keys *present in the incoming bundle* and takes them verbatim. With multiple plans that under-covers: an anonymous-only subject (local has `plan:{A}`, cloud has no `A` key) survives by plain LWW, and if the account had *abandoned* A (cloud `plan:{A}` = null with older `updatedAt`), the anonymous active A resurrects it. The adoption pass first checks whether the cloud bundle carries **any** rescue plan key: a **brand-new account** (no rescue key at all) carries all anonymous plans over; an account with **existing rescue state** does a per-family SET decision — cloud-active wins verbatim, cloud explicit-null wins over anonymous active (no resurrection), and an anonymous-**only** family (cloud has no key) is **dropped**, so anonymous play never leaks a subject into an account that already has its own rescue state. (Owner-locked: drop anon-only into an existing-rescue account; carry over only for a genuinely fresh account.)

### Decision 4 — one-shot reload prompt on schema-downgrade push rejection

A stale tab against a newer-schema cloud gets 409 → `r2_schema_downgrade_refused_by_server`; `isUnrecoverable()` does not include it, so every dirty cycle re-presigns → 409 → retries. Rescue writes on **every confidence tap**, so a stale tab generates a heavy 409 stream (feeding the in-flight `eliminate-cross-device-r2-412-storm`). We add a **one-time "有新版本，請重新整理" toast** triggered by that specific rejection, cutting the loop at source rather than only throttling it at the presign limiter.

**Forward-protection only — not active during the v27→v28 bake.** `SyncReloadToast` is a NEW file introduced *by this change*; the currently-deployed v27 build does not contain it. So during the v27→v28 rollout, a live v27 tab whose push is 409-refused shows **no toast** — it only has the existing presign rate-limiter (`eliminate-cross-device-r2-412-storm`) as backstop, and recovers when the user reloads for any other reason. The toast's value is **forward**: once v28 is deployed, a v28 tab (which *does* ship the toast) that later goes stale against a **v29+** cloud will surface the prompt and cut the loop at source. This is infrastructure for the *next* schema bump, not a mitigation for this one.

### Decision 5 — UI pluralization: overview list + per-scene, no switcher

Header 考前救急 opens a rescue-plans overview (0 plans → setup directly). Each subject card independently morphs into its own rescue chip (`rescuePlanFamilyId: string|null` → a per-family lookup). Each plan opens **its own scene instance** bound to a `viewingFamily`; there is no cross-subject switcher *inside* an active scene.

- *Why per-scene, not a switcher*: `QuizModal`'s `recordConfidence(q.id, signal)` resolves the target plan via the module-singleton `getActivePlan()` (`QuizModal.tsx:587` → `rescue-store.ts:296`). With multiple plans "the active plan" is undefined; a global switcher would record confidence into the wrong plan's createdAt scope. RescueScene must inject a **bound `recordConfidence` callback carrying the scene's `{planCreatedAt, familyId}`** into QuizModal.
- Removing the replace-confirm flow needs three setup guardrails: (a) duplicate-subject → the button becomes 「開啟這科救急 / 編輯計畫」, never mints a new createdAt; (b) cap enforcement; (c) `startupSyncPending` gate on add-new-plan.

### Decision 6 — per-subject queue; coexistence cap soft-3 / hard-5

Each plan keeps its own `dailyMinutes` and independent queue (owner-locked; a merged cross-subject queue would break the per-card chip morph and mix RescueScore / 戰情圖 / stop-loss semantics). Coexistence is **soft-nudged at 3** (time-budget reminder) and **hard-capped at 5** (a real ceiling for batch-misfire / StrictMode; sync-row growth is not the limiter — 5 × ~100 conf rows ≪ existing bundle volume).

### Decision 7 — lifecycle invariants generalize per-family

- `startupSyncPending` gates **all** envelope writes (start / abandon / replace / touchLastStudied / edit-examDate), not only start + the setup button — a stale device must not write a fresh-`updatedAt` per-family null/active before the startup force-pull lands.
- `archiveIfDue` iterates **all** plans, archiving each at its own `examDate+1`; missing one lets an expired plan linger, over-eager clearing wipes a sibling.
- The legacy→per-family migration completes **before the first push** (R2 is whole-snapshot; a first push with neither legacy nor per-family keys is a data-vacuum window). Extends the existing `migrationPushPending` ordering.

## Risks / Trade-offs

- **Mixed-version bake 409 storm** → during THIS bake (v27→v28) the reload toast is inert (v27 tabs predate it), so the only backstop is the existing presign rate-limiter; overlaps `eliminate-cross-device-r2-412-storm` (coordinate, don't fight it). The toast becomes the loop-cutter only from v28→v29+ (forward-protection).
- **Meta-row growth** (per-family × per-tap conf/ovr) → bounded by the 14-day run-sync window × hard-cap 5 (design states the upper bound explicitly; ~500 rows worst case).
- **Override cross-subject collision** (68 shared conceptIds) → Decision 1 family segment.
- **Adoption leak / abandoned-plan resurrection** → Decision 3 union SET-wins.
- **createdAt collision** → +1ms de-dup (same-device) + family segment (cross-device).

## Migration Plan

1. Ship v28: `rescue-sync-keys.ts` admits per-family plan/ovr/conf shapes (legacy `rescue:v1:plan` still readable as migration input); `SCHEMA_VERSION = 28`.
2. On first hydrate, migrate a legacy active `rescue:v1:plan` into `rescue:v1:plan:{plan.familyId}` **before** the first push; a legacy `plan:null` (no familyId) is discarded, never used to clear per-family plans. `migrateRescueLocalState` also seeds from the localStorage legacy blob into per-family keys. Because the per-family matcher no longer admits the legacy single key, an account-level legacy plan sitting in the cloud bundle is migrated by reading it from the **raw pulled bundle meta inside the rescue backfill** (bypassing the matcher, which would otherwise skip it) — otherwise a fresh v28 device signing into an account with a pre-multi cloud plan would silently lose it.
3. First v28 push locks out v27 whole-snapshot pushes (presign 409). During this bake a stale v27 tab does **not** get the reload toast (the toast ships *in* v28, not the running v27 build) — it is held only by the existing presign rate-limiter until the user reloads. The toast is forward-protection for the *next* bump (a v28 tab against a future v29 cloud); see Decision 4.
4. **Rollback caveat**: once any v28 blob lands, a v27 client is 409-refused by its own downgrade gate, so a plain code-revert does not restore v27 sync. Prefer **forward-fix** over rollback; if rollback is unavoidable, ship a build that keeps SV28 + per-family reads but reverts multi-subject UI/lifecycle (reads the first/most-recent per-family plan as the single active plan), rather than lowering the schema version.

## Open Questions

- Coexistence cap (soft 3 / hard 5) and the 14-day run-sync window are dogfood-tunable; revisit after real multi-subject use.
- Exam-date default 2026-07-17 is a fixed product constant for this 國考 cycle; if reused post-cycle it should fall back to `today + N` rather than a past date.
