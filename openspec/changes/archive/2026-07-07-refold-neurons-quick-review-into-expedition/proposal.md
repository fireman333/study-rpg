## Why

The「加入快速複習」CTA on a wrong-answer reveal (Feature 2 of `add-neurons-weakness-radar-and-error-repair`) enqueues the just-missed question into a transient device-local queue, but that queue's **only** consumer is the DMN `quick-review-batch` gacha consumable. A player without a DMN 券 has no way to drain the queue — the pinned questions **strand** and the CTA never explains what happens next. The daily mainline loop (⚔️ 錯題出征) already re-serves the player's wrong set every day, so the pin belongs there, not gated behind a random gacha reward.

## What Changes

- **Rename the CTA** on the error-cause replay:「加入快速複習」→「**置頂下次出征**」. Tapping it shows「已置頂，下次錯題出征會優先遇到」instead of the passive「已加入快速複習」state, so the player never expects a mini-batch to open immediately.
- **Fold the transient queue into the full 錯題出征 pool**: the **full** cross-subject expedition pool now leads the queued ids (today only the DMN `quickReviewActive` mini-batch does). Pinned questions surface first in the daily expedition and drain as the player clears them.
- **Dequeue served pins after a full expedition** too (today only the quick-review mini-batch dequeues), so a cleared pin doesn't get re-pinned to the front tomorrow.
- **Add a「已置頂 N 題」badge** to the 錯題出征 entry when the queue is non-empty (count filtered to ids that are still `wrong`), for discoverability + confirmation the pin took effect.
- **Leave the DMN `quick-review-batch` consumable untouched** — it stays a gacha-reward shortcut (draw card → ≤5-Q flash batch), coexisting with the daily 出征 mainline.
- **No banner / tutorial** — the corrected exit is self-evident (per Codex: small features shouldn't be taught, just wired correctly).
- **Zero schema bump**: the queue remains transient `localStorage` (`neurons.quickReviewQueue`); no Dexie version, no R2 `SCHEMA_VERSION`, no synced meta key.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `neurons-simplified-explanations`: the error-cause replay's add-to-quick-review action is renamed to「置頂下次出征」and re-pointed — the enqueued question now leads the **full 錯題出征 pool**, not only the quick-review mini-batch; the confirmed-state copy changes accordingly.
- `neurons-homepage`: the full cross-subject 錯題出征 pool SHALL lead the transient quick-review queue's still-wrong ids, the expedition entry SHALL surface a「已置頂 N 題」badge when the queue is non-empty, and completing a **full** expedition SHALL dequeue the served pinned ids.

## Impact

- **Code** (all in `apps/neurons-tw/`):
  - `src/components/QuizModal.tsx` — `QuickReviewCta` copy/aria/title + confirmed-state toast wording (enqueue call itself unchanged).
  - `src/routes/OverviewPage.tsx` — `expeditionPool` memo (full branch leads queued ids via a shared helper); expedition `onClose` dequeues served ids on the full-expedition path too.
  - `src/components/ConnectomeStatCard.tsx` — add「已置頂 N 題」badge next to the ⚔️ 錯題出征 CTA (new optional prop).
  - `src/lib/services/quick-review-queue.ts` — optional helper to filter the queue to still-wrong ids (badge count + lead ordering share one source of truth).
- **APIs / deps / storage**: none — no new dependency, no schema bump, no synced state. The DMN quick-review path (`DmnQuickReviewToast.tsx` / `dmn-event-dispatcher.ts`) is explicitly not touched.
- **Tests**: extend the ~889-test Vitest baseline with pool-lead ordering + dequeue-after-full-expedition coverage.
