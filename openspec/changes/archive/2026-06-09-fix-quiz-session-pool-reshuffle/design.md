## Context

L1 hotfix. The quiz「題目亂跳」defect traced to a reactivity chain: `useQuestionHistory()` (Dexie `liveQuery`) emits a NEW array on every `db.questionHistory` write; answering writes it (`recordQuestionResult` + variant-pull history record) → OverviewPage `quizPool` useMemo re-runs → new `pool` array ref → QuizModal `sessionPool = useMemo(..., [pool])` re-runs → `shuffle()` re-randomizes → `sessionPool[idx]` points at a different question. Reproduced + then fixed-and-verified live.

## Goals / Non-Goals

**Goals:**
- The displayed question is stable for the lifetime of a quiz session; answering never reorders/replaces it.
- A NEW session still re-derives a fresh (shuffled, or preserve-ordered for review) pool from current `questionHistory`.

**Non-Goals:**
- Changing how `quizPool` is built upstream (it legitimately reflects history at open time).
- Any schema / sync / scoring change.

## Decisions

**Freeze the session pool at QuizModal mount (lazy `useState` initializer), not a `useMemo` keyed on `pool`.** A quiz session is an immutable ordered sequence; session-scoping belongs to QuizModal (it owns the session). QuizModal is conditionally mounted per session (`quizEntry`/`expeditionOpen`), so the initializer re-derives correctly for a new session while staying stable within one. Alternatives rejected: (a) memoize upstream `quizPool` harder — it must reflect history at open time, churn is inherent; (b) strip `questionHistory` from `quizPool` deps — breaks fresh/review filtering at open.

## Risks / Trade-offs

- [Pool frozen empty if QuizModal mounted before `questionHistory` liveQuery first emits] → Mitigation: not reachable in practice — the player must first see the populated FamilyPicker (which itself needs `questionHistory` for chip counts) before clicking a quiz button, so history is loaded by open-time. Verified live: review + fresh both populate.
- [Switching family without closing the modal would keep the frozen pool] → Mitigation: not reachable — the FamilyPicker sits behind the modal overlay; the only mid-session `setQuizEntry` is `onClose(undefined)`, which unmounts. Each session = mount→unmount.
