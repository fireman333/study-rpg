## Context

今日處方箋 (neurons-daily-prescription) is a deliberately-small anti-anxiety daily quest: two lines (訂正 N + 開發連結 M, ≤12 questions), completion drives NG-0717 maturation + per-subject imprints. All daily state lives in `meta` under `prescription:v1:` as write-once keys; by spec it is LOCAL-ONLY except the imprint keepsake prefix (`IMPRINT_PREFIX`, synced FWW-UNION since SV24). The owner has decided (2026-07-07, after a Fable+Codex blind panel and an Opus synthesis) to (a) sync the daily state cross-device and (b) extend the prescription into a 4-tier same-day ladder with small conduction-energy rewards. The locked design is in `~/.claude/scratch/handoff-neurons-daily-prescription-sync-2026-07-07.md`; this document records the architecture decisions and flags the judgment calls made while translating it into spec text.

Relevant standing invariants (must not regress):
- meta sync is metaAdapter first-write-wins; dynamic families ride matchers (`isSyncedMetaKey`, `tables.ts:505-507`); families needing a different merge get a `backfill/` post-pass run by `runOnPullComplete` (precedents: MAX-merge counters, representatives LWW, active-squad LWW, first-pull UNION, DMN date-gated MAX).
- Bidirectional/spendable counters are forbidden in meta sync (DMN draw-resurrection incident); energy pools are per-family MONOTONIC `maze:<familyId>:earned` MAX-merge counters (`maze/economy.ts`, `backfill/counters.ts`).
- Anti-anxiety copy contract enforced by the copy-guard test (`cram-coverage.test.ts:68-95`).
- R2 `SCHEMA_VERSION` currently **25** (`r2/bundles.ts:211`, pin-queue); Worker guard rejects lower-version pushes.

## Goals / Non-Goals

**Goals**
- Cross-device continuity for the daily quest (progress, completion, plan) with zero new merge types beyond one registered backfill post-pass.
- A 4-tier same-day ladder (T1 基礎處方 / T2 追加固化 / T3 形成連結 / T4 深度出征) with claim-gated flat energy rewards, Σ ≤ 70/day.
- Keep T1 mechanically identical (`completed:{date}` still drives NG-0717 / imprints / celebration).
- Preserve every anti-anxiety guarantee; extend the copy guard.

**Non-Goals**
- No reading-based tier credit (owner-locked: reading feeds maze energy + 累積閱讀 only).
- No cross-day tier accumulation, streaks, weekly stats, collection, leaderboard, or DMN axis.
- No Dexie bump, no Worker change, no new TableAdapter, no `prescription:v2` namespace migration.
- No strict plan-scoped crediting (owner accepted forgiving pre-convergence mixing).

## Decisions

### D1 — Tier is pure DERIVED; display adds a claim-floor (no stored monotonic-MAX tier)

