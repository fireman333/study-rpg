## REMOVED Requirements

### Requirement: Per-question reputation hook SHALL fire on quiz-runner correct-answer event

**Reason**: Replaced by the study-session-driven tick model introduced by `redesign-hospital-economy`. Reputation source SHALL be exclusively the study session tick — answering quiz questions correctly only updates `affinity.correctCount` (which gates recruitment banners) and SHALL NOT additionally write to `gameCounters.reputation`. This eliminates the dual reputation source (idle tick 70% + per-Q hook 30%) and simplifies the reputation formula to a single channel.

**Migration**:
- `apps/medexam2-hospital-tw` SHALL unregister the listener registered via `createPerQReputationListener` (typically in `main.tsx` or `App.tsx`).
- The factory function `createPerQReputationListener` in `packages/content-medexam2-tw/src/reputation.ts` SHALL be deleted along with the `PER_Q_REPUTATION_SHARE = 0.3` constant.
- The `quiz:correct-answer` event emitter in `@study-rpg/core` SHALL remain — it is consumed by 一階 (recruitment affinity) and continues to be useful as a generic quiz signal.
- No data migration is required: existing `gameCounters.reputation` values are monotonic and represent past accumulation under the old formula; future accumulation uses the new session-tick formula. There is no rollback.
- All scenarios in this requirement are obsolete and SHALL NOT be ported to any new requirement.
