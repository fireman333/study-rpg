# R2 Sync Maintenance Guide — neurons-tw

> **Audience**: a future session (any model) about to CHANGE the neurons-tw cross-device
> sync system. Read this BEFORE touching any file under `apps/neurons-tw/src/lib/sync/`,
> `src/lib/db.ts`, or any service that mints synced meta keys. Every rule here was paid
> for by a prod incident or an adversarial-review catch — do not relearn them.
>
> Status snapshot at writing (2026-07-07): R2 `SCHEMA_VERSION = 26`, Dexie `v20`,
> 20 adapters in `NEURONS_ADAPTERS`, 959 Vitest green. **The next free SCHEMA_VERSION is 27.**

## 0. The system in one paragraph

Local Dexie is the source of truth. The whole synced state is serialized by the adapter
registry ([`tables.ts:1206`](../apps/neurons-tw/src/lib/sync/tables.ts)) into ONE gzip
JSON blob per user (`users/<sub>/neurons-snapshot.json.gz`) and pushed to R2 with
ETag optimistic concurrency (whole-bundle LWW at the blob level, per-row/per-key merge
at apply time). Pull = GET → `honorResetMarker` → `applyBundleSnapshot` (each adapter's
`apply` merges incoming into Dexie) → etag persisted **after** apply → `runOnPullComplete`
backfill post-passes. Push = debounced (12s ±30% jitter) snapshot of local truth —
**push never merges; only pull merges.** Any merge that isn't order-independent
(a semilattice: commutative, associative, idempotent) will eventually corrupt state,
because devices pull in arbitrary orders.

Key files:

| File | Owns |
|---|---|
| [`sync/tables.ts`](../apps/neurons-tw/src/lib/sync/tables.ts) | All 20 TableAdapters, `SYNCED_META_KEYS`, `isSyncedMetaKey` |
| [`sync/r2/bundles.ts`](../apps/neurons-tw/src/lib/sync/r2/bundles.ts) | `SCHEMA_VERSION` + full bump history, snapshot build/apply, reader tolerance |
| [`sync/backfill/index.ts`](../apps/neurons-tw/src/lib/sync/backfill/index.ts) | `runOnPullComplete` post-pass ordering |
| [`sync/engine.ts`](../apps/neurons-tw/src/lib/sync/engine.ts) + [`sync/r2/engine-r2.ts`](../apps/neurons-tw/src/lib/sync/r2/engine-r2.ts) | Debounce, defer-on-conflict, single-flight, ETag rules |
| [`sync/account-guard.ts`](../apps/neurons-tw/src/lib/sync/account-guard.ts) | Account-switch gate, wipe, reset-ack |
| [`services/account-reset.ts`](../apps/neurons-tw/src/lib/services/account-reset.ts) | In-place reset ordering (wipe-then-ack) |
| [`cloudflare/sync-worker/src/presign.ts`](../../cloudflare/sync-worker/src/presign.ts) | Bundle whitelist (`m2`/`bookmarks`/`neurons`), SV-downgrade guard. **Bundle-opaque** — client shape changes need NO Worker change |

## 1. Merge-type decision tree — "I'm adding a synced X"

Pick the FIRST row that fits. Every row names the canonical implementation to copy.

