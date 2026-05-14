## 1. Constants + QuizModal mode plumbing

- [x] 1.1 Add `REVIEW_BATCH_SIZE = 20` constant — placed as host-app const in `apps/medexam-tw/src/App.tsx` (or extracted near QuizModal); promote to core later if other apps need to override
- [x] 1.2 Add `mode?: 'reading' | 'review'` prop to QuizModal `Props` interface (default `'reading'`)
- [x] 1.3 Update QuizModal `useMemo` selection logic: branch on `mode`. Reading branch unchanged; review branch takes `min(filteredDue.length, REVIEW_BATCH_SIZE)` shuffled due cards only, no filler
- [x] 1.4 Update modal header label to indicate review mode (e.g., `藥理學 · 複習模式 — 第 X / N 題`) when `mode='review'`

## 2. Review-mode banner

- [x] 2.1 Add `.review-mode-banner` CSS to `apps/medexam-tw/src/styles.css` — cool palette (blue / purple) distinct from `.image-placeholder-banner` amber
- [x] 2.2 In QuizModal, render banner above stem when `mode === 'review'`, visible on every question (answering + reveal states)
- [x] 2.3 Banner copy: `🔄 複習模式 · 共 N 題（這次都是熟題、SRS 排程）`

## 3. Disable hasImage-skip in review-mode

- [x] 3.1 Update QuizModal skip-button render condition: only show `跳過此題` if `mode === 'reading' && picked === null && q.hasImage === true`
- [x] 3.2 Image-placeholder banner still appears for context in review-mode hasImage Qs (no behavior change to banner)

## 4. Main-screen due-count action

- [x] 4.1 In `apps/medexam-tw/src/App.tsx`, add a new `<button>` next to the existing `📚 開始答題` button labelled `📋 複習到期（${dueQuestionIds.length} 題）`
- [x] 4.2 Button `disabled` when `dueQuestionIds.length === 0`; hint text `目前沒有到期複習，繼續累積中`
- [x] 4.3 When N > 0, hint shows `共 ${N} 題到期 · 一次最多複習 ${REVIEW_BATCH_SIZE} 題` (if N > REVIEW_BATCH_SIZE) or `共 ${N} 題到期` (if N ≤ REVIEW_BATCH_SIZE)
- [x] 4.4 Add `reviewOpen: boolean` state alongside `quizOpen` / `bossOpen`
- [x] 4.5 Button onClick → `setReviewOpen(true)`
- [x] 4.6 Mount QuizModal with `mode='review'` when `reviewOpen` is true (separate from existing `quizOpen` reading-mode mount)
- [x] 4.7 Reuse `onQuizComplete` for review onClose handler (reward batching + SRS write are identical)

## 5. Verification

- [x] 5.1 Manual: fresh player (no SRS history), confirm `📋 複習到期（0 題）` button is disabled with hint
- [x] 5.2 Manual: answer one reading-mode quiz wrong → modal closes → after `refreshDueQueue` the due-count action shows `1` and becomes enabled
- [x] 5.3 Manual: click `📋 複習到期` → review modal opens with blue/purple banner, exactly N questions (or 20 if N > 20), no fresh questions mixed in
- [x] 5.4 Manual: in review-mode, encounter a hasImage question → confirm image-placeholder banner appears BUT skip button does NOT
- [x] 5.5 Manual: complete review session → confirm `db.srs` updated correctly (intervals extended for correct, lapses bumped for wrong)
- [x] 5.6 Manual: with > 20 due cards, complete one review → remaining due count drops by 20, button still enabled
- [x] 5.7 `pnpm -r typecheck` passes
- [x] 5.8 `openspec validate surface-srs-due-queue --strict` passes
