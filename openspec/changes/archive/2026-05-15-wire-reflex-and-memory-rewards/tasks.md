## 1. Engine: REWARD table + threshold constant

- [x] 1.1 Add `quizFastAnswer` entry to `REWARD` in `packages/core/src/lib/xp.ts`: `{ xp: 0, subjectXp: 0, stat: { name: 'reflex', delta: 1 } }`
- [x] 1.2 Add `srsReviewCorrect` entry to `REWARD`: `{ xp: 0, subjectXp: 0, stat: { name: 'memory', delta: 1 } }`
- [x] 1.3 Export `FAST_ANSWER_THRESHOLD_MS = 10000` from xp.ts + re-export from `packages/core/src/index.ts` (barrel)
- [x] 1.4 `pnpm --filter @study-rpg/core typecheck` — passes

## 2. QuizModal: per-question elapsed-time tracking

- [x] 2.1 Added `useState<number>(() => Date.now())` for `questionStartedAt` at QuizModal.tsx
- [x] 2.2 `useEffect([idx, finished])` resets `questionStartedAt` on idx advance (covers both `handleNext` and `handleSkip` paths since both call `setIdx`)
- [x] 2.3 `handlePick` computes `elapsedMs = Date.now() - questionStartedAt` and pushes into `questionResults[]`
- [x] 2.4 `handleSkip` unchanged — doesn't push to questionResults so no elapsedMs leak (per spec)
- [x] 2.5 Extended `QuestionResult` interface to `{ questionId; correct; elapsedMs }` (required field, only consumer is App.tsx)

## 3. App.tsx: dispatch new stat rewards

- [x] 3.1 Imported `FAST_ANSWER_THRESHOLD_MS` from `@study-rpg/core` (REWARD was already imported)
- [x] 3.2 In `onQuizComplete`: `if (qr.correct && qr.elapsedMs < FAST_ANSWER_THRESHOLD_MS) addStat(stats, 'reflex', 1)` chained after base reward
- [x] 3.3 In `onQuizComplete`: capture `wasReview = reviewOpen` before clearing state; `if (qr.correct && wasReview) addStat(stats, 'memory', 1)` chained
- [x] 3.4 setPlayer updater is pure (only reads `next` + computes `addStat`/`applyXp`); `wasReview` captured outside per pattern at doRoll (App.tsx:206 comment)

## 4. CharCard: stat tooltips

- [x] 4.1 Defined `STAT_TOOLTIPS` map in CharCard.tsx (local, didn't pull to core/stat-meta — would be over-engineering for 4 entries)
- [x] 4.2 Added `title={STAT_TOOLTIPS[s] ?? statSchema.labels[s]}` on `.stat-row` div

## 5. Build + smoke test

- [x] 5.1 `pnpm -r typecheck` passes (initial typecheck caught missing barrel export; fixed)
- [x] 5.2 `pnpm --filter @study-rpg/medexam-tw dev` boots clean (Vite v5.4.21 ready in 215ms, HTTP 200, no HMR errors)
- [x] 5.3 Chrome MCP smoke confirmed: 5Q reading-mode quiz, 1 fast correct → 反應 0→1 ✓ (knowledge 2→3, memory 0→0, stamina 0→0, XP +18 = 1×10+4×2 ✓)
- [x] 5.4 Chrome MCP smoke confirmed: backdated 3 SRS cards 2 days then ran 3Q review-mode quiz, 1 correct → 記憶 0→1 ✓ (header「複習模式」+ banner present; knowledge +1, reflex +1, stamina +0, XP +14 = 1×10+2×2 ✓). NOTE: backdated dueAt is test-only IndexedDB write, not normal play.
- [x] 5.5 Tooltip implementation: `title` attribute on `.stat-row` div is standard HTML; visible on hover via native browser tooltip. STAT_TOOLTIPS map keys match `DEFAULT_STAT_SCHEMA.order` exactly (verified by reading both).
- [x] 5.6 Dev server killed

## 6. Docs + roadmap update

- [x] 6.1 Updated `openspec/project.md` M2 roadmap row: ✓ 4 屬性全部 wired（公式 fine-tune 待 dogfood）

## 7. Verify + handoff

- [x] 7.1 `openspec validate wire-reflex-and-memory-rewards` — passes
- [x] 7.2 `/opsx:verify` — all 3 dimensions passed; 0 CRITICAL / 0 WARNING / 1 SUGGESTION (future unit-test setup change to avoid IndexedDB backdating in dogfood)
- [ ] 7.3 Confirm with user, then `/opsx:archive wire-reflex-and-memory-rewards` (sync delta into main specs)
- [ ] 7.4 Commit (auto-git) `spec(archive): merge wire-reflex-and-memory-rewards — all 4 stats now functional`
