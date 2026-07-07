## 1. Schema field (Dexie — no version bump)

- [x] 1.1 Add `pinnedAt?: number` to `QuestionFlagRow` in `apps/neurons-tw/src/lib/db.ts` (below the four boolean flags). Update the interface doc comment to note it is a non-indexed, R2-synced, nullable pin timestamp (LWW via `updatedAt`).
- [x] 1.2 CONFIRM the `questionFlags` `.stores()` string stays `'questionId, easyMarked, guessedMarked, updatedAt'` in EVERY `.version()` block — `pinnedAt` MUST NOT be indexed (indexing it would force a Dexie `.version()` bump + upgrade fixture per `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`).

## 2. Service: question-flags.ts (putFlag carry-through + pin setter)

- [x] 2.1 Extend the `putFlag` patch type to `Partial<Pick<QuestionFlagRow, 'easyMarked' | 'guessedMarked' | 'wrongAnswerMarked' | 'insightMarked' | 'pinnedAt'>>` and carry `pinnedAt` through: `pinnedAt: patch.pinnedAt !== undefined ? patch.pinnedAt : existing?.pinnedAt`. `undefined` = don't touch; `number` = enqueue; `null` = dequeue (distinct sentinels).
- [x] 2.2 Add `setPinnedAt(questionId, value: number | null)` (thin wrapper over `putFlag({ pinnedAt: value })`). This is the single write path for enqueue (`Date.now()`) and dequeue (`null`).
- [x] 2.3 Verify the four existing setters (`setEasy` / `setGuessed` / `setWrongAnswer` / `setInsight`) now preserve `pinnedAt` through the shared `putFlag` (they will automatically, since `putFlag` carries it — add a code comment noting the pin is preserved).

## 3. Service: quick-review-queue.ts (localStorage → questionFlags.pinnedAt + liveQuery)

- [x] 3.1 Rewrite the module over `questionFlags.pinnedAt` (drop the `STORAGE_KEY` / `read` / `write` / `listeners` machinery). New behavior:
  - `enqueueQuickReview(id)` → `setPinnedAt(id, Date.now())` (idempotent: skip if already `pinnedAt != null`; keep returning a count if callers use it).
  - `dequeueQuickReview(ids)` → `setPinnedAt(id, null)` for each.
  - `isQueuedForQuickReview(id)` → read the flag row, `pinnedAt != null`.
  - `getPinnedStillWrongIds(isStillWrong)` → read all flag rows, keep `pinnedAt != null && isStillWrong(id)`, sort by `pinnedAt` ascending, return ids.
  - `clearQuickReviewQueue()` → null every pinned row's `pinnedAt`.
- [x] 3.2 REMOVE `subscribeQuickReviewQueue` and `pruneQuickReviewQueue` (the localStorage-reactivity + eager-prune workarounds). Reactivity now comes from Dexie `liveQuery` at the consumer; the still-wrong filter at read time replaces the prune. Provide a `liveQuery`-friendly async read (or export a helper the consumers can wrap in `liveQuery(() => db.questionFlags.toArray())`).
- [x] 3.3 Update the module doc comment: it is now durable cross-device state on `questionFlags.pinnedAt` (NOT transient localStorage), per this change.

## 4. R2 sync wiring

- [x] 4.1 `apps/neurons-tw/src/lib/sync/tables.ts` `questionFlagsAdapter.apply`: add `pinnedAt` to the reconstructed `put`, using the `'pinnedAt' in row` branch — `pinnedAt: 'pinnedAt' in row ? (row.pinnedAt as number | null) : (existing?.pinnedAt ?? undefined)`. **Explicit `null` clears (dequeue); omitted key preserves (preserve-on-omission).** The existing per-row LWW gate (`existing.updatedAt >= updatedAt → skip`) already carries the dequeue. Add a code comment flagging the omitted-vs-null distinction as the load-bearing correctness point.
- [x] 4.2 `questionFlagsAdapter.snapshot` needs no change (it `toArray()`s full rows, so `pinnedAt` is already serialized) — CONFIRM `pinnedAt` appears in the serialized bundle (it will, as a plain field).
- [x] 4.3 `apps/neurons-tw/src/lib/sync/r2/bundles.ts`: bump `SCHEMA_VERSION` 24 → 25 and add the version-history comment line (row now carries synced `pinnedAt`). Reader tolerance is already the bundle contract — CONFIRM no other gating needs touching.

## 5. UI consumers

- [x] 5.1 `apps/neurons-tw/src/components/QuizModal.tsx` `QuickReviewCta`: repoint 「置頂下次出征」to the async `enqueueQuickReview` (now a Dexie write). Keep the confirmed copy「已置頂，下次錯題出征會優先遇到」and the pinned-state reflection (derive from `isQueuedForQuickReview` / a `useFlag`-style read of `pinnedAt`).
- [x] 5.2 `apps/neurons-tw/src/routes/OverviewPage.tsx`: replace the `pinnedStillWrongIds` memo + `queueRev` subscribe + prune effect with a Dexie `liveQuery` over `questionFlags` (⨝ the wrong-question set) yielding still-wrong pinned ids in `pinnedAt` order. Feed the same `leadThenFill` expedition pool (`expedition.ts`), pass the same `pinnedCount` to `ConnectomeStatCard`, and on the full expedition `onClose` dequeue the served pins via `setPinnedAt(id, null)`.
- [x] 5.3 `apps/neurons-tw/src/components/ConnectomeStatCard.tsx`: `pinnedCount` prop unchanged (UX identical, new data source) — CONFIRM it still renders 「已置頂 N 題」only when `pinnedCount > 0`.
- [x] 5.4 DMN `quick-review-batch` mini-batch handler (OverviewPage `dmn.quickReviewStart` / the dmn-fate-card path): CONFIRM it drains `getPinnedStillWrongIds` first (now sourced from `pinnedAt`) — no behavior change, verify the repointed source.

## 6. Tests

- [x] 6.1 Vitest for the `questionFlags` R2 adapter: (a) a row with `pinnedAt` set round-trips through snapshot→apply; (b) an incoming row with explicit `pinnedAt: null` + newer `updatedAt` clears the local pin (dequeue-as-null under LWW); (c) an incoming row OMITTING `pinnedAt` does NOT clear a locally-set pin (preserve-on-omission). Mirror the existing four-flag round-trip test in the sync tests.
- [x] 6.2 Vitest for `question-flags.ts`: a boolean-flag setter (`setEasy`) does NOT drop an existing `pinnedAt` (putFlag carry-through); `setPinnedAt(id, null)` clears it.
- [x] 6.3 Vitest for `quick-review-queue.ts`: `getPinnedStillWrongIds` returns only `pinnedAt != null && isStillWrong` ids in `pinnedAt`-ascending order; enqueue is idempotent; dequeue nulls the pin.

## 7. Verify + finish

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw test` (all green) + `pnpm -r typecheck` (clean).
- [x] 7.2 `pnpm lint:dexie-fixtures` — CONFIRM it does NOT flag this change (no new `.version(N)`, so no fixture required). If it flags, `pinnedAt` was accidentally indexed — fix task 1.2.
- [ ] 7.3 Chrome MCP smoke on dev (Vite; port-walk to :5175 if others hold :5173/5174): pin a wrong question in QuizModal → confirm 「已置頂 N 題」badge + expedition lead; read the flag row's `pinnedAt` via `indexedDB.open('neurons-rpg')`. Cross-device: pin on one IndexedDB origin, confirm it appears + dequeues on another (or two origins).
- [x] 7.4 `openspec validate add-neurons-pin-queue-r2-sync --strict` green.
