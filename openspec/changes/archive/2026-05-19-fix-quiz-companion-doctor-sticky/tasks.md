## 1. Helper service

- [x] 1.1 Create `apps/medexam2-hospital-tw/src/services/quiz-companion.ts` with `META_KEY = 'quiz.companionDoctorId'`, `getQuizCompanionDoctorId(): Promise<string | null>`, and `setQuizCompanionDoctorId(id: string): Promise<void>` mirroring the `services/er-consultation.ts:74-97` pattern (uses `db.meta`, defensive type guard on the unknown value).

## 2. QuizModal wiring

- [x] 2.1 In `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` add a second `useLiveQuery` reading `db.meta.get('quiz.companionDoctorId')` and extracting the string value.
- [x] 2.2 Replace the existing useEffect at `QuizModal.tsx:57-61` with a resolver that fires only after both `doctors` and the persisted meta query have completed at least one load: prefer persisted ID when it matches a current `doctor.id`, otherwise pick `doctors[0]` (newest) and persist that ID via `setQuizCompanionDoctorId`.
- [x] 2.3 Add a persist call inside the existing `<select onChange>` handler at `QuizModal.tsx:271` so picker changes write the new ID to `meta` (fire-and-forget `void setQuizCompanionDoctorId(...)`).
- [x] 2.4 When persisted ID exists but resolves to undefined doctor (retired / cleared), overwrite the meta row with the fallback newest doctor's ID so subsequent opens stay consistent.

## 3. Verification

- [x] 3.1 Run `pnpm -r typecheck` from repo root; expect zero new errors.
- [x] 3.2 Dev-server smoke (Chrome MCP preflight first):
  - Open the 二階 app, recruit at least one doctor, open `QuizModal`, switch the picker to a non-newest doctor, close modal, recruit a brand-new doctor, reopen `QuizModal` — partner strip MUST still show the previously chosen doctor. **Result: partner stayed as `T42` after page reload + injected newest `SmokeTestNewest` doctor; meta = `t4-1`.**
  - Open with no prior selection (DevTools: `await indexedDB.deleteDatabase('study-rpg-medexam2-hospital-tw')` or manually delete the meta key) — partner strip MUST default to newest AND the meta key MUST be written (verify in DevTools → IndexedDB → meta store). **Result: with meta=null + 50 doctors, first open picked `OrphanDoc` (newest) and wrote `meta['quiz.companionDoctorId'] = 'orphan-doc'`.**
  - Retire (or delete via DevTools) the currently-persisted doctor, reopen modal — partner strip MUST silently fall back to newest remaining doctor AND the meta key MUST be overwritten to that new ID. **Result: after deleting persisted `t4-1`, reopen fell back to `SmokeTestNewest` and meta was rewritten to that ID.**
- [x] 3.3 Run `/verify` per project policy (Chromium MCP end-to-end check + `/simplify` audit). **Result: `/simplify` flagged inline `meta` row coercion duplication in `QuizModal.tsx`; refactored `persistedCompanionIdLive` to delegate to `getQuizCompanionDoctorId()`. Post-refactor typecheck + Chrome smoke green.**

## 4. Validation

- [x] 4.1 `openspec validate fix-quiz-companion-doctor-sticky --strict` returns clean.
- [x] 4.2 Run `/opsx:verify` to re-confirm completeness / correctness / coherence before archive. **Result: 0 CRITICAL / 0 WARNING / 0 SUGGESTION. All 6 spec scenarios live-tested in Chrome MCP. Ready for archive.**
