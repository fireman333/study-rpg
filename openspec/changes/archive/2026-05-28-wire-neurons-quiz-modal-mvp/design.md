## Context

neurons-tw v1 shipped (M_3rd 2026-05-25) with the engine layer complete (connectome, variant gacha, mastery, achievements, leaderboard, DMN) but **no user-facing quiz UI**. The `ConnectomeDebugPanel` (mounted on `/connectome`) provides dev-flavored click-simulation buttons (+1 答對 / +5 答對 / +1 答錯) which substitute for a real quiz during dogfood, but no exam questions are ever presented to users. The 3505-question corpus loaded from `content-neurons-tw` (via `pack.questions`) sits unused.

Both `medexam-tw` and `medexam2-hospital-tw` have full QuizModal implementations (336 / 735 lines respectively). This change copies the **structural pattern** from 一階 (the simpler one) but cuts non-essential MVP scope to ship faster:

- KEEP: question presentation, option click → reveal → record-answer, next/exit buttons
- CUT: SRS due-bias, quality modifiers, bug reports, bookmarks, batch/review mode, per-family filter UI, image-option rendering

## Goals / Non-Goals

**Goals:**

- Users can answer actual exam questions from the corpus (not just dev-panel button-clicks)
- Answer routing goes through existing `recordCorrectAnswer(subjectId)` / `recordIncorrectAnswer(subjectId)` so all downstream effects (synapse formation, variant gacha rolls, DMN behavior-axis triggers, achievement unlocks, mastery tier progression, streak counter) fire correctly without any new plumbing
- Entry point is discoverable from overview page (the natural landing route)
- Modal is keyboard / a11y friendly (Esc to close, ARIA labels)
- Mobile-responsive (single-column layout at narrow widths)

**Non-Goals:**

- **不** ship SRS due-question prioritization (engine has SrsCard / dueAt but wiring it to UI is a follow-up)
- **不** ship quality modifiers (太簡單 / 我亂猜的) — defer until dogfood shows it's needed
- **不** ship bug-report flow inline in quiz — 一階/二階 added these months in; not MVP-critical
- **不** ship bookmarks — feature exists in 二階 but not core MVP loop
- **不** ship per-family launch from connectome SVG click — modal launches from overview; per-family entry can come from SVG node clicks in a follow-up
- **不** ship review-mode / batch-mode / mock-exam flow
- **不** ship streak break-day toast / SRS quality opt-ins
- **不** ship image-option rendering (filter out `hasOptionImages === true` questions in pool)

## Decisions

### Decision 1: Single-question loop with manual 下一題, not pre-shuffled batch

**Choice**: Each render shows one question. After reveal, user clicks 「下一題」 to advance OR 「結束」 to close. No pre-shuffled batch state; just pick next random from the pool that hasn't been shown this session.

**Why**:

- Simpler state management (just `idx` into a session-local shuffle)
- Easier to exit any time without "do you want to save your progress" complexity
- Matches the natural studying rhythm — answer one, see explanation, decide if you want another

**Alternatives considered**:

- Fixed 5-question batches (one-shot 一階 style) — rejected; adds finished-state UI ceremony that's not needed for MVP
- Infinite scroll / TikTok-style — rejected; over-engineered

### Decision 2: Filter pool to text-only questions; treat disputed as auto-correct

**Choice**: At pool construction, filter out questions where `hasOptionImages === true`. Inside QuizModal: if `question.disputed === true`, treat any pick as correct (送分題 convention).

**Why**:

- `hasOptionImages` questions need image rendering infrastructure that's bigger than MVP scope
- `disputed` (送分題) is an exam authority convention — already supported in core type; trivial 3-line conditional in modal

### Decision 3: Modal state managed in OverviewPage (not lifted to App)

**Choice**: `OverviewPage` owns the `quizOpen: boolean` state. Modal renders conditionally as a child of OverviewPage. App.tsx unchanged.

**Why**:

- Keeps the change scoped — no need to thread props through Router
- Modal closes when navigating away from overview (acceptable; user can re-open from anywhere later if we add a global entry button)
- Single-source ownership matches React patterns

**Alternatives considered**:

- Global modal in App.tsx — rejected; over-engineered for one entry button; would need context / state mgmt lib
- Route-based modal at `/quiz` — rejected; deep linking has no clear UX value for a stateless quiz

### Decision 4: 4-option grid layout, not list

**Choice**: Render 4 options as a 2x2 grid (≥ 600 px viewport) or 1x4 stack (< 600 px). Each option is a button card with the option key (A/B/C/D) as a chip + text.

**Why**:

- Mobile-friendly responsive behavior
- Grid scans faster than list for 4 short options
- Pattern matches medexam-tw's existing style

### Decision 5: Reveal state shows correct + selected + explanation; no "score" display

**Choice**: After click:
- All 4 options show colored borders (selected = blue if correct, red if wrong; correct answer = green if user picked wrong)
- Explanation text appears below
- 「下一題」 button appears
- No running score / progress bar (single-question, not a batch)

**Why**:

- Score tracking implies batch / commitment, contradicts Decision 1
- Color coding for correct/wrong/selected is universal UX
- Explanation is the actual learning value — must be prominent

### Decision 6: Identity-locking requirement on `neurons-mode`

**Choice**: Add `### Requirement: neurons-tw SHALL surface a quiz UI...` to `neurons-mode` capability.

**Why**:

- Locks the contract that questions actually appear in the user-facing app (not just available in content pack)
- Future agent / refactor can't accidentally remove the quiz route / button
- Mirrors precedent set by `generate-neurons-sprites` (sprite identity lock) + `polish-neurons-connectome-empty-state` (callout identity lock)

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| User exits mid-question without saving — does `recordCorrectAnswer` fire? | Pattern: `recordCorrectAnswer` fires on REVEAL (option click), not on 下一題. Exit anytime is safe. |
| Pool exhausted (user answers all 3505 questions in session) | After last question, show 「題庫已答完」 instead of 下一題. Restart picks from beginning if reopened. |
| Random pick gives same question twice in one session | Track `answeredIds: Set<QuestionId>` in modal state; filter from random pick. |
| `hasOptionImages` filter shrinks pool noticeably (~6% per content-build stats) | Acceptable — ~3300 text-only questions still plenty for MVP. |
| 「下一題」 / 「結束」 buttons may be hard to find on small screens | Sticky bottom action bar within modal. |
| `disputed` questions confuse explanation text (since any pick is correct) | Show explanation as normal but prepend 「⚠️ 此題為送分題」 banner. |

## Migration Plan

**Deploy path**: standard `pnpm deploy:cf` + GH Actions on `main`. No env vars / Worker / D1 / Supabase change.

**Rollback**: revert `OverviewPage.tsx` (remove button) + delete `QuizModal.tsx`. Spec requirement would need follow-up revert change.

**Cross-track impact**: zero — modifications scoped to `apps/neurons-tw/`.

## Open Questions

None at design time. Layout polish, copy refinement, and edge-case handling will resolve inline during apply.
