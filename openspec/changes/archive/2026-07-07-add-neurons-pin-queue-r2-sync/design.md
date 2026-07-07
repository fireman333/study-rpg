## Context

「置頂下次出征」lets a player pin a just-missed question so it leads their next 錯題出征 (and the DMN `quick-review-batch` mini-batch). Shipped in `refold-neurons-quick-review-into-expedition`, it stores the pin set as a FIFO string array in `localStorage` (`neurons.quickReviewQueue`, see `apps/neurons-tw/src/lib/services/quick-review-queue.ts`). `localStorage` is device-local and non-reactive, so:

1. A pin made on one device never reaches the player's other devices.
2. The service hand-rolls a `subscribe`/`prune`/`queueRev` mechanism so React consumers (the 「已置頂 N 題」badge + the expedition lead) recompute after a mutation — a workaround for `localStorage` not being reactive.

The pin's durable substrate already syncs: a pinned question is by definition a wrong question, and `questionHistory.lastResult` / `everWrong` already ride the R2 sync. Only the *ordering preference* (which wrong questions the player chose to surface first) is stranded on-device.

The `questionFlags` table is already R2-synced, per-question, and merged with **per-row LWW on `updatedAt`** (four coexisting boolean flags: `easyMarked` / `guessedMarked` / `wrongAnswerMarked` / `insightMarked`, with **preserve-on-omission** on apply). It is the natural home for a per-question pin.

This design is Fable's, chosen over a two-field Codex variant, and is the sanctioned cheap path deliberately avoiding a FIFO-array-with-removal sync adapter (the DMN-draw / dequeue-resurrection bug class this repo has already been bitten by).

## Goals / Non-Goals

**Goals:**
- Make a 置頂 pin **cross-device durable**: pin on device A → appears in the expedition lead + badge on device B after sync.
- Make a **dequeue** (served or cleared pin) propagate cross-device so a cleared pin does not re-lead the next expedition on another device — **without a tombstone**.
- Keep the UX identical (置頂 CTA copy, expedition lead ordering, 「已置頂 N 題」badge, DMN mini-batch drain).
- Simplify: drop the bespoke `localStorage` reactivity machinery in favour of Dexie `liveQuery`.
- Avoid a Dexie `.version()` bump (and therefore the mandatory upgrade fixture).

**Non-Goals:**
- No new synced Dexie table, no new synced meta key.
- No change to the still-wrong filter semantics (a pin only leads / counts while the question is still `lastResult==='wrong'`).
- No change to the DMN gacha, reading timer, or expedition settlement economy.
- No 觀念洞 concept-tag sibling expansion (explicitly deferred).
- No indexed `pinnedAt` (would force a Dexie version bump + fixture).

## Decisions

### D1 — One nullable field `pinnedAt?: number` on `QuestionFlagRow`, not a synced array

Add `pinnedAt?: number` to `QuestionFlagRow` (`apps/neurons-tw/src/lib/db.ts`). Effective pin = `pinnedAt != null`. FIFO enqueue order = sort by `pinnedAt` ascending, computed **in-memory** over the (few) flag rows at read time.

- **Enqueue** = set `pinnedAt = Date.now()` (with a fresh `updatedAt`).
- **Dequeue** = set `pinnedAt = null` (with a fresh `updatedAt`).

*Why over a synced FIFO array:* a shared array needs a merge policy for concurrent add/remove across devices; "remove" is the hard half (an element absent from an incoming snapshot is ambiguous — never-added vs. removed-here), which is exactly the resurrection bug class. Making the pin a **per-row attribute under the existing per-row LWW** means removal is just "a newer row whose `pinnedAt` is null wins" — the same mechanism that already correctly merges the four boolean flags. No new adapter, no tombstone.

### D2 — Dequeue = `pinnedAt = null` + fresh `updatedAt`; LWW carries the removal, no tombstone

Because the `questionFlags` adapter is per-row LWW on `updatedAt`, a dequeue that writes `{ pinnedAt: null, updatedAt: now }` beats an older peer row that still has `pinnedAt` set (older `updatedAt`). The null propagates and the pin clears cross-device. No tombstone table is needed — contrast the `questionBookmarks` tombstone path, which exists only because a bookmark *row delete* has no surviving row to carry LWW; here the row survives (it still holds the boolean flags), so the null value rides along.

### D3 — Preserve-on-omission for `pinnedAt`, and it does NOT conflict with dequeue-as-null

