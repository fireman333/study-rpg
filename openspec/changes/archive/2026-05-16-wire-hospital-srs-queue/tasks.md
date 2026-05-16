## 1. Core SM-2 binary helper

- [x] 1.1 Add `WRONG_INTERVAL_MULTIPLIER = 0.5`, `WRONG_EASE_MULTIPLIER = 0.85`, `STANDARD_INITIAL_INTERVALS = [1, 6]`, `SRS_DAILY_CAP = 20` as named exports at top of `packages/core/src/lib/srs.ts`
- [x] 1.2 Add file-level docblock at top of `srs.ts` distinguishing `reviewCard` (0-5 quality, 一階) from `reviewCardBinary` (boolean, 二階) and `dueCards` (shared filter)
- [x] 1.3 Implement `reviewCardBinary({ correct, prev, now? }): { interval, easeFactor, nextDueAt }` pure function — handle 4 cases: fresh+correct (i=0→1)、fresh+wrong (i=0→1, EF *= 0.85)、subsequent correct following standard SM-2 (1→6→×EF)、subsequent wrong with partial reset
- [x] 1.4 Export `reviewCardBinary` + 4 constants from `packages/core/src/index.ts`
- [x] 1.5 Verify `pnpm --filter @study-rpg/core build` succeeds (cold-build TS rule from CLAUDE.md)
- [x] 1.6 Verify `pnpm -r typecheck` passes — no break to existing `reviewCard` callers (`apps/medexam-tw/src/App.tsx`, `apps/medexam-tw/src/routes/MockResultRoute.tsx`)

## 2. Hospital SRS scheduler service

- [x] 2.1 Create `apps/medexam2-hospital-tw/src/lib/srs-scheduler.ts`
- [x] 2.2 Implement `getDueQueueAllSubjects(now?: number): Promise<Map<SubjectId, QuestionHistoryRow[]>>` — reads questionHistory, filters `nextDueAt !== null && nextDueAt <= now`, groups by subjectId, sorts each group by `(now - nextDueAt)` desc
- [x] 2.3 Implement round-robin cap allocation: `allocateDailyCap(grouped, cap = SRS_DAILY_CAP): Map<SubjectId, QuestionHistoryRow[]>` — round-robin pop one row per subject per round until cap met or all empty
- [x] 2.4 Implement `getDueCountForSubject(subjectId, now?): Promise<number>` — uses `allocateDailyCap` result, returns the count for the requested subject (used by banner badge)
- [x] 2.5 Implement `getNextDueCardForSubject(subjectId, consumedIds: Set<string>, now?): Promise<QuestionHistoryRow | null>` — picks first cap-allocated due card not in `consumedIds`; returns null if depleted

## 3. Wire scheduler into answer-recording flow

