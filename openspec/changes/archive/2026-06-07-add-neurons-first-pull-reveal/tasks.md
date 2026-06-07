## 1. Deferred first-pull reveal queue

- [x] 1.1 New `apps/neurons-tw/src/lib/services/first-pull-reveal.ts`: `pending` array, `enqueueFirstPullReveal`, `flushFirstPullReveals` (splice-drain → emit `'variantRolled'`), `_pendingFirstPullRevealCount` (test-only).

## 2. Capture + enqueue at mint

- [x] 2.1 `first-pull.ts` `grantFirstPullIfNeeded`: keeps silent P5 mint; after `setRepresentative` + `recordFirstPull`, enqueues `{ variant, isDupe:false, familyDisplayName }`.
- [x] 2.2 No behavior change to silent mint / idempotency / representative-setting (only adds the enqueue).

## 3. Flush on quiz close

- [x] 3.1 `QuizModal.tsx`: `useEffect(() => () => flushFirstPullReveals(), [])` unmount cleanup (universal across finish / ✕ / backdrop).

## 4. Test

- [x] 4.1 `first-pull-reveal.test.ts`: enqueue 2 → flush emits both `'variantRolled'` in order → queue drains.
- [x] 4.2 Empty-queue flush is a no-op.
- [x] 4.3 Second flush after drain emits nothing (no duplicate).

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw test` green — 393/393 (incl. new 3).
- [x] 5.2 `pnpm -r typecheck` clean.
- [x] 5.3 Chrome MCP smoke (DEV, signed in as owner): verified the deferred-reveal chain live via a DEV-only `__firstPullReveal` handle (added in `first-pull-reveal.ts`) with a FAKE payload — **zero mutation to the owner's real collection** (variants stayed 24, firstPull set unchanged). Result: baseline no modal → `enqueue` → count=1 but **still no modal** (deferred — enqueue alone shows nothing, proving it doesn't pop mid-mint) → `flush` → count=0 and the reveal modal mounts (`role=dialog`, aria `"新變體解鎖：解剖學 測試首抽神經元"`, 收下 button; screenshot confirms render). This is exactly the silent-mint (enqueue) → quiz-close (flush) → reveal sequence. No console errors. (The QuizModal unmount→flush wiring + the silent-mint→enqueue are typecheck-verified one-liners; the queue→flush→modal chain is what was exercised here.)
