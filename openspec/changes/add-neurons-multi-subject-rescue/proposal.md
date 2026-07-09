## Why

The shipped 考前救急 (last-minute rescue) is **one-at-a-time account-wide**: starting a rescue for a second 科目 forces abandoning the first. In the run-up to 國考 a candidate realistically needs to rescue **several weak subjects at once** — often with staggered exam dates — so the single-plan constraint is the first thing that breaks under real dogfood use.

## What Changes

- Allow **multiple rescue plans to coexist**, one per family, each with its own exam date, daily-minutes budget, diagnostic-blitz state, and daily queue. Removes the one-at-a-time `startRescue` gate + the 換科 replace-confirm flow.
- **BREAKING (sync)**: the rescue synced-key family becomes per-family. `rescue:v1:plan` (single) → `rescue:v1:plan:{familyId}`; override keys gain a family segment `rescue:v1:ovr:{planCreatedAt}:{familyId}:{conceptId}` (68 conceptIds are shared across subjects — a run-scoped-only key collides); confidence keys take the same family segment for symmetry. **R2 `SCHEMA_VERSION` 27 → 28** — load-bearing, because the presign Worker refuses a lower-version PUT (409), which is what stops a stale v27 client from whole-snapshot-overwriting the new per-family keys. No Dexie version bump (rides the existing `meta` kv).
- **UI pluralization** (same interface, made plural): the header 考前救急 entry opens a **rescue-plans overview list** (0 plans → straight to setup); each subject card independently morphs into its own rescue chip; each plan opens its **own scene instance** (no mid-session cross-subject switcher). Setup exam-date default becomes **2026-07-17**.
- **Per-subject scheduling**: each plan keeps its own `dailyMinutes` and independent queue (no cross-subject merged queue). Coexistence cap = **soft nudge at 3, hard cap at 5**.
- Four correctness fixes surfaced by adversarial review, all required (not optional):
  - anon→authed adoption becomes a **cloud∪local SET-wins** decision so anonymous-only subjects can't leak into an account or resurrect an abandoned plan;
  - a **one-shot "new version — please reload" toast** on a schema-downgrade push rejection, to kill the stale-tab 409 loop (rescue writes on every confidence tap, so 409 amplification is real);
  - the `startupSyncPending` gate extends to **all** per-family lifecycle writes (abandon / replace / touchLastStudied — not only start + archive);
  - `archiveIfDue` archives **per-subject**, and the legacy→per-family migration must complete **before the first push** (R2 is whole-snapshot).

## Capabilities

### New Capabilities

<!-- none — this extends existing rescue / homepage / cloud-sync behavior -->

### Modified Capabilities

- `neurons-single-subject-rescue`: plan/confidence/override state goes from single-run-scoped to **per-family**; the one-at-a-time account-wide constraint is replaced by a bounded coexistence cap; lifecycle (archive/abandon/blitz/touch) becomes per-family; anon→authed adoption becomes multi-plan SET-wins.
- `neurons-homepage`: the header 考前救急 entry opens a rescue overview list (not a single scene), and **every** active-rescue family card renders its own rescue chip (the chip morph is no longer a single-family swap).
- `neurons-cloud-sync`: the synced-meta prefix-matched key family admits the per-family plan/ovr/conf shapes; the schema-version fence advances to 28 and gains a client-side reload prompt on a downgrade-refused push. The reload prompt is **forward-protection** — it ships *in* v28, so it does not fire for the pre-v28 tabs live during this bake (they lack it); it becomes active only from a future v28→v29+ bump.

## Impact

- **Code**: `apps/neurons-tw/src/lib/services/rescue/{rescue-sync-keys,rescue-store}.ts`, `apps/neurons-tw/src/lib/sync/backfill/rescue.ts`, `apps/neurons-tw/src/components/{RescueScene,QuizModal,FamilyPicker}.tsx`, `apps/neurons-tw/src/routes/OverviewPage.tsx`, `apps/neurons-tw/src/lib/sync/r2/bundles.ts` (+ SCHEMA_VERSION pin tests), and a schema-downgrade reload surface (`lib/sync/r2/client.ts` / `engine-r2.ts` + a UI toast). `account-guard.ts` is unchanged (the `rescue:v1:` prefix already covers per-family keys).
- **Sync / rollout**: R2 `SCHEMA_VERSION` 27 → 28; mixed-version bake window where v27 tabs are 409-refused until reloaded. During this bake the new reload toast is inert for the live v27 tabs (they predate it), so those 409s are held only by the existing presign rate-limiter (`eliminate-cross-device-r2-412-storm`) until a reload — the toast is forward-protection for the next bump. Overlaps that in-flight change (per-family keys + per-tap writes raise meta-row + presign volume — bounded by the existing 14-day run-sync window × cap).
- **Data**: no Dexie schema bump; one-time client migration of the legacy single `rescue:v1:plan` into `rescue:v1:plan:{familyId}`.
- **Tests**: extend `apps/neurons-tw/src/__tests__/rescue-*.test.ts` (sync/conflict-recovery/store) for per-family LWW convergence, multi-plan adoption SET-wins, and cross-subject override non-collision.
