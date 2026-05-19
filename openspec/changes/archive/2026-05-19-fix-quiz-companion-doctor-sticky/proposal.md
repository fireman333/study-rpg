## Why

Player reports that the quiz companion doctor (`boundDoctor` in `QuizModal`) automatically switches to the newly recruited doctor every time a new doctor is added to the roster. The player's mental model is "I picked Dr. A as my study partner — keep them as my partner unless I change my mind." Today the spec at `hospital-quiz/spec.md:99` instead mandates "default to most recently obtained roster doctor at modal open time" and `QuizModal` honours that literally because `boundDoctorId` is component-local React state that resets on every mount, so the useEffect fallback fires on every open and resolves to whichever doctor has the largest `obtainedAt`. The behaviour is technically as-specced but contradicts the recruit-and-build-roster gameplay loop — recruiting should expand the roster, not silently displace the active companion.

## What Changes

- Revise the default-companion rule so the player's last explicit selection sticks across `QuizModal` opens; the "most recently obtained" rule becomes a fallback used only when no prior selection exists (fresh player, first-ever quiz) or when the persisted doctor is no longer in the roster (retired / cleared).
- Add per-device persistence of the chosen companion-doctor ID in the existing local-only `meta` Dexie table (key `quiz.companionDoctorId`). No new table, no Dexie schema bump.
- Add a small `services/quiz-companion.ts` getter/setter helper mirroring the existing `services/er-consultation.ts` settings pattern.
- Update `QuizModal.tsx` to read the persisted ID on mount (with roster-existence validation) and write the persisted ID whenever the player changes the in-modal doctor picker.

## Capabilities

### New Capabilities

(none — reusing existing meta table + existing capability spec)

### Modified Capabilities

- `hospital-quiz`: requirement "default `boundDoctor` to the most recently obtained roster doctor at modal open time" and its companion scenario are revised to describe sticky selection with most-recently-obtained as the fallback path.

## Impact

- **Code**:
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` — mount-time resolution + dropdown-change persistence (~15 line diff).
  - `apps/medexam2-hospital-tw/src/services/quiz-companion.ts` — NEW small helper (~30 lines).
- **Specs**: `openspec/specs/hospital-quiz/spec.md` — revised requirement wording + replaced scenario.
- **DB**: zero schema migrations (reuses existing `meta` table at v5+). Existing saves get fallback behaviour on first open after upgrade, which matches today's behaviour exactly (newest doctor) — no regression for in-flight players.
- **Cloud sync**: zero — `meta` is local-only by design. Cross-device companion-preference sync is intentionally out of scope; a per-device UI partner choice is the right granularity, and it matches how `meta` already stores migration choice + ER-consult settings.
- **Backwards compatibility**: fully additive. The meta row only exists after the player first opens the picker or recruits a doctor; absent row → same code path as today.
