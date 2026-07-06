## 1. 考前救援 tracking + status (prescription.ts)

- [x] 1.1 Add `CRAM_RESCUE_TARGET = 1`, `cramRescueKey(date, qid)` + `CRAM_RESCUE_PREFIX(date)` within the `prescription:v1:` namespace, and `recordCramRescueAnswer(qid)` (write-once per date+qid). Confirm `PRESCRIPTION_META_PREFIX` already subsumes these for account-reset wipe.
- [x] 1.2 Add `cramRescueDone: boolean` to `PrescriptionStatus`; thread it through `deriveStatus` (new param, default false) and have `getPrescriptionStatus` read the prefix count (`>= CRAM_RESCUE_TARGET`).

## 2. Credit cram practice (QuizModal + CramPage)

- [x] 2.1 Add optional `creditCramRescue?: boolean` prop to `QuizModal`; in the answer handler (next to `recordPrescriptionAnswer`) call `recordCramRescueAnswer(q.id)` when true (best-effort, own try/catch). Add to the handler's dep array.
- [x] 2.2 In `CramPage`, pass `creditCramRescue` to its practice `<QuizModal>`.

## 3. Card redesign (DailyPrescriptionCard)

- [x] 3.1 (item 1) Replace the single CTA + separate cram link with a two-button action row: left 「高頻考點」 (`<Link to="/cram">`), right 「今日處方」 (`onStartPrescription`; `dayComplete` → non-routing completed state 「今日完成 ✓」). Terse labels, no badge/count on 高頻考點.
- [x] 3.2 (item 2) On `dayComplete`, render the 考前救援 bonus tier: undone → optional invite copy; done → flavor acknowledgement (「額外養分 +1」). Read `status.cramRescueDone`. Never framed as 未完成/繼續/下一步.
- [x] 3.3 (item 3) NG-0717 reframe: drop 「（第 10 天完全體）」; hint → open-ended (「每一次完成都算數」/「沒有期限，也不會退化」); do not render 1/3/6/10 or 還差 X 天; keepsake copy → memento-not-deadline. Mechanism (stage/keepsake) unchanged.
- [x] 3.4 Integrate the dayComplete area coherently (completed line + bonus + existing 今晚收束 calm toggle); keep pre-`dayComplete` behavior a simple two-button row.

## 4. Copy constants + tests

- [x] 4.1 Add the new bonus / NG-0717 / completed literals to `calm-copy.ts` as exported constants.
- [x] 4.2 Unit test: `recordCramRescueAnswer` write-once + `getPrescriptionStatus().cramRescueDone` flips at target (fake-indexeddb); `deriveStatus` carries `cramRescueDone`.
- [x] 4.3 Copy-guard test: extend the banned-token assertion to the new literals (add 還差 / 剩下 / 繼續完成 / 下一步 / 未完成 / 第.*天完全體 to the banned set) — the new copy MUST be clean.

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw test` green + `pnpm -r typecheck` clean.
- [x] 5.2 Chrome MCP smoke: two-button row renders; NG-0717 hint has no 「第 10 天完全體」/countdown; dayComplete → 考前救援 undone invite; practice 1 cram question → bonus flips to done (「額外養分 +1」); no denominator/deficit anywhere.
- [x] 5.3 Honesty scan on card: no 還差/剩下/繼續完成/下一步/未完成/第N天完全體/%/保證/必中.
