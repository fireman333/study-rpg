## Why

The 「置頂下次出征」pin queue (shipped in `refold-neurons-quick-review-into-expedition`) lives in transient device-local `localStorage` (`neurons.quickReviewQueue`), so a pin made on one device is invisible on the player's other devices and is wiped by clearing site data. The owner wants it to be **cross-device durable** — a question pinned on the phone should lead the next expedition on the laptop. The pin's durable substrate (`questionHistory.lastResult==='wrong'`) already syncs; only the *ordering preference* itself does not.

## What Changes

- **Add one nullable field `pinnedAt?: number` to the already-R2-synced `questionFlags` row.** Effective pin = `pinnedAt != null`; FIFO order = sort by `pinnedAt` ascending (in-memory over the few flag rows). This replaces the `localStorage` FIFO array with a per-row, per-question durable pin that rides the existing `questionFlags` sync path.
- **Enqueue** (置頂) = set `pinnedAt = now`. **Dequeue** (served / cleared) = set `pinnedAt = null` with a fresh `updatedAt` — the existing **per-row LWW** merge propagates the removal cross-device with **no tombstone** (this is the whole point of the design vs. syncing a FIFO array with removals, which is the exact merge-adapter bug class that has bitten this repo before, e.g. DMN draw-counter resurrection).
- **`putFlag` + the `questionFlags` R2 TableAdapter MUST preserve `pinnedAt`** with **preserve-on-omission** (an incoming row omitting `pinnedAt` must NOT clear a locally-set pin — the same rule the four existing boolean flags already follow).
- **`putFlag` (`question-flags.ts`) MUST carry `pinnedAt` through** so the four boolean-flag setters (✨/🤔/👁/💡) do not silently drop a pin when they persist.
- **Replace the `localStorage` queue service** (`quick-review-queue.ts`) with reads/writes over `questionFlags.pinnedAt`, dropping the manual `subscribe`/`prune`/`queueRev` reactivity machinery (a `localStorage`-reactivity workaround) in favour of native Dexie `liveQuery`.
- **BREAKING (sync surface):** R2 bundle `SCHEMA_VERSION` bumps **24 → 25** with forward/backward reader tolerance (old client reading a new bundle drops the unknown `pinnedAt`; new client reading an old bundle defaults `pinnedAt` absent = not pinned). Unchanged UX; the 「已置頂 N 題」badge and the expedition-lead ordering keep their behavior with a synced data source.
- **Old-client benign degradation:** an old client has no `pinnedAt` concept, so it simply never shows or acts on pins; a pin never resurrects on any client.

**Not required:** No Dexie `.version()` bump — `pinnedAt` is a **non-indexed** field (Dexie `.stores()` declares indexes, not all fields), so the mandatory upgrade-fixture rule does NOT trigger. `pinnedAt` MUST NOT be indexed.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-simplified-explanations`: the 「置頂下次出征」CTA now enqueues into a **durable cross-device** pin (`questionFlags.pinnedAt`) instead of a transient device-local queue.
- `neurons-homepage`: the full-expedition lead ordering and the 「已置頂 N 題」badge are now sourced from the **synced** `pinnedAt` pins (still-wrong filter unchanged); dequeue-on-close sets `pinnedAt = null` and propagates cross-device via per-row LWW.
- `neurons-quiz-modes`: the `questionFlags` row gains a nullable synced `pinnedAt` field; the R2 adapter serializes/applies it with preserve-on-omission, and this change **DOES** require an R2 `SCHEMA_VERSION` bump (24 → 25) — the previous "no schema bump" statement for the four boolean flags no longer covers the whole row.

## Impact

- **Schema / sync:** R2 `SCHEMA_VERSION` 24 → 25 (reader tolerance) in `apps/neurons-tw/src/lib/sync/r2/bundles.ts`; `questionFlags` R2 adapter in `apps/neurons-tw/src/lib/sync/tables.ts`; no Dexie version bump (non-indexed field, `QuestionFlagRow` in `apps/neurons-tw/src/lib/db.ts`).
- **Services:** `apps/neurons-tw/src/lib/services/question-flags.ts` (`putFlag` carry-through + a `pinnedAt` setter); `apps/neurons-tw/src/lib/services/quick-review-queue.ts` (reworked to read/write `pinnedAt`, or replaced).
- **UI:** `apps/neurons-tw/src/components/QuizModal.tsx` (置頂 CTA → set `pinnedAt`); `apps/neurons-tw/src/routes/OverviewPage.tsx` (pinned-still-wrong derivation, expedition lead + dequeue-on-close, DMN quick-review-batch drain, `pinnedCount` → `ConnectomeStatCard`); `apps/neurons-tw/src/components/ConnectomeStatCard.tsx` (`pinnedCount` prop — unchanged UX, new data source).
- **Tests:** Vitest for the `questionFlags` adapter `pinnedAt` round-trip + preserve-on-omission + dequeue-as-null LWW propagation (mirroring the existing four-flag round-trip tests).
- **No backend / Worker changes** (R2 presign whitelist already covers the `neurons` bundle; the bundle blob shape is client-owned).