The R2 adapter must treat an **omitted** `pinnedAt` key (an older client that doesn't know the field) as "keep the local value", exactly like the four boolean flags:

```
pinnedAt: 'pinnedAt' in row ? (row.pinnedAt as number | null) : (existing?.pinnedAt ?? undefined)
```

Crucially, **omission** (`!('pinnedAt' in row)`) is distinct from an **explicit `null`** (dequeue): JSON serialization of a dequeued row emits `"pinnedAt": null` (an explicit key), so `'pinnedAt' in row` is `true` and the null is applied → the pin clears. Only a genuinely old client that never wrote the key triggers preserve-on-omission → a new client keeps its local pin (an old client simply can't affect pins). This is consistent with the handoff's "never resurrects": omission never turns a null back into a value, because it keeps whatever the current value is (post-dequeue that is null/absent). **The apply agent must not conflate `null` with omitted — that is the one subtle correctness point of this change.**

### D4 — `putFlag` carry-through so boolean-flag setters don't drop a pin

`putFlag` in `question-flags.ts` reconstructs the whole row on every `put` (Dexie `put` replaces). Today it carries the four booleans through from `existing`; it must **also** carry `pinnedAt` through, or ✨/🤔/👁/💡 would wipe a pin. Add `pinnedAt` to the preserved set:

```
pinnedAt: patch.pinnedAt !== undefined ? patch.pinnedAt : existing?.pinnedAt
```

The pin setter uses `undefined` as the "don't touch" sentinel and `number | null` as the explicit values (enqueue vs. dequeue), so a dequeue (`null`) is distinguishable from a no-op (`undefined`). Add `pinnedAt` to the `Partial<Pick<...>>` patch type.

### D5 — Replace the `localStorage` service with `pinnedAt` reads/writes + `liveQuery`

Rework `quick-review-queue.ts`:
- `enqueueQuickReview(id)` → set `pinnedAt = now` on that flag row.
- `dequeueQuickReview(ids)` → set `pinnedAt = null` on each.
- `isQueuedForQuickReview(id)` → `pinnedAt != null` on that row.
- `getPinnedStillWrongIds(isStillWrong)` → read all flag rows, filter `pinnedAt != null && isStillWrong(id)`, sort by `pinnedAt` asc.
- **Drop** `subscribeQuickReviewQueue` / `pruneQuickReviewQueue` / `queueRev` — with `liveQuery` over `questionFlags` (⨝ `questionHistory` for still-wrong) the badge + lead recompute natively; the prune-on-history-change effect becomes a read-time still-wrong filter (a pin whose question is no longer wrong is simply not counted / not led, and is naturally dequeued when the expedition serves-and-clears or can be lazily nulled — no eager prune write needed for correctness). Keep the setters `async` (Dexie writes) — callers already `await` or fire-and-forget the CTA.

*Migration of consumers:* `OverviewPage.tsx` currently derives `pinnedStillWrongIds` from the `localStorage` read + a `queueRev` subscribe + a prune effect. Replace with a `liveQuery` (or the existing `useAllFlags` hook ⨝ the wrong-set) that yields the still-wrong pinned ids in `pinnedAt` order; feed the same `leadThenFill` expedition pool and the same `pinnedCount` prop to `ConnectomeStatCard`. `QuizModal.tsx`'s `QuickReviewCta` repoints to the async enqueue. The DMN `quick-review-batch` handler drains the same `getPinnedStillWrongIds` first.

### D6 — R2 `SCHEMA_VERSION` 24 → 25 with reader tolerance (Dexie NOT bumped)

The `questionFlags` row shape changes (new synced field), so the R2 bundle is a real sync change: bump `SCHEMA_VERSION` 24 → 25 in `apps/neurons-tw/src/lib/sync/r2/bundles.ts` and add the version-history comment. Reader tolerance is already the bundle contract (a bundle with `schema_version > local` logs and drops unknown fields; a new client reading an old bundle sees `pinnedAt` absent = not pinned). Dexie is **not** bumped because `pinnedAt` is non-indexed — the `.stores()` string stays `'questionId, easyMarked, guessedMarked, updatedAt'`, so `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` does not trigger. **Do not add `pinnedAt` to the `.stores()` index list.**

## Risks / Trade-offs

- **Conflating omitted vs. explicit-null `pinnedAt` in the adapter** → the dequeue would either fail to propagate (if null treated as omission) or an old client could wipe pins (if omission treated as null). Mitigation: the adapter uses `'pinnedAt' in row` to branch, with a Vitest asserting (a) explicit `null` clears under LWW and (b) an omitting row preserves the local value. Called out as the single load-bearing correctness point (D3).
- **A stale pin whose question is no longer wrong** is filtered out at read time (still-wrong filter) but its `pinnedAt` may linger in the row until the next expedition serves-and-clears it. Mitigation: acceptable — it is invisible (not counted, not led) and harmless; no eager prune write is required. The row is nulled when the expedition dequeues served pins.
- **Old client (pre-25) benign degradation:** it has no `pinnedAt` concept, so it never shows or acts on pins; when it writes a flag row it omits `pinnedAt` and preserve-on-omission keeps the new clients' pins intact. No resurrection, no crash. Acceptable per owner.
- **Non-indexed sort at read time** over all flag rows is O(n) — n is small (only flagged questions), so trivial; explicitly chosen over indexing to avoid the Dexie version bump + fixture.

## Migration Plan

1. Land the field + adapter + service + UI + `SCHEMA_VERSION` bump together (one change).
2. On first sync after deploy, new clients begin writing `pinnedAt`; existing pins (localStorage) are **not** migrated (they are transient by prior contract) — a player simply re-pins, now durably. No data migration script.
3. **Rollback:** revert the change; `SCHEMA_VERSION` returns to 24. A row written at 25 with `pinnedAt` is read by a 24 client as an unknown field and dropped (existing reader tolerance) — no crash, pins just stop syncing. No destructive rollback path.

## Open Questions

- None blocking. (Eager-prune of stale pins is deliberately omitted; revisit only if lingering nulls ever show up as a real problem, which the still-wrong read filter already masks.)
