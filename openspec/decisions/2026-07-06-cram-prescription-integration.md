# Decision — 今日處方箋 × 考前猜題 整合設計（deferred to a future change）

**Date**: 2026-07-06 · **Status**: DECIDED direction, NOT YET implemented. Owner chose "D+C, integration as a separate follow-up change" (the UI-polish change `refine-neurons-cram-tab-ux` deliberately does NOT touch this). Consulted Codex (gpt-5.5) on 2026-07-06.

## Chosen direction: D + C

- **(D) — cram/practice answers already credit today's 處方箋 for snapshot-overlapping questions. Formalize it.**
  Mechanism already exists in prod: [`QuizModal.tsx:384`](../../apps/neurons-tw/src/components/QuizModal.tsx:384) calls `recordPrescriptionAnswer(q.id, q.subject, isCorrect)` on EVERY answer, OUTSIDE the `if (!practice)` guard (the comment at :381–383 calls it "the single shared answer-resolution point"). So when a user 練幾題 from `/cram` and a question is in today's frozen prescription snapshot (`wrongEligibleQuestionIds` / `breadthEligibleQuestionIds`), it already advances the 修煉 line — best-effort, no-op when no plan exists. Codex rated this **P1 夯**: no injection, no re-roll, no target change, write-once keys self-dedupe → anti-cheat + frozen-snapshot invariants intact.
  - *Follow-up work*: surface the payoff (e.g. a "✓ 此題也完成了今日修煉" post-answer note when a cram-practice answer credits a prescription line), so the credit is discoverable instead of invisible.
- **(C) — 處方箋 card offers a gentle exit to `/cram`.** A low-emphasis "考前？看高頻考點 →" deep-link on `DailyPrescriptionCard` (homepage). Codex **P2 頂級**: low coupling, low anxiety, does NOT turn 考頻 into a daily obligation.

## Rejected / deferred

- **(A) bias the 開發新連結 breadth line toward cram high-frequency concepts** — Codex **P3**, and a **betrayal of "盲點開發" intent if made the default** (personal blind-spot ≠ population exam-frequency). Only acceptable as a near-exam, explicit **opt-in** variant relabeled 「考前高頻盲區」. Not chosen now.
- **(B) "加入今日處方箋" injects arbitrary cram questions into today's plan** — Codex **P5 拉完了**: breaks daily frozen snapshot + calibrated targets + write-once anti-cheat. Rejected.
- **(E) 考前衝刺模式 + exam-date countdown** — Codex **P4 NPC**: scope creep + countdown introduces pressure language, betrays the "兩件小事" anxiety-reducing ethos. Rejected.

## Open contract question for the follow-up change (owner to confirm at that time)

**practice-mode semantic leak**: [`QuizModal.tsx:69`](../../apps/neurons-tw/src/components/QuizModal.tsx:69) documents `practice` as "SHALL NOT push progression/streak/connectome", yet the shared answer path still lets a practice answer complete the prescription → write `completed:<date>` → bump streak → drive the (synced) NG-0717 imprint. Codex confirms this is NOT an anti-cheat problem (only credits questions already in today's snapshot) but a **product-semantics / contract mismatch**. The follow-up change must either (i) document prescription crediting as a deliberate exception to the practice-inert contract (recommended — "answering correctly IS repairing the connection, regardless of entry point"), or (ii) exclude practice-mode answers from prescription crediting (which would make (D) inert). Owner decides then.

## Reference anchors

- `apps/neurons-tw/src/lib/services/prescription.ts:553` — `recordPrescriptionAnswer` only credits today's frozen `wrong/breadthEligibleQuestionIds`; write-once meta keys in `prescription:v1:` namespace dedupe.
- `apps/neurons-tw/src/lib/services/prescription.ts:455` — `getOrCreateTodayPlan` freezes the daily snapshot.
- `apps/neurons-tw/src/components/DailyPrescriptionCard.tsx` — homepage card (C entry point).
- `apps/neurons-tw/src/routes/CramPage.tsx:170` — the section practice CTA that opens `QuizModal practice`.
