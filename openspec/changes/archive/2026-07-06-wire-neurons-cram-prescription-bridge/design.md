## Context

Direction D+C was chosen (owner + Codex, 2026-07-06) — see `openspec/decisions/2026-07-06-cram-prescription-integration.md`. The mechanical credit already exists: `recordPrescriptionAnswer` ([prescription.ts:558](../../../apps/neurons-tw/src/lib/services/prescription.ts)) runs on every answer in `QuizModal` outside the `if (!practice)` guard ([QuizModal.tsx:385](../../../apps/neurons-tw/src/components/QuizModal.tsx)), so cram-practice answers already advance today's plan. This change makes that credit **visible** (D) and adds a card→cram **exit** (C).

## Goals / Non-Goals

**Goals:**
- Make the already-firing cram→prescription credit visible at answer time (repair + breadth + completion notes).
- Give the 處方箋 card a calm exit to 考前猜題.
- Resolve the practice-mode semantic contract in favour of crediting (exception (i)).

**Non-Goals:**
- No breadth-selection bias toward cram concepts (that was rejected direction A).
- No question injection / target change / snapshot mutation (rejected direction B).
- No exam-date countdown transformation (rejected direction E).
- No new data/schema/sync surface; no `OverviewPage.tsx` change.

## Decisions

- **Practice-mode contract = exception (i): crediting stays ON, documented.** Codex-recommended and the natural implication of choosing D+C. Answering a snapshot question correctly consolidates the connection regardless of entry point; practice still grants no XP/gacha/game-streak. The alternative (exclude practice from crediting) was rejected because it makes D inert. Documented in `QuizModal` comment + the spec.
- **Return-shape extension over a new signal channel.** `recordPrescriptionAnswer` returns `{ repairConsolidated, breadthConsolidated, justCompleted }`. Existing `.repairConsolidated` callers/tests are unaffected (additive fields). `breadthConsolidated` = a breadth key newly written this call; `justCompleted` = the completion key newly written this call.
- **QuizModal surfacing mirrors the existing repair note.** Two new transient verdict notes (breadth, completion) alongside the existing 「連結已固化」, each reset in `handleNext` next to `setRepairConsolidated(false)` ([QuizModal.tsx:411](../../../apps/neurons-tw/src/components/QuizModal.tsx)). Completion note is non-punishing per the anti-anxiety contract.
- **C via `<Link to="/cram">`, not an `onOpenCram` callback.** The card is inside Router context; a `<Link>` keeps the change to the card file and avoids editing the peer-owned `OverviewPage.tsx` (study-room session) — multi-agent-safe. Placed after the CTA block, low-salience, secondary to the CTA.

## Risks / Trade-offs

- **[Practice answers can now visibly complete the daily prescription → streak/imprint from cram/mock]** → intended per exception (i) and anti-cheat-safe (only frozen-snapshot questions credit; write-once keys dedupe). Framed honestly as "you did repair that connection". Documented in spec + code.
- **[Verdict clutter if all three notes fire at once]** → they are naturally near-exclusive (a single answer rarely both consolidates repair and completes the day); completion note supersedes when shown. Kept short, reuse existing note styling.
- **[Cram link reads as another task / adds anxiety]** → low-salience styling, no badge/count/countdown, secondary to CTA, wording is an optional「考前？」offer, verified against the anti-anxiety copy contract.