| Data shape | Merge type | Rule | Canonical example |
|---|---|---|---|
| Mutable value the user edits/clears (nickname, preference, flag row) | **Per-row LWW on `updatedAt`** | Newer `updatedAt` wins; ties → incoming. **Clear = write empty-string / explicit-null row with fresh `updatedAt`, NEVER delete the row** (delete → the other device's older row resurrects it) | `instanceNicknamesAdapter` [`tables.ts:1015`](../apps/neurons-tw/src/lib/sync/tables.ts); `questionFlagsAdapter` [`tables.ts:802`](../apps/neurons-tw/src/lib/sync/tables.ts) |
| Removable membership in a queue/list | **LWW-null dequeue** (nullable field on an LWW row) | Effective member = `field != null`; dequeue = explicit `null` + fresh `updatedAt`; OMITTED field = preserve local (see §2d) | `pinnedAt` [`tables.ts:847–858`](../apps/neurons-tw/src/lib/sync/tables.ts) (SV25) |
| "It happened once" presence (achievement, dex entry, event dispatched, imprint bud) | **Write-once / first-write-wins = UNION** | Never overwrite; on both-present keep the EARLIER timestamp (provenance) | `dmnCardsAdapter` [`tables.ts:560`](../apps/neurons-tw/src/lib/sync/tables.ts); `achievementsAdapter` [`tables.ts:320`](../apps/neurons-tw/src/lib/sync/tables.ts); `dmnEventLogAdapter` [`tables.ts:603`](../apps/neurons-tw/src/lib/sync/tables.ts) |
| Ownership that never un-owns (equipment, connector, instance) | **UNION by id, monotonic on presence** | Never delete on merge; soft-delete via a monotonic field (`consumedAt` min-non-null), never a row removal | `equipmentAdapter` [`tables.ts:1109`](../apps/neurons-tw/src/lib/sync/tables.ts); `neuronInstancesAdapter` [`tables.ts:960`](../apps/neurons-tw/src/lib/sync/tables.ts) |
| Boolean that only ever flips one way | **Monotonic-OR** | `local || incoming`; a stale row can NEVER clear it | `everWrong` [`tables.ts:946`](../apps/neurons-tw/src/lib/sync/tables.ts) (Vitest-locked, spec `neurons-wrong-answer-list`) |
| Counter that only increases (totals, faucets, copies, pity) | **Monotonic-MAX** | `max(local, incoming)`; in-adapter for row fields, via `backfill/counters.ts` for meta keys | `familyMastery` [`tables.ts:168`](../apps/neurons-tw/src/lib/sync/tables.ts); `MAX_MERGE_KEYS` [`backfill/counters.ts:17`](../apps/neurons-tw/src/lib/sync/backfill/counters.ts) |
| **Counter that goes up AND down (balance/stock/pool)** | **NEVER MAX-merge it.** Split into two monotonic-up counters and DERIVE the balance (`grants − consumes`, clamped ≥0) | See §2 bug class (b); resurrection is the #1 historical prod bug | `backfill/dmn-daily.ts:98–137`; `neuralEnergyEarned/Spent` pattern |
| Growing set (ids collected across devices) | **Monotonic UNION via a registered post-pass** — the metaAdapter's first-write-wins is NOT enough once local exists | Register in `runOnPullComplete` | `backfill/first-pull.ts` |
| Editable single-value preference riding `meta` | **LWW via timestamped envelope `{…, updatedAt}` + registered post-pass** | metaAdapter is first-write-wins transport only; the post-pass enforces LWW | `backfill/representatives.ts`, `backfill/active-squad.ts` |
| Per-(account, date) record two offline devices may mint divergently | **MIN-LWW (earliest-wins) post-pass** over a totally-ordered `(createdAt, seed)` pair | MIN is a semilattice → pull-order-independent | `backfill/prescription-plan.ts:24` + `pickPlanMinLWW` [`prescription.ts:565`](../apps/neurons-tw/src/lib/services/prescription.ts) |
| Deletion of an LWW row that MUST propagate (rare) | **Tombstone table** (heavier — prefer LWW-null or empty-string-clear) | Tombstone newer than row → row dies; row newer than tombstone → un-delete | `questionBookmarkTombstonesAdapter` [`tables.ts:756`](../apps/neurons-tw/src/lib/sync/tables.ts) |
| Daily/ephemeral bookkeeping (pity dates, daily caps, UI state, tour flags) | **DON'T SYNC IT.** Device-local meta / localStorage | Syncing cap-dates under LWW is actively wrong; device-local = zero migration risk | mock-variant pity (deliberately local, see SV21 note in `bundles.ts`) |

**Meta-key transport reality**: the `metaAdapter` ([`tables.ts:520`](../apps/neurons-tw/src/lib/sync/tables.ts))
only writes an incoming key when local is MISSING (first-write-wins). That is sufficient
ONLY for write-once presence keys. Anything else riding `meta` needs a registered
backfill post-pass that defines the real merge. If you add a synced meta key and skip the
post-pass question, you have probably just built a divergence bug.

## 2. Bug classes — NEVER reintroduce

Each of these shipped (or nearly shipped) once. Symptom first, guard second.

**(a) Dequeue-resurrection / FIFO-with-removal.** Symptom: user removes/spends an item;
it "comes back" after sync. Cause: removal modeled as deleting from a shared mutable
set/array — the other device's copy re-merges it. Guard: removals must ride **LWW-null**
(pin queue, SV25) or a **monotonic** signal (`consumedAt`); never an implicit delete.
History: DMN draw tickets resurrected for a real player (memory `neurons-dmn-draw-resurrection-fix`).

**(b) MAX-merge absorption of a bidirectional counter.** Symptom: spent currency
resurrects, or a grant vanishes on a less-active device. `MAX(0, 11) = 11` cannot
represent "spent". Guard: two monotonic-up counters + derived balance
(`backfill/dmn-daily.ts`). Corollary: a **flat write into a MAX counter is best-effort,
NOT exactly-once** — the prescription tier-energy grant into `maze:<f>:earned` is
deliberately forgiving (may be absorbed on a device whose counter is already higher);
if you need exactly-once, add a write-once claim marker and accept lossiness, or keep a
summed ledger. Never "fix" absorption by switching the counter to scalar LWW.

**(c) Scalar LWW on a value two devices increment concurrently.** Symptom: one device's
increments silently vanish (clobbered by the other's whole value). Guard: if both
devices legitimately add to it, it's a counter (MAX of monotonic parts or a ledger),
not an LWW scalar. Tier energy explicitly avoided this ("no scalar-LWW energy anywhere",
SV26 note in `bundles.ts`).

**(d) Conflating omitted-key with explicit-null.** Symptom: an older client (or a setter
that doesn't know a field) wipes newer fields it never learned about. Guard:
**OMITTED key = preserve local; EXPLICIT null = intentional clear.** Both the adapter
apply ([`tables.ts:839–858`](../apps/neurons-tw/src/lib/sync/tables.ts) — `key in row`
checks) AND every local setter (`putFlag` carry-through,
[`question-flags.ts:38–57`](../apps/neurons-tw/src/lib/services/question-flags.ts))
must preserve-on-omission. A nullable synced field must be typed `T | null`, not bare
`T`, or the null won't serialize and the clear never propagates.

**(e) Snapshot/apply matcher asymmetry.** Symptom: a key syncs up but is rejected on
pull (or vice versa) — silent one-way sync. Guard: ONE membership predicate used by
BOTH directions. `isSyncedMetaKey` ([`tables.ts:512`](../apps/neurons-tw/src/lib/sync/tables.ts))
is the only test on the meta path; both `metaAdapter.snapshot` and `.apply` call it.
Never write a second ad-hoc filter.

**(f) Non-deterministic grant targets.** Symptom: two offline devices pay the same
reward to two DIFFERENT targets → double-pay after merge. Guard: any target derived
at grant time must be a pure function of data that CONVERGES (e.g.
`grantFamilyForDate(date)` = date-only hash — NOT plan-seed- or device-random-derived).
Codex adversarial review caught this in the tier-ladder design; keep the discipline.

**(g) Ack-before-wipe on reset paths.** Symptom: "重置" succeeds, then the account
resurrects in the cloud. Cause: reset-ack persisted before the local wipe; wipe throws;
next pull skips the gate; next push re-uploads pre-reset rows (irreversible — merges are
monotonic). Guard: **wipe-then-ack, always**
([`account-reset.ts:62–76`](../apps/neurons-tw/src/lib/services/account-reset.ts));
pull-side gate `honorResetMarker` wipes BEFORE apply
([`account-guard.ts:139`](../apps/neurons-tw/src/lib/sync/account-guard.ts)); cloud
reset-push MUST succeed or abort untouched (no `deferOnConflict` — it throws).
Both orderings are unit-test-locked; keep them locked.

**(h) Account-owned local state outside the wipe.** Symptom: 混血 state — the next
account inherits the previous account's derived progress. Guard: `clearLocalSyncedData`
([`account-guard.ts:88`](../apps/neurons-tw/src/lib/sync/account-guard.ts)) wipes all
adapter tables (registry-derived → auto-covers new adapters) + `SYNCED_META_KEYS` +
the whole `prescription:v1:*` prefix + `mockExamDrafts` + etags + presign cache.
**If your new feature stores account-derived state in a NON-synced meta key or
localStorage, you must add it to the wipe** — being non-synced does not make it
device-local. (Known open instance: `promoteCount` — see §9.)

## 3. SCHEMA_VERSION discipline

- **Bump when**: any change to what a peer client can OBSERVE in the bundle — new adapter
  key, new synced meta key/family, new/changed field on a synced row, envelope field.
- **Do NOT bump when**: Dexie-only change with no bundle shape change; device-local meta;
  derived/in-memory values; UI.
- **Additive only.** Never rename an adapter key or a synced meta key — repurpose under
  the legacy name with a loud comment, or add a new key and leave-and-ignore the old
  (dropped keys simply fall out of the allowlist; see v17/v18 precedent in `bundles.ts`).
- **Reader tolerance is required BOTH directions** and must be stated in the history
  comment: (1) old client reading new bundle → unknown adapter keys are auto-dropped
  (apply iterates only local `NEURONS_ADAPTERS`; `validateBundleMeta` tolerates
  `schema_version > local`, [`bundles.ts:344–367`](../apps/neurons-tw/src/lib/sync/r2/bundles.ts));
  unknown row FIELDS need explicit preserve-on-omission in the adapter. (2) New client
  reading old bundle → absent key/field must PRESERVE local (`?? []`, `key in row`,
  seed-never-zero — the v23 grants seeding is the canonical non-trivial case).
- **Append a history entry** to the `bundles.ts` comment block: what changed, merge type,
  both tolerance directions, "Worker is bundle-opaque (no Worker change)".
- **Pay the bump tax**: these tests pin the literal version and MUST be touched
  deliberately: `dmn-draw-mechanics.test.ts:232`, `dmn-bundle-cross-version.test.ts:27`,
  `maze-bundle-cross-version.test.ts:38`, `acceleration-bundle.test.ts:25`,
  `squad-bundle-sync.test.ts:25`, `imprint-keepsake-sync.test.ts:51` (all under
  `apps/neurons-tw/src/__tests__/`). If you bumped and no pin test failed, add one.
- **Version collisions across parallel sessions**: SV numbers are claimed by ship order —
  check `bundles.ts` on main/track-neurons before assuming yours. **26 is taken; next is 27.**
- The Worker guard is version-agnostic (refuses presign when incoming SV < stored blob SV,
  409): a bump never needs a Worker deploy, but a v(N−1) client will get push-409'd after
  the first v(N) push (pull still works; SPA reload recovers). That fence is a feature —
  it stops old clients washing out new fields they'd drop.

## 4. Dexie-vs-R2 bump matrix

| Change | Dexie `.version()` bump? | Upgrade fixture? | R2 SV bump? |
|---|---|---|---|
| New synced table | YES (new store) | YES — mandatory ([`docs/DEXIE_UPGRADE_FIXTURE_RULE.md`](DEXIE_UPGRADE_FIXTURE_RULE.md); CI `dexie-fixture-lint`) | YES (new adapter key) |
| New INDEXED field on an existing table | YES (`.stores()` string changes) | YES | YES if the field syncs |
| New NON-indexed field on a synced row | **NO** (Dexie only indexes what's declared; e.g. `pinnedAt` SV25) | NO | YES (row shape changed) |
| New enumerated synced meta key | NO (meta kv exists) | NO | YES |
| New synced meta key FAMILY (dynamic keys) | NO | NO | YES + matcher (§5) + account-wipe coverage |
| Device-local meta / localStorage only | NO | NO | NO |
| **Primary key change** | **FORBIDDEN** — Dexie 4.x throws `UpgradeError`; broke prod for every user once | — | — |

`dexie-fixture-lint` passing as a no-op is the EXPECTED signal when you didn't bump Dexie.

## 5. Single-source matcher pattern (dynamic meta-key families)

The service that MINTS the keys exports the predicate/prefix; `isSyncedMetaKey`
consumes it. Mint and filter can then never drift.

- Prefix (write-once presence only): `IMPRINT_PREFIX`
  ([`prescription.ts:121`](../apps/neurons-tw/src/lib/services/prescription.ts)) →
  re-exported as `IMPRINT_SYNC_PREFIX` ([`tables.ts:502`](../apps/neurons-tw/src/lib/sync/tables.ts)).
- Predicate (date-windowed families): `isSyncedPrescriptionKey`
  ([`prescription.ts:171`](../apps/neurons-tw/src/lib/services/prescription.ts)) —
  `plan/wrong/breadth/cramRescue/wire/tierClaim` sync today ±1 local day;
  `completed/reward` all dates; `lightsOut`/`localSeed` never.

Rules when adding a family:
1. Export the prefix/predicate from the minting service; import it in `tables.ts` —
   never inline a copy. (prescription.ts imports nothing from lib/sync → no cycle;
   keep it that way.)
2. **Only write-once presence keys may ride a bare synced prefix** (first-write-wins =
   UNION). A mutable/deletable value needs a registered backfill post-pass defining its
   merge (the `plan:` MIN-LWW is the precedent).
3. Matchers must be mutually exclusive — a key must enter via exactly ONE clause of
   `isSyncedMetaKey` (imprint keys are deliberately excluded from the prescription
   predicate's families).
4. Add the family to account-switch/reset wipe coverage (usually free if it lives under
   `PRESCRIPTION_META_PREFIX`; a NEW namespace needs its own prefix-delete in
   `clearLocalSyncedData`).
5. Date-windowed families keep the bundle bounded; window tests live in
   `prescription-sync-matcher.test.ts`.

## 6. Backfill post-pass rules (`runOnPullComplete`)

[`backfill/index.ts:18`](../apps/neurons-tw/src/lib/sync/backfill/index.ts). Current
order: 1 counters-MAX → 1b representatives-LWW → 1c active-squad-LWW → 1d first-pull-UNION
→ 1e dmn-daily (date-gated MAX + grants/consumes projection) → 1f prescription-plan MIN-LWW
→ 2 achievements backfill (silent) → 3 leaderboard derived.

When adding a post-pass:
- Wrap in its own `try/catch` (one failing pass must not starve the rest).
- Make it **idempotent** and **order-independent** (MAX/UNION/MIN over a total order —
  a semilattice). Steps 1–1f are mutually independent; only step 2 depends on 1.
- It runs ONLY when a pull actually applied something (engine gate,
  [`engine.ts:195`](../apps/neurons-tw/src/lib/sync/engine.ts)) — never rely on it as a
  periodic job.
- It receives the incoming bundle's meta map via `extractBundleMetaMap`; missing keys
  parse to null/0 — write guards so "absent incoming" never zeroes local.
- Validate-then-repair belongs here too: the prescription pass DELETES a malformed plan
  the generic first-write transport may have installed
  ([`prescription-plan.ts:49–58`](../apps/neurons-tw/src/lib/sync/backfill/prescription-plan.ts)).

## 7. Engine / push-path invariants (do not "simplify" these away)

- **Debounce 12s ±30% jitter** ([`useSync.ts:34`](../apps/neurons-tw/src/lib/sync/useSync.ts),
  [`engine.ts:27`](../apps/neurons-tw/src/lib/sync/engine.ts)). Lowering it re-opens the
  R2 Class-A 412-storm ($ real money — failed PUTs bill as Class A). Server side, the
  Worker presign PUT rate-limit (10/min) + **PUT TTL 10s** are load-bearing: TTL must be
  ≤ 60s − worst clock skew or a stuck client caches one presigned URL past the limiter.
- **`MAX_PUSH_RETRIES = 1` + defer-on-conflict** ([`engine-r2.ts:27`](../apps/neurons-tw/src/lib/sync/r2/engine-r2.ts)):
  a surviving 412/409 returns `{status:'deferred'}`; the engine keeps state dirty,
  re-arms the jittered debounce, and — CRITICAL — **does NOT set `lastPushAt` and does
  NOT fire `onPushComplete`** (a false fire would upsert the leaderboard for a push that
  never landed). 5 consecutive defers → red light. Must-succeed paths (account reset)
  omit `deferOnConflict` and THROW instead.
- **Single-flight per user**: every PUT call site goes through `pushBundleSerialized`
  ([`engine-r2.ts:185`](../apps/neurons-tw/src/lib/sync/r2/engine-r2.ts)) → Web Lock +
  `refreshEtagFromStore` — except the reset path, which takes the SAME lock itself and
  calls low-level `pushBundle` inside it (re-acquiring would self-deadlock). Never add a
  third raw `pushBundle` call site.
- **ETag rules** ([`etag.ts`](../apps/neurons-tw/src/lib/sync/r2/etag.ts)): user-scoped
  keys only; pull persists the etag **only AFTER `applyBundleSnapshot`**
  ([`engine-r2.ts:267–271`](../apps/neurons-tw/src/lib/sync/r2/engine-r2.ts)); both 404
  branches clear it; account switch/reset calls `clearAllPersistedEtags()` +
  `clearPresignCache()`.
- **Push triggers derive from the registry** ([`useSync.ts:40`](../apps/neurons-tw/src/lib/sync/useSync.ts)):
  `SYNCED_TABLES = NEURONS_ADAPTERS.map(name)`. A new adapter gets its Dexie hooks for
  free. Locked by `account-guard.test.ts:186` ("SYNCED_TABLES is exactly the adapter
  registry") — never hand-maintain a table list (a hand list once drifted to 7/20).
- **`onPushComplete` helpers must not write any synced table** (else write-hook →
  schedulePush → infinite loop; see the leaderboard auto-upsert comment,
  [`useSync.ts:97–101`](../apps/neurons-tw/src/lib/sync/useSync.ts)).

## 8. Testing discipline — what a sync change MUST ship with

Canonical example file: [`pin-queue-r2-sync.test.ts`](../apps/neurons-tw/src/__tests__/pin-queue-r2-sync.test.ts)
(SV25) covers nearly the whole checklist.

| Test | Asserts | Copy from |
|---|---|---|
| Adapter round-trip | row → `snapshot` → `JSON.stringify/parse` → `apply` on fresh DB → identical | `pin-queue-r2-sync.test.ts:42` |
| Preserve-on-omission | incoming row omitting the new field does NOT clear local | `pin-queue-r2-sync.test.ts:72`; `question-flags-error-cause.test.ts` |
| Explicit-clear propagates | newer explicit null/empty-string clears local; STALE clear does not | `pin-queue-r2-sync.test.ts:58` + `:87` |
| Monotonic lock | stale row cannot revert OR/UNION/MAX state | everWrong tests; `dmn-draw-mechanics.test.ts` |
| Cross-version bundle | old-shape bundle into new client preserves local; new-shape into old drops cleanly | `dmn-bundle-cross-version.test.ts`, `maze-bundle-cross-version.test.ts` |
| SV pin | `expect(SCHEMA_VERSION).toBe(N)` — see the §3 list; touch deliberately | any of the 6 pin files |
| Convergence both pull orders | for MIN-LWW / any post-pass: A-then-B ≡ B-then-A | `prescription-plan` tests; `prescription-sync-matcher.test.ts` |
| Setter carry-through | local setters preserve fields they don't own | `pin-queue-r2-sync.test.ts:102` |
| Dexie upgrade fixture | only when `.version(N)` was added — v(N−1) seed → reopen full chain | [`DEXIE_UPGRADE_FIXTURE_RULE.md`](DEXIE_UPGRADE_FIXTURE_RULE.md) |
| Wipe/reset coverage | new account-owned surface is cleared; ack ordering unchanged | `account-guard.test.ts:148`; `account-reset.test.ts` |

## 9. Prod-verify discipline (localhost lies)

- **R2 push FAILS on localhost dev** (`r2_push_exhausted: Failed to fetch`) →
  `onPushComplete` NEVER fires in dev. Pull works. Any push-dependent behavior
  (leaderboard upsert, cross-device propagation) is only verifiable in prod
  (`med-study-rpg.com/neurons/`). Side benefit: dev sessions can't pollute the owner's
  cloud save — but still `__sync.pause()` before mutating smoke on a signed-in account.
- **Chrome MCP `read_network_requests` MISSES cross-origin binary PUTs** — you will see
  only the OPTIONS 204 preflight. Confirm the PUT with the Performance API:
  `performance.getEntriesByType('resource').filter(e => e.name.includes('cloudflarestorage'))`.
- **Sticky-legacy / frozen-record gotcha**: date-frozen records (e.g. `plan:{date}`)
  merge earliest-wins — a record minted BEFORE your change keeps winning for that date,
  so new-shape behavior appears only on the NEXT fresh record. Verify in a fresh /
  anonymous context (headless Playwright fresh profile = empty IndexedDB), not the
  owner's live account, or you'll misread "no effect" as a bug.
- **Bundle bake check**: `curl -s <prod-js-url> | grep -c <feature-marker>` and confirm
  the Supabase ref `jakdyjxojokyqxeiuukx` is baked (0 hits = env not baked, silent
  sync-off). `.env.local` is per-app AND per-worktree — deploys run from
  `~/coding-scratch/study-rpg` (deploy worktree), not this one.
- Owner-data prod smoke must be READ-ONLY invariant checks (e.g. the DMN
  `available == clamp(grants − consumes, 0)` check), never destructive.

## 10. OpenSpec archive gotcha (spec-loss risk on sync specs)

Raw `openspec archive -y` applies MODIFIED deltas as **wholesale block replacement** —
a partial-style MODIFIED delta silently deletes every scenario it didn't restate, and
`validate --strict` will NOT catch it. Sync capabilities (`neurons-cloud-sync`,
`neurons-daily-prescription`, `neurons-dmn-fate-cards`, `neurons-wrong-answer-list`)
carry Vitest-locked invariants in their scenarios — losing them un-anchors the tests.
**Default to `/opsx:archive`**; raw CLI only for confirmed full-restatement deltas AND a
post-archive scenario-level diff:
`git diff <pre>..<post> -- openspec/specs/ | grep '^-#### Scenario:'` — every removed
scenario must have a deliberate replacement.

## 11. Known accepted limitations & open watch items (2026-07-07 audit)

Documented so future sessions don't "rediscover" them as bugs — or regress the accepted
trade-offs:

- **Accepted (do not fix)**: two devices spending DMN tickets from the same base collapse
  to one consume (player-favoring refund); tier energy MAX-absorption on a less-active
  device (forgiving economy); `inventory` per-kind LWW may drop concurrent offline stock
  changes; synapse whole-row LWW on `lastCoFireDate` can regress a `strong` wire when a
  never-synced device co-fires the pair fresh (bounded by the 7-day decay model +
  permanent `connectorNeurons` unlock).
- **Open (candidate follow-up changes; report, don't drive-by-fix)**:
  1. `promoteCount` / `rarestPromotedRank` (local meta, `variant-fusion.ts`) survive
     account wipe/reset yet feed `backfillAchievementsFromCurrentStats`
     ([`achievement.ts:134`](../apps/neurons-tw/src/lib/services/achievement.ts)) →
     post-reset/switch achievement resurrection (cosmetic; achievements then sync
     monotonic = permanent). Fix direction: add achievement-feeding local meta to
     `clearLocalSyncedData`.
  2. `dmnHiddenRevealedArtworkIds` is a growing CSV set synced under first-write-wins
     with NO union post-pass → cross-device reveals never converge (cosmetic;
     duplicate reveals possible). Fix direction: UNION post-pass à la `first-pull.ts`.
  3. Stale comment at [`tables.ts:415–417`](../apps/neurons-tw/src/lib/sync/tables.ts)
     claims `currentQuizCorrectStreak` is excluded from the allowlist; it is included
     at `tables.ts:422` (code is intentional; fix the comment on next touch).

## 12. Pre-ship checklist — ANY sync change

- [ ] Merge type chosen from §1 table; if meta-key: post-pass question answered explicitly
- [ ] No §2 bug class reintroduced (walk a–h one by one — 2 minutes, do it)
- [ ] SCHEMA_VERSION: bumped iff bundle shape changed; history entry appended; both
      tolerance directions stated AND implemented; SV pin tests updated (§3 list)
- [ ] Dexie: bump only for stores/index change; upgrade fixture if bumped (§4)
- [ ] New meta family: matcher single-sourced from the minting service; wipe coverage added (§5)
- [ ] New adapter: added to `NEURONS_ADAPTERS` only (hooks/wipe/registry tests derive from it)
- [ ] Nullable synced field typed `T | null`; setters carry through fields they don't own
- [ ] Account wipe/reset: new account-owned surface covered; wipe-then-ack ordering untouched
- [ ] Tests per §8 (round-trip / omission / clear / monotonic / cross-version / convergence)
- [ ] `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` green
- [ ] Worker untouched (bundle-opaque) — unless you changed presign/reset/leaderboard
      semantics, in which case: 二階 shares this Worker; verify `m2`/`bookmarks` unaffected,
      and remember deploy-worker.yml auto-fire is unreliable (verify Worker Version bumped)
- [ ] Spec delta updated for the touched capability; archive via `/opsx:archive` (§10)
- [ ] Prod verify per §9 (fresh context for frozen-record features; Performance API for PUTs)
