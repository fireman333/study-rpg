## 1. Queue service — still-wrong filtering helper

- [x] 1.1 In `apps/neurons-tw/src/lib/services/quick-review-queue.ts`, add a helper (e.g. `getPinnedStillWrongIds(isWrong: (id: string) => boolean): string[]`) that returns the queued ids, in queue order, filtered to ids the predicate still marks `wrong`. Keep the existing API (`enqueueQuickReview` / `getQuickReviewQueue` / `dequeueQuickReview` / `isQueuedForQuickReview` / `clearQuickReviewQueue`) unchanged.
- [x] 1.2 Add a pure lead-ordering helper (co-located, e.g. `leadThenFill(pool, leadIds)`) that returns `pool` with the `leadIds` questions moved to the front (deduped, order preserved) — or place it wherever both `OverviewPage` branches can import one copy.

## 2. OverviewPage — full expedition leads + dequeues the pins

- [x] 2.1 In `OverviewPage.tsx` `expeditionPool` memo (`~L271-293`), make the **full** branch (`!quickReviewActive`) lead the queued still-wrong ids: `leadThenFill(buildWrongQuestionPool(pack.questions, questionHistory, flagOf), pinnedStillWrongIds)`. Derive `pinnedStillWrongIds` from the queue helper (task 1.1) against `questionHistory`. Full branch stays uncapped.
- [x] 2.2 Keep the `quickReviewActive` branch behavior (lead + `buildQuickReviewPool` fill, cap 5) — refactor it to reuse `leadThenFill` so both branches share one ordering rule.
- [x] 2.3 In the expedition modal `onClose` (`~L855-861`), dequeue the served pins on the **full**-expedition path too: `dequeueQuickReview(intersection(expeditionPool ids, current queue))`. Keep the existing `quickReviewActive` dequeue.

## 3. ConnectomeStatCard — 「已置頂 N 題」badge

- [x] 3.1 Add an optional `pinnedCount?: number` prop to `ConnectomeStatCard` (`apps/neurons-tw/src/components/ConnectomeStatCard.tsx`); render a「已置頂 N 題」badge next to the ⚔️ 錯題出征 CTA only when `pinnedCount > 0`.
- [x] 3.2 In `OverviewPage.tsx`, compute `pinnedCount` from the still-wrong queue helper (task 1.1) and pass it into `ConnectomeStatCard` (memoized so it tracks `questionHistory`).

## 4. QuizModal — CTA rename (copy only)

- [x] 4.1 In `QuizModal.tsx` `QuickReviewCta` (`~L1140`), change label / `aria-label` / `title`:「加入快速複習」→「置頂下次出征」; confirmed state「已加入快速複習」→「已置頂，下次錯題出征會優先遇到」. Leave `handleAddToQuickReview` → `enqueueQuickReview(cur.id)` unchanged. (Icon 🔍/⏫/📌 = owner's cosmetic call.)

## 5. Tests

- [x] 5.1 Unit-test `leadThenFill`: queued still-wrong ids lead, order preserved, deduped, non-wrong ids excluded.
- [x] 5.2 Unit-test the still-wrong queue helper: filters out ids no longer `wrong`; preserves queue order.
- [x] 5.3 Test dequeue-after-full-expedition: served pins are removed from the queue; unrelated queue ids remain.
- [x] 5.4 Run `pnpm --filter @study-rpg/neurons-tw test` — full suite green (extends the ~889-test baseline).

## 6. Verify

- [x] 6.1 `pnpm -r typecheck` clean.
- [x] 6.2 Chrome MCP / preview smoke (dev): answer wrong → tap「置頂下次出征」→ confirm copy「已置頂，下次錯題出征會優先遇到」→ open ⚔️ 錯題出征 → pinned question appears first + entry shows「已置頂 N 題」→ after clearing, close expedition → pin dequeued (not re-led next open).
- [x] 6.3 Confirm no schema drift: no Dexie `.version()` added, no R2 `SCHEMA_VERSION` bump, no new synced meta key; DMN `quick-review-batch` path (`DmnQuickReviewToast.tsx` / `dmn-event-dispatcher.ts`) untouched.

## 7. Codex-review follow-up (adversarial review before commit)

- [x] 7.1 Fix badge/pool staleness (Codex P2): localStorage isn't reactive — add `subscribeQuickReviewQueue` (emit in `write()`) + a `queueRev` state in `OverviewPage` threaded into the `pinnedStillWrongIds` memo deps, so the badge + expedition lead recompute after enqueue / dequeue / prune. Verified live: badge appears on pin and clears on expedition-close with no reload.
- [x] 7.2 Fix stale-pin resurrection (Codex P2/P3): add `pruneQuickReviewQueue(isStillWrong)` (writes/notifies only on change) + a `useEffect([wrongIdSet])` in `OverviewPage` that prunes pins no longer wrong, so a pin cleared elsewhere can't silently re-pin later.
- [x] 7.3 Re-run typecheck + full suite (902 tests green, +3 for prune/subscribe) + Chrome end-to-end smoke (CTA rename + pixel 📌 + enqueue + lead + dequeue + live badge).
