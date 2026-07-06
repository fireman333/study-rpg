## Why

考前猜題 (cram) and 今日處方箋 (daily prescription) currently share a question corpus and the same answer path but have no visible connection. In fact the answer path already credits today's prescription for any snapshot question answered anywhere (`recordPrescriptionAnswer` runs outside the practice guard), so practising a high-frequency 考古 concept from `/cram` *already* advances the daily 修煉 — but that payoff is invisible (only the repair line shows a note; the breadth line and day-completion are silent) and there is no way to get from the prescription card to the cram resource. This wires the two features together with zero new data/sync surface (Codex-consulted direction **D + C**, recorded in `openspec/decisions/2026-07-06-cram-prescription-integration.md`).

## What Changes

- **(D) Make the existing cross-entry-point credit visible.** `recordPrescriptionAnswer` returns `breadthConsolidated` and `justCompleted` in addition to `repairConsolidated`; the quiz verdict surfaces, at the moment it happens: a repair consolidation (existing 「連結已固化」), a first breadth answer (new 「新連結已開發」-class note), and the answer that completes both lines (new non-punishing 「今日處方箋完成」note). This works from every entry point — 答題 / 錯題出征 / 模考 / **考前猜題 practice** — so exam-eve cram practice visibly advances today's 修煉.
- **Document the practice-mode exception.** `QuizModal`'s `practice` contract ("no progression") is clarified: prescription crediting is a **deliberate exception** ("answering correctly IS repairing the connection, regardless of entry point"). Practice still grants no XP / gacha / game-streak; only the prescription line (and its existing completion path) advances.
- **(C) A low-salience exit from the 處方箋 card to /cram.** `DailyPrescriptionCard` gains one low-emphasis link (「考前？看高頻考點 →」) that does not compete with the primary CTA and carries no badge / count / countdown / anxiety framing.

No new question injection, no target change, no snapshot mutation — anti-cheat and frozen-snapshot invariants are untouched (Codex: this is the safe D combo, not the rejected B). No Dexie / R2 / `SYNCED_META_KEYS` change.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-daily-prescription`: prescription progress is explicitly creditable and **surfaced** from any answer entry point (including 考前猜題 practice), with new breadth + completion verdict notes and a documented practice-mode crediting exception; the 處方箋 card adds a low-salience exit to 考前猜題.

## Impact

- **Code**: `apps/neurons-tw/src/lib/services/prescription.ts` (return shape), `apps/neurons-tw/src/components/QuizModal.tsx` (surface + contract comment), `apps/neurons-tw/src/components/DailyPrescriptionCard.tsx` (cram link). No `OverviewPage.tsx` touch (uses `<Link>`, so no peer study-room overlap).
- **Data / schema / sync**: none. Reuses existing `prescription:v1:` write-once keys; no Dexie/R2/SYNCED_META_KEYS change.
- **Tests**: extend `prescription.test.ts` for `breadthConsolidated` + `justCompleted`; existing `.repairConsolidated` assertions stay valid (additive return fields).
- **Follow-on**: this is the feature Task B (intro video + Threads) will showcase as「考前猜題練題也會推進今日處方箋」.
