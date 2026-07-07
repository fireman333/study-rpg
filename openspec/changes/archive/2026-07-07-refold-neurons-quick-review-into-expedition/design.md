## Context

`add-neurons-weakness-radar-and-error-repair` (shipped 2026-07-06, commit `6ea17b05`) added a「加入快速複習」CTA on the wrong-answer / error-cause replay. Tapping it calls `enqueueQuickReview(cur.id)` (`apps/neurons-tw/src/lib/services/quick-review-queue.ts`) — a transient `localStorage` FIFO (`neurons.quickReviewQueue`), no Dexie/R2 involvement.

Today that queue has exactly **one** consumer: the DMN `quick-review-batch` fate-card consumable. When the player draws that card → activates it → the toast emits `dmn.quickReviewStart` → `OverviewPage` sets `quickReviewActive=true` and opens the expedition modal capped to ≤5. Only the `quickReviewActive` branch of the `expeditionPool` memo (`OverviewPage.tsx:279-292`) leads the queued ids; the **full** expedition branch (`OverviewPage.tsx:275`) ignores the queue entirely.

Consequence: a player with no DMN 券 pins questions that never resurface — the queue **strands**, and the CTA copy (「已加入快速複習」) implies a review flow the player can't reach. Owner + Codex (high-effort review) converged on **方案 D 變體**: fold the queue into the daily 錯題出征 mainline and rename the CTA, rather than build a new panel or teach the feature with a banner.

## Goals / Non-Goals

**Goals:**
- Give the pinned queue a reliable, always-available drain: the daily full 錯題出征.
- Make the CTA copy honest — pinning affects the *next expedition*, not an immediate mini-batch.
- Surface a「已置頂 N 題」badge on the 錯題出征 entry for discoverability + confirmation.
- Keep the change small, reversible, and **zero-schema** (transient `localStorage` only).

**Non-Goals:**
- Not touching the DMN `quick-review-batch` consumable — it stays a gacha-reward shortcut (draw → ≤5-Q flash batch) and continues to drain the same queue first.
- No new UI panel, route, banner, or onboarding step.
- No new synced state (no Dexie version bump, no R2 `SCHEMA_VERSION` bump, no synced meta key).
- No change to how questions become "wrong" or to expedition scoring / DMN credit (`onExpeditionComplete`).

## Decisions

### Decision 1 — Full expedition leads the queue via a shared lead helper (not duplicated inline logic)

Today the `quickReviewActive` branch inlines the lead-then-fill logic (`OverviewPage.tsx:279-292`). Rather than copy that into the full-expedition branch, extract a small helper that both branches call: given the ordered pool + the queued still-wrong ids, return the pool with queued ids moved to the front (deduped, order preserved).

- **Full branch**: `leadWithQueue(buildWrongQuestionPool(pack.questions, questionHistory, flagOf), queuedStillWrongIds)` — no cap (full expedition serves the whole wrong set).
- **Quick-review branch**: unchanged behavior — lead queued ids, fill from `buildQuickReviewPool(...)`, cap 5.

*Why over inlining:* one ordering rule, one place to test; avoids the two branches drifting.

*Alternative considered — make the full branch also cap at 5:* rejected. The full expedition is the whole wrong set by design; capping would change unrelated behavior.

### Decision 2 — "still-wrong" filtering lives in the queue service

The badge count and the lead ordering must both ignore ids that are no longer `wrong` (already cleared elsewhere). Add one helper to `quick-review-queue.ts` that intersects the stored ids with the caller-supplied still-wrong set (or filters against `questionHistory`), returning ids in queue order. Both the `expeditionPool` memo and the `ConnectomeStatCard` badge derive from this single source.

*Why:* keeps "what counts as pinned" in one file; the badge and the pool can never disagree.

### Decision 3 — Dequeue served pins on the full-expedition close path

`OverviewPage.tsx:858` already calls `dequeueQuickReview(expeditionPool.map(q => q.id))` — but only inside `if (quickReviewActive)`. Extend the `onClose` so the **full** expedition path also dequeues the served ids. Because `expeditionPool` for the full expedition is the whole wrong set (which already includes the pins at the front), dequeuing the pins that were actually part of this pool is correct: a pin the player saw in this expedition is considered served.

