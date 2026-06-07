## Context

`grantFirstPullIfNeeded` ([`first-pull.ts:78`](apps/neurons-tw/src/lib/services/first-pull.ts)) mints the first-pull P5 via `pullVariant(..., { silent: true, forceRarity: 'P5', firstPull: true })`. `silent: true` suppresses the `variantGachaEvents.emit('variantRolled', …)` that would otherwise drive `VariantUnlockModal` ([`variant-gacha.ts:343`](apps/neurons-tw/src/lib/services/variant-gacha.ts)). `VariantUnlockModal` is mounted once at app root ([`App.tsx:75`](apps/neurons-tw/src/App.tsx)) and maintains its own internal reveal queue keyed off that event — so anything that emits `'variantRolled'` gets a reveal, regardless of source.

First-pull is triggered post-commit and **awaited** inside the answer flow: `recordCorrectAnswer:257` / `recordIncorrectAnswer:277` → `maybeGrantFirstPull:118` → `await grantFirstPullIfNeeded`. `QuizModal.handlePick` awaits `recordCorrectAnswer`/`recordIncorrectAnswer` before rendering the answer result, so the grant (and our enqueue) completes before the player can close the quiz.

## Goals / Non-Goals

**Goals:**
- Player sees a gacha reveal for each per-family first-pull P5, **deferred** to when they return to the maze/home (quiz close) — never mid-answer.
- Reuse `VariantUnlockModal` untouched; no schema/sync change.
- Reliable (no race), universal across all quiz-close paths, and safe under StrictMode.

**Non-Goals:**
- Showing the reveal mid-quiz (explicitly rejected in grill — that's the "首答當下立即彈出" option not chosen).
- Persisting the reveal across a page reload (in-memory only; the variant + representative already persist — only the cosmetic reveal is best-effort).
- Adding/altering achievement toasts for first-pull (out of scope; achievements still flow via boot backfill).
- Threading a prettier family display-name resolver (the connectome resolver `(id) => id` yields the human-readable subject name already).

## Decisions

**D1 — Keep silent mint; capture + enqueue the reveal.** `grantFirstPullIfNeeded` keeps `silent: true` (so nothing pops during the quiz and the inline achievement-toast skip is preserved), captures `result.variant`, and calls `enqueueFirstPullReveal({ variant: result.variant, isDupe: false, familyDisplayName: resolveFamilyDisplayName(familyId) })`. `forceRarity: 'P5'`, `firstPull: true`, idempotency, and `setRepresentative` are all unchanged.

**D2 — Tiny in-memory queue module** `lib/services/first-pull-reveal.ts`:
```ts
import { variantGachaEvents, type VariantRolledPayload } from './variant-gacha'
const pending: VariantRolledPayload[] = []
export function enqueueFirstPullReveal(p: VariantRolledPayload): void { pending.push(p) }
export function flushFirstPullReveals(): void {
  if (pending.length === 0) return
  const batch = pending.splice(0, pending.length)
  for (const p of batch) variantGachaEvents.emit('variantRolled', p)
}
```
Its own module (not inside `first-pull.ts`) so `first-pull.ts` imports only `enqueueFirstPullReveal` and the QuizModal imports only `flushFirstPullReveals` — and to keep the `variant-gacha` import in one spot. In-memory is sufficient: the reveal is cosmetic; a pre-close reload loses only the fanfare.

**D3 — Flush on QuizModal unmount.** Add to `QuizModal`:
```ts
useEffect(() => () => { flushFirstPullReveals() }, [])
```
Unmount fires on **every** close path (finish, ✕, backdrop, route change) — one hook covers them all. Because the grant is awaited before the answer result renders (see Context), the queue is populated by the time the modal closes. StrictMode's dev mount→unmount→remount flushes an empty queue harmlessly.

**D4 — Reuse `VariantUnlockModal` unchanged.** Flush re-emits the exact `'variantRolled'` payload shape the modal already consumes (`{ variant, isDupe, familyDisplayName }`). Multiple first-pulls in one session (e.g. an expedition spanning families) enqueue multiple payloads; the modal's internal queue shows them one-by-one on close.

## Risks / Trade-offs

- **Reload before quiz close → reveal skipped.** The variant is already collected and set as representative (persisted); only the cosmetic reveal is lost. Rare path, acceptable (Non-Goal to persist). Documented.
- **Module-singleton queue + HMR.** During dev HMR the module may reset; at most a queued-but-unflushed reveal is dropped. No prod impact.
- **Decoupling from achievements.** Re-emitting `'variantRolled'` directly does NOT run `triggerAchievementCheck` (that lives inside `pullVariant`), so first-pull achievements remain on their existing backfill path — intended (keeps scope to the visual reveal). If a future change wants the first-pull achievement toast to fire alongside, that's a separate follow-up.
