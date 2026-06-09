## 1. Fix

- [x] 1.1 QuizModal `sessionPool`: `useMemo(() => …, [pool, preserveOrder])` → frozen lazy `useState<Question[]>(() => preserveOrder ? filtered : shuffle(filtered))` (compute once at mount; comment the reactivity-chain root cause). `apps/neurons-tw/src/components/QuizModal.tsx`

## 2. Verify

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw exec tsc --noEmit` clean
- [x] 2.2 `pnpm --filter @study-rpg/neurons-tw test` → 517 pass (no regression; quiz-pool / srs-quiz-modes logic untouched)
- [x] 2.3 Chrome MCP live behavioral verify: open 解剖學 新題 → answer Q1 (correct + variant pull = the pre-fix reshuffle trigger) → question stays Q1/682 (no jump) → 下一題 → clean Q2/682
