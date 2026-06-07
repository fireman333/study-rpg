## Why

neurons-tw has exactly one expedition today: **全科錯題** (`buildWrongQuestionPool` — every question whose `questionHistory.lastResult === 'wrong'`, surfaced by the homepage 出征 button per `neurons-study-squad`). There is no way to systematically work through **a specific exam year + 次別 (第一次/第二次), all questions in order** — the `/bank` 題庫 page can *filter* by year + 次別 but is read-only (no quiz/expedition, no reward). Players preparing for a real sitting want to grind a whole past paper end-to-end and have it count toward the same progression loop.

Owner decisions are locked (grill 2026-06-07): **分次累計答完** (resumable, accumulate across sessions), **並列兩種遠征** (co-equal with 錯題遠征), **同制 DMN 抽卡** reward, entry via a **首頁遠征選單** (出征 → pick 錯題 / 年份回數).

## What Changes

- **New 年份+次別 full-set expedition**: pick a year + 次別, drill **all that paper's questions in question order**, resumable across sessions. The per-session pool = that (year, session)'s questions **not yet answered** (no `questionHistory` row), sorted by question order; when none remain, the paper is **complete**.
- **Progress is fully DERIVED from the existing `questionHistory` table** — a (year, session) question counts as "done" once it has any history row (answered in any mode). Coverage = answered / total for that paper; complete = all answered. **No new Dexie table, no `.version()` bump, no R2 bundle change, no Worker change, no upgrade fixture.**
- **Reward reuses the existing chain**: on quiz close, `onExpeditionComplete({total, correct})` → `creditExpeditionDraws(total, correct)` — identical 25%/50% milestone clamp + the shared expedition-axis daily cap (2/day, shared with 錯題遠征 — one "expedition axis"). No new reward code.
- **Homepage 遠征選單**: the single 出征 button becomes a small chooser — **錯題遠征** (existing, unchanged) and **年份回數遠征** (new → opens a year + 次別 picker → launches the drill). Both expeditions are co-equal and parallel.
- **Anti-cheese preserved**: the per-session pool excludes already-answered questions, so a paper's pool monotonically shrinks (no re-answer farming), and the 2/day expedition-axis cap bounds draws — same guards as 錯題遠征.

## Capabilities

### New Capabilities
- `neurons-exam-set-expedition`: the year + 次別 full-question-set expedition — picker, resumable per-session pool (filter year+session, exclude answered, sort by question order), coverage/completion derived from `questionHistory`, and DMN-draw reward via the shared expedition chain.

### Modified Capabilities
- `neurons-study-squad`: the homepage 出征 entry becomes a **遠征選單** offering two co-equal expeditions (錯題遠征 + 年份回數遠征). The existing all-subject wrong-question expedition behavior and its DMN-draw completion reward are unchanged; only the entry point gains a sibling.

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/services/expedition.ts` (or `quiz-pool.ts`) — new pure `buildExamSetExpeditionPool(pool, history, year, session)` + a coverage helper `examSetCoverage(pool, history, year, session) → {answered, total}` for the picker.
  - `apps/neurons-tw/src/routes/OverviewPage.tsx` — 出征 button → 遠征選單; new year+次別 picker modal; launch QuizModal with the exam-set pool, `preserveOrder`, `onComplete={onExpeditionComplete}`.
  - Small picker component (reuse the year/session chip pattern from `QuestionBankPage.tsx`).
- **Derives from** `q.meta.year` + `q.meta.session` (numbers; `sessionLabel(1)='第一次'`, `2='第二次'`) and the existing `questionHistory` table — **zero schema/sync surface**.
- **Reuses** `onExpeditionComplete` / `creditExpeditionDraws` / `DMN_EXPEDITION_MILESTONES` unchanged.
- **Scope**: `apps/neurons-tw` only.
- **Apply-time checks (open uncertainties)**: (1) confirm `q.meta.session` is actually populated in the neurons content pack (if 次別 is absent, the picker degrades to year-only); (2) confirm the question-order sort key (parse trailing `-Q(\d+)` vs trust pool order); (3) confirm each (year, session) set size (~100) for sane milestone clamps.