`derivedTier = f(winnerPlan, UNION'd progress keys)` is recomputed on read — no stored mutable tier field, hence no new merge type and no resurrection surface. Because a divergent losing plan can make `derivedTier` drop after the MIN-LWW converges (device B's local plan had a smaller T2 pool, say), the DISPLAYED tier is `displayTier = max(derivedTier, highestClaimedTier)` where `highestClaimedTier` derives from the UNION'd `reward:` / `tierClaim:` keys. Claims are write-once, so the display is same-day monotonic — the player never sees a tier they celebrated get taken back. (Rejected: Codex's stored tier + monotonic-MAX merge — an extra merge type for no gain; rejected: display raw derivedTier — visible downgrade violates the anti-anxiety contract.)

### D2 — Stay on `prescription:v1:*`; no event-log migration

Codex's v2 event-log namespace was overruled (Opus adjudication): the existing write-once key grammar already IS an event log for our purposes, `completed:{date}` compatibility keeps NG-0717 / imprint / celebration paths untouched, and a namespace migration would orphan every in-flight day. New families (`wire:`, `tierClaim:`) slot into the same grammar.

### D3 — Energy = idempotent claim marker + flat write to the existing MAX-merge counter; NEVER scalar LWW

Both panel models independently converged on claim/transaction-gated grants (mutual validation). Mechanics:
1. In the crediting Dexie tx, write the claim key (`reward:{date}` for T1; `tierClaim:{date}:{2|3|4}` = `{claimedAt, energy, familyId}`) ONLY if absent.
2. Post-commit, if THIS tx performed the absent→present transition: flat `earned += energy` on the grant family's `maze:<f>:earned` key (no multipliers — bypasses `accrueMazeEnergy`'s speed/accel scaling) + toast.
3. A claim arriving via pull marks the tier claimed but never re-grants (the granted energy is already inside the MAX-merged counter).

Cross-device double-claim (both devices offline cross the same tier): both write `+E` flat on the same family from a similar base → MAX-merge collapses to ~one grant rather than stacking. This is approximate by design (owner-locked forgiving semantics); the failure mode is *under*-granting a few energy on divergent bases, never inflation beyond the max device. (Rejected: Codex's independent tx-log table — a new synced table + adapter for a ≤70/day cosmetic-scale reward.)

**Grant family determinism (judgment call — flagged for review):** the handoff says "發放 family 由 plan 凍結欄位決定 (deterministic)" without naming the field. Spec'd as: the plan's `breadthFamilyId` when non-null, else a deterministic fallback derived from the frozen plan (e.g. hash of `date + seed` over `FAMILY_IDS`) — never random/time-dependent, so two devices always pick the same family and D3's collapse works.

### D4 — Date-windowed synced-key matcher, single-sourced from prescription.ts

`isSyncedMetaKey` (tables.ts:506) gains ONE call into a matcher exported by `prescription.ts` (mirror `IMPRINT_PREFIX` single-sourcing). Families and windows:

| Family | Window | Merge |
|---|---|---|
| `plan:{date}` | today ±1d | MIN-LWW `(createdAt, seed)` post-pass (D5) |
| `wrong:` / `breadth:` / `cramRescue:` / `wire:` / `tierClaim:` | today ±1d | write-once FWW = UNION |
| `completed:` / `reward:` | ALL dates | write-once FWW = UNION (drive `completedDayCount`) |
| `lightsOut:` / `localSeed` | — | LOCAL (deletable / device ritual — violate write-once) |

The ±1 local-day window bounds bundle growth (per-question day keys don't ride forever) and tolerates midnight/timezone skew; FWW never deletes local keys absent from a bundle, so out-of-window local keys are simply untouched. Both snapshot and apply use the same test (existing invariant). **Window choice for the NEW families (wire/tierClaim/cramRescue) is inferred from the base research's ±1d (judgment call — flagged).**

### D5 — Plan divergence: earliest-createdAt-wins MIN-LWW post-pass

New `backfill/prescription-plan.ts` registered in `runOnPullComplete`: for each in-window `plan:{date}` present both locally and incoming, keep the one with min `createdAt`, tie-broken by min `seed`; malformed incoming → keep local. MIN over a totally-ordered pair is a semilattice → pull-order-independent, bidirectionally convergent. Earliest wins because the first device to open the day is the one most likely mid-progress; a late-opening idle device must not overwrite a worked plan. Progress keys UNION'd from a losing plan stay counted (forgiving — owner call #2); D1's claim-floor absorbs any derived-tier drop. (Rejected: per-device plans — progress denominators misalign; deterministic regen — violates the frozen anti-cheat snapshot.)

### D6 — Form-synapse objective: write-once wire keys off the existing co-repair emitter, pre-existing-wrong anti-farm

A boot-time listener (registered mirroring `initializeDmnTrigger`) on `connectome.synapseFormed` / `connectome.synapseStrengthened` writes `wire:{date}:{pairKey}` (write-once → per-pair-per-day dedup for free). Today's synapse count = distinct wire keys today; T3 needs ≥1, T4 ≥2. No new emitter: these events fire only at wrong-pool expedition settlement (`creditConnectomeFromExpedition`), already behind the effective-completion gate (≥5 repairs) and `DAILY_PAIR_CAP`.

**Anti-farm mechanism (judgment call — flagged for review):** the locked design mandates "需 pre-existing-wrong" without a mechanism. The event payloads (`pairKey`, states) carry no repair provenance, so the spec pins the OUTCOME (deliberately failing fresh questions today then repairing them must not mint tier-countable synapse credit) and the recommended implementation is: credit a wire key only when the settlement's counted repairs intersect the plan's frozen `wrongEligibleQuestionIds` (a pre-today wrong set by construction) — checked at the settlement hook point where the flipped question ids are known, rather than inside the payload-poor listener. If apply-phase finds this too invasive, the fallback is gating wire-key credit on `everWrong`-before-today of the repaired questions. Either satisfies the spec outcome.

### D7 — Single R2 `SCHEMA_VERSION` bump 25 → 26; zero Dexie; zero Worker

All new keys live in the existing `meta` table (no `.version()` bump — `lint:dexie-fixtures` must stay silent). The bundle gains only new meta rows → additive, reader-tolerant both directions (older client drops unknown keys; newer client preserves local keys absent from old bundles). Confirm `SCHEMA_VERSION === 25` at apply time before bumping (pin-queue took 25; a racing change would move the base).

### D8 — Anti-anxiety guardrails are spec'd, not just styled

- T1 is the ONLY tier whose copy may say 「完成」; T2–T4 render nothing until T1 is done (progressive disclosure — mirrors the 考前救援 visibility gate).
- Un-reached tiers use invite tone; tier state resets with the day and never accumulates cross-day.
- Copy-guard banned tokens extend with 未達成 / 落後 (還差 / 連續 already banned by `cram-coverage.test.ts:70`); all new tier copy constants join the guarded literals list.
- Objectives auto-shrink at plan generation with a frozen fallback chain: T2's pool = wrong-snapshot overflow beyond T1's target → (exhausted) breadth pool → (exhausted) cram practice at a doubled target; T4's targets shrink to what the frozen pools make achievable. No「今天不可能 T4」dead state can be frozen.

**T2 cram-fallback "×2" interpretation (judgment call — flagged for review):** the handoff's "cram×2" is read as: when T2's frozen kind is the cram fallback, the target DOUBLES (e.g. 6 cram answers instead of ~3 corrections), counted via the (now-synced) `cramRescue:{date}:{qid}` keys. This is also why cramRescue must sync (cross-device T2 counting) — consistent with the owner locking cramRescue SYNC.

**T4 correction-counter basis (judgment call — flagged for review):** "訂正累計 ~12" is spec'd as the same unit stream T1+T2 count (today's `wrong:{date}:*` keys, plus T2 fallback units when the chain engaged), cumulative from the day's first correction — not a separate third pool.

### D9 — Celebration-once on the first-completing device

The 「今日處方箋完成」note + NG-0717 stage-up presentation play only on the device whose own tx transitions `completed:{date}` absent→present. A device that learns completion via pull renders the completed state silently. This is the natural consequence of write-once + claim-gating (owner call #3, confirmed accepted).

## Risks / Trade-offs

- **Pre-convergence mixing** (owner-accepted): within an offline divergence window, another device's credits count against the winner plan's denominators — possible mixed-family progress display or same-day double imprint. Monotonic, no economy leakage (claims + MAX-merge cap it), forgiving-by-design.
- **Energy under-grant on divergent bases**: D3's MAX-collapse can absorb part of a second device's flat grant when counters diverged. Bounded (≤ the tier amount), cosmetic-scale; never inflation.
- **Snapshot growth**: per-question day keys × window. Bounded: ≤12 (T1) + ~3 (T2) wrong/breadth keys + ≤ a handful of cram/wire/claim keys per day, ×3 days in-window, plus full-history `completed:`/`reward:` (2 keys/day; a 100-day dogfood adds ~200 tiny rows — acceptable; revisit with a horizon window only if bundles bloat).
- **Deliberately-red tests**: `imprint-keepsake-sync.test.ts` pins SV25 (lines 43–45) and asserts sibling prescription keys are NOT synced (lines 54–94) — both flip red by design and are updated in this change; called out in tasks so the red is never "fixed" by reverting the feature.
- **Same-file conflict risk**: `bundles.ts` `SCHEMA_VERSION` is a hot constant across concurrent changes — confirm base 25 at apply.

## Migration Plan

Additive only. Old clients (SV ≤25) keep pulling (forward tolerance drops unknown keys) but cannot push after a v26 bundle lands (existing Worker fence) — standard reload recovery. New clients reading old bundles preserve local prescription keys (FWW never deletes). Legacy plans without tier-spec fields: tier panel stays hidden for that day (derived-absent tolerance), no backfill. Rollback = revert the client change; v26 bundles remain readable by the reverted client only after its own re-bump — practically, rollback before bake-end means owner redeploys SV-25 clients and the few v26 bundles are re-pushed down-version by the Worker fence exception being unnecessary (same posture as every prior additive bump; no data loss because all v26 additions are meta rows old clients ignore).

## Open Questions

None blocking — the four flagged judgment calls (D3 grant family, D4 new-family windows, D6 anti-farm mechanism, D8 cram-×2 + T4 counter basis) are spec'd with a concrete default each and await owner review at the propose gate.