*Refinement:* dequeue the intersection of `expeditionPool` ids with the current queue (not the entire pool) so we only remove ids that were genuinely pinned. Cheap `Set` intersection.

*Alternative considered — dequeue only questions answered correctly this session:* rejected as over-engineered. The pin is a "put this in front of me next time" hint, not durable SRS state; once it's led an expedition, its job is done. Re-pinning is one tap away if the player still wants it.

### Decision 4 — CTA rename is copy-only; enqueue call unchanged

`QuickReviewCta` (`QuizModal.tsx:1140`) changes label / `aria-label` / `title` / confirmed-state text (「加入快速複習」→「置頂下次出征」; confirmed「已加入快速複習」→「已置頂，下次錯題出征會優先遇到」). The upstream `handleAddToQuickReview` → `enqueueQuickReview(cur.id)` is untouched. Icon may stay 🔍 or move to ⏫/📌 (cosmetic; owner's call at apply time).

### Decision 5 — Badge is a new optional prop on `ConnectomeStatCard`

Pass a `pinnedCount` (derived from the still-wrong queue helper) into `ConnectomeStatCard`; render「已置頂 N 題」next to the ⚔️ 錯題出征 CTA only when `> 0`. Optional prop → no churn for other callers; defaults to no badge.

### Decision 6 — Observable queue + prune (added after adversarial Codex review)

The initial cut derived `pinnedStillWrongIds` from `useMemo([questionHistory])` while reading `localStorage` — which isn't reactive. Codex flagged two real bugs: (a) the badge/lead went stale after `dequeueQuickReview` on close (badge kept showing a count; reopening re-led an already-dequeued pin), and (b) a pin cleared *outside* an expedition lingered in storage and could silently re-pin the question if it became wrong again.

Fix:
- **Observable queue**: `quick-review-queue.ts` `write()` notifies a small listener set; `OverviewPage` subscribes via `subscribeQuickReviewQueue` and bumps a `queueRev` state that is a dependency of the `pinnedStillWrongIds` memo. Any mutation (enqueue in `QuizModal`, dequeue on close, prune) now recomputes the badge + lead. Verified live in Chrome (badge appears on pin, clears on expedition-close, both without reload).
- **Prune**: `pruneQuickReviewQueue(isStillWrong)` (writes/notifies only when it actually drops an id) is run from a `useEffect([wrongIdSet])`, keeping the raw queue truthful and preventing the resurrection case.

This is cheaper than Codex's suggested per-issue patches (a served-ids snapshot ref + separate revision counter): the prune makes the "served set drifted at close" case moot (a cleared pin is gone from the queue before close), and the observable queue is a single mechanism covering enqueue + dequeue + prune uniformly.

## Risks / Trade-offs

- **Pin "served" the moment it enters a pool, even if the player closes the expedition without answering it** → Mitigation: acceptable per Decision 3 — a pin is a soft ordering hint, not a guarantee; the question is still in the wrong set and re-pinning is trivial. Documented so it isn't mistaken for a bug.
- **Two consumers of one queue (full expedition + DMN mini-batch) could double-serve a pin** → Mitigation: both dequeue what they serve; a pin drained by one path is gone for the other. No correctness issue, only a rare "I pinned it and a DMN batch grabbed it first" — which is the desired outcome (it got reviewed).
- **Badge count could momentarily include an id the player just cleared in another flow** → Mitigation: the still-wrong filter is evaluated against live `questionHistory`; stale counts self-correct on the next render.
- **localStorage unavailable (private mode)** → already handled: the queue service degrades to empty and never throws (existing `try/catch`). Badge shows nothing, expedition serves the plain wrong pool. No regression.

## Migration Plan

Pure client-side, no data migration. Deploy = merge `track-neurons` → `main` → push (CF Pages auto-deploy) after owner authorization (external-publish gate). Rollback = revert the change; the transient queue is forward/backward compatible (same `localStorage` key + shape, unchanged). No schema version to coordinate.

## Open Questions

- Icon choice for the renamed CTA (🔍 / ⏫ / 📌) — cosmetic, defer to owner at apply time; does not affect specs or tests.
