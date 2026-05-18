## Why

2026-05-18 parallel dogfood (α/β/γ sessions on 二階 hospital mode, port 5180–5182) ran 30 scenarios across 3 capability clusters and surfaced 4 P3/P4 code bugs + 2 design calls requiring tightening. All P1/P2 critical paths passed. Bundling the 6 follow-ups into one change keeps spec sync small and avoids merge friction with concurrent track-m2 branches (image extraction, bug-report pipeline). Both design calls (D1 / D2) already have user-confirmed resolutions — no spec ambiguity remains.

## What Changes

- **Fix α-1 (P3, data integrity)** — Propagate the `actualRepDelta` pattern (commit `1fae8f4`, already merged for player-action + toast branches) into the **medical-malpractice 24h auto-resolve branch** of `apps/medexam2-hospital-tw/src/lib/tick.ts`. Compute `prevRep → newReputation → actualRepDelta = newReputation - prevRep` and log `actualRepDelta` to `eventLog.reputationDelta` instead of the intent constant `-MALPRACTICE_PENALTY_REP`. Existing spec scenario already mandates this (hospital-events line 104-110); add 1 ADDED scenario to lock in the partial-floor case (rep=1500 → -1500).
- **Fix α-2 (P4, UX clarity)** — In `apps/medexam2-hospital-tw/src/components/EventModal.tsx:242`, surface effective deduction on the malpractice 「接受懲處」 button. When `counters.reputation < MALPRACTICE_PENALTY_REP`, append a 「將至 0」 parenthetical so the player sees the realized impact before clicking.
- **Fix α-3 (P4, dead code cleanup)** — In `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx:118`, drop the dead `tier === 'legendary' ? 'common' : tier` branch in the pity lookup. The guard at line 139 already excludes legendary from rendering the pity row; narrow the lookup key type to `'common' | 'rare' | 'epic'`. Pure code cleanup, behavior preserved.
- **Fix γ-1 (P4, UX clarity)** — In `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx:112`, trim the paused banner copy from 「⏸️ 已暫停（離開分頁，回來會自動繼續）」 to 「⏸️ 已暫停」. The footer hint already differentiates auto-resume vs manual cases (line 144-146); the banner clause incorrectly implies auto-resume for manual pauses too.
- **Fix D1 (design call, gender preservation)** — In `apps/medexam2-hospital-tw/src/services/training.ts:57`, preserve the `-female` spriteKey suffix across successful training. If the doctor's current `spriteKey` ends with `-female`, the new spriteKey SHALL also end with `-female`; otherwise use the base form. β confirmed all 70 female sprite keys exist in `theme-pixel-hospital` SPRITES_MAP. Out of scope: `starter-pull.ts` (deterministic male starter doctors per β finding — different semantics).
- **Fix D2 (design call, grace exploit close)** — In `apps/medexam2-hospital-tw/src/lib/tick.ts:147-167`, narrow the 24h retirement grace at the tier-upgrade `requireP1` gate. Diversification count keeps grace (current behavior preserved). `requireP1` check SHALL only count live (non-retired) doctors — no grace. Closes the cash-out-and-still-upgrade exploit (retire only P1 → +5000 refund → still meet requireP1 for 醫學中心→國家級 within 24h).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `hospital-events`: ADD 2 scenarios — (a) auto-resolve actual-delta with partial floor (Fix α-1 conformance), (b) malpractice button label reflects effective deduction (Fix α-2).
- `hospital-study-session`: ADD 1 scenario — paused banner copy SHALL NOT claim auto-resume (Fix γ-1).
- `doctor-training`: ADD 1 scenario — successful training SHALL preserve `-female` spriteKey suffix (Fix D1).
- `hospital-finances`: EXTEND the 24-hour grace requirement clause + ADD 1 scenario — `requireP1` at tier-upgrade gate SHALL only count live doctors, ignoring retirementLog grace credit (Fix D2).

## Impact

- **Affected code** (~25-30 LOC across 5 files):
  - `apps/medexam2-hospital-tw/src/lib/tick.ts` (~16 LOC — Fix α-1 + Fix D2 in different branches of same file)
  - `apps/medexam2-hospital-tw/src/components/EventModal.tsx` (~3 LOC — Fix α-2)
  - `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx` (~2 LOC — Fix α-3)
  - `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx` (~1 LOC — Fix γ-1, banner copy trim)
  - `apps/medexam2-hospital-tw/src/services/training.ts` (~1 LOC — Fix D1)
- **Affected specs** (4 delta files): `hospital-events`, `hospital-study-session`, `doctor-training`, `hospital-finances`.
- **No schema change** — all fixes are runtime / UI logic on existing flows. `eventLog` / `retirementLog` table shapes unchanged.
- **No DB migration** — legacy `eventLog` rows written before this fix retain the old intent values; not retro-fixed (acceptable noise per `2026-05-18-fix-toast-event-rep-floor` precedent).
- **No cloud sync impact** — `gameCounters.reputation` already syncs the floor-clamped value correctly; only `eventLog` rows benefit from accuracy.
- **No content / theme pack change** — all 6 fixes live in the 二階 app shell or its services layer; `content-medexam2-tw` and `theme-pixel-hospital` untouched.
- **Out of scope** (deferred):
  - `starter-pull.ts:44` (deterministic male starter doctors; design intent confirmed by β as different from training-rebirth semantics).
  - C1 dev-panel `練習答對 (mock)` removal (pre-public-launch cleanup, separate change).
  - Tutorial reset / navigate-away semi-active state (γ §C4/C5 — documented behavior, low priority).
- **Worktree isolation**: change developed on `fix-dogfood-2026-05-18-findings` branch off `track-m2` in `~/coding-scratch/study-rpg-m2-fixes/`. Smoke testing on dev port 5186 to avoid collision with concurrent dogfood (5180-82), bug-report (5183-84), and image-extraction (5185) sessions. **Will NOT merge to track-m2 / main** — user owns merge.