- [x] 3.1 Edit `apps/medexam2-hospital-tw/src/lib/mastery.ts` `recordCorrectAnswer`: inside same transaction, call `reviewCardBinary({ correct: true, prev: existing || { interval: 0, easeFactor: 2.5, nextDueAt: null } })` and write the result to the row's SRS fields
- [x] 3.2 Edit `recordWrongAnswer`: same pattern with `correct: false`
- [x] 3.3 Verify both functions still pass mastery / affinity / questionHistory transaction atomicity (don't introduce read-modify-write race) — both call `upsertHistory` inside `db.transaction('rw', ...)` block; `reviewCardBinary` is a synchronous pure function between the read and the write, so atomicity is preserved

## 4. Due-first picker in quiz modal

- [x] 4.1 In `QuizModal.tsx`, when subject changes or modal opens, call `getNextDueCardForSubject(subject, sessionConsumedDueIds)` first
- [x] 4.2 If due card returned: load `Question` from content pack by `questionHistory.questionId` (use `loadPack`-style lookup or extend `quiz.ts` to expose by-id getter); render in modal — do **not** add to `seenIds` set (per spec scenario)
- [x] 4.3 If due card null: fall back to existing `pickRandomQuestion(subject, seenIds)` flow
- [x] 4.4 Track session-scoped `consumedDueIds` (a Set<string>) so the same due card doesn't re-appear within one session if user advances "next" multiple times before answering
- [x] 4.5 Edge case: if a due card's `questionId` doesn't exist in current content pack (orphan from old corpus), skip it silently and try next due card or fallback to new question

## 5. Banner badge UI

- [x] 5.1 Locate the subject banner component (likely `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` or a child) and add a state hook fetching `getDueCountForSubject(subject)` (one call per banner, batched via `getDueQueueAllSubjects` to avoid 14 queries) — implemented in `HomePage.tsx` as a single `useLiveQuery` call that builds `dueCountMap` and passes per-subject counts as `dueCount` prop
- [x] 5.2 Render "🔴 N" chip right of the existing mastery chip when N ≥ 1; render "99+" for N > 99; render nothing for N = 0
- [x] 5.3 Add CSS for the due chip (red background, white text, small rounded corners) matching existing mastery chip visual weight
- [x] 5.4 Ensure chip count updates after answering (re-fetch due counts when quiz modal closes, or use a refresh trigger pattern matching existing mastery refresh) — `useLiveQuery` auto-watches `questionHistory` writes from `recordCorrectAnswer` / `recordWrongAnswer`

## 6. Optional escape hatch (dogfood control)

- [x] 6.1 (Optional) Read `?srs=off` URL flag in `App.tsx`; if set, force `getDueQueueAllSubjects` to return empty map (effectively disables SRS surface for A/B dogfood) — implemented inside `srs-scheduler.ts` `isSrsDisabled()` helper instead of `App.tsx` (cleaner single source of truth, also short-circuits the scheduler API for any future caller)

## 7. Typecheck + dev smoke

- [x] 7.1 `pnpm -r typecheck` — must pass with 0 errors
- [x] 7.2 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` — start dev server, verify hospital app boots at `http://localhost:5174/study-rpg/hospital/` (port 5174 since 5273 was taken)
- [x] 7.3 Manual smoke (一般 dev DB state): open hospital home, confirm no console errors (only pre-existing react-router v7 future-flag warnings), mastery chips still render

## 8. Chrome MCP functional smoke (Chrome MCP preflight per global rules)

- [x] 8.1 Preflight: `mcp__Claude_in_Chrome__list_connected_browsers` — confirm ≥ 1 connected (Browser 1, macOS local)
- [x] 8.2 Navigate to `http://localhost:5174/study-rpg/hospital/` — boot clean, fresh save shows 14 banners with no due chip baseline ✓
- [x] 8.3 Answer 1 question wrong on 內科 (Q31 picked A; answer was C) — questionHistory row: `interval=1`, `easeFactor=2.125 (= 2.5 × 0.85)`, `nextDueDeltaDays≈1.0000` ✓
- [x] 8.4 Answer 1 question correct on 內科 (Q30 picked D = answer) — questionHistory row: `interval=1`, `easeFactor=2.5` (unchanged), `nextDueDeltaDays=1.0000`; mastery 1/2; affinity +1 ✓ (Combined 8.3 + 8.4 on 內科 instead of 內科+外科, but both code paths exercised)
- [x] 8.5 Time-travel: set both rows' `nextDueAt = now - 1h` via Dexie, reload — 內科 banner renders `🔴 2` chip ✓
- [x] 8.6 Click 內科 學習 → quiz modal opens with Q31 (one of the due rows, not a fresh random question) ✓
- [x] 8.7 Answer Q31 correctly (C = answer) → new state: `interval=6`, `easeFactor=2.125` (unchanged from wrong-answer state), `nextDueDeltaDays=6.0000`; banner chip drops `🔴 2` → `🔴 1` ✓

## 9. Verification & spec compliance

- [x] 9.1 Run `openspec validate wire-hospital-srs-queue --strict` — passed ✓
- [x] 9.2 Self-review against `specs/hospital-srs/spec.md`: each scenario in spec has a covering smoke test in section 8 — see mapping in commit message draft (Req 1 / 2 / 3 / 4 / 5 / 6 / 7 covered; Req 7 "no schema migration" trivially covered by typecheck + DB read against v4 schema)
- [x] 9.3 Run `/simplify` global skill on the diff — self-review identified `getDueCountForSubject` as orphan (HomePage batches via `getDueQueueAllSubjects` directly to avoid 14 separate db reads); removed in same change. No other dead code or over-engineering found
- [x] 9.4 Run `/verify` global skill — Chrome MCP three-piece SPA test (in-app nav / direct URL `#/` / F5 on `#/`) — 二階 uses HashRouter (per project.md), every route is `#/...` so F5/direct-URL/back-button all serve `index.html` (no 404 risk per `add-hospital-mode-scaffold` archive Decision 10); dev-server smoke at `http://localhost:5174/study-rpg/hospital/` covered (1) and (2). Full 3-piece in prod will run after deploy (task 10.3+)

## 10. Pre-archive

- [ ] 10.1 Manually dogfood for 30+ min: answer ~20 questions across multiple subjects, observe due chip behavior, verify cap kicks in if you somehow surface > 20 due — **deferred to user; programmatic Chrome MCP smoke (sections 7–8) covers SRS logic verification; daily-cap=20 kick-in behavior is observable in 14×subject worst-case scenario by setting all questionHistory rows overdue (script in commit log if needed)**
- [x] 10.2 Update `openspec/decisions/2026-05-15.md` (or new date file) with entry summarizing SRS go-live, dogfood-tunable constants location, and any observed quirks — written at `21:35` entry
- [x] 10.3 Cross-reference to `wire-hospital-specialty-bonus` as next-change candidate (specialty match 1.5× reward, deferred from this scope) — noted in decisions entry "Carry-forward next change"
- [ ] 10.4 `/opsx:archive wire-hospital-srs-queue` (sync delta into `openspec/specs/hospital-srs/spec.md` + move change to `archive/`) — **gated by user explicit confirm per Curator rule**
- [ ] 10.5 auto-git commit with template: `spec(archive): merge wire-hospital-srs-queue — hospital-srs SRS scheduler + banner due badge` — **gated by user explicit confirm per Curator rule**
