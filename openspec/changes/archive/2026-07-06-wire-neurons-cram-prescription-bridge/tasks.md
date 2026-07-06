## 1. Prescription service — extend return shape (D)

- [x] 1.1 Change `recordPrescriptionAnswer` return type to `{ repairConsolidated: boolean; breadthConsolidated: boolean; justCompleted: boolean }` (and the early no-plan return)
- [x] 1.2 Set `breadthConsolidated = true` when the breadth key is newly written (the `if (!metaExists(breadthKey))` branch)
- [x] 1.3 Set `justCompleted = true` when the `completedKey` is newly written this call (inside the existing completion block)
- [x] 1.4 Return all three flags

## 2. QuizModal — surface the credits + document the exception (D)

- [x] 2.1 Add `breadthConsolidated` + `dayJustCompleted` states mirroring `repairConsolidated`; set them from the `recordPrescriptionAnswer` result at ~:385
- [x] 2.2 Reset both new states in `handleNext` next to `setRepairConsolidated(false)` (~:411)
- [x] 2.3 Render a 「🔍 新連結已開發」note (breadthConsolidated) and a non-punishing 「🎉 今日處方箋完成」note (dayJustCompleted) beside the existing 「連結已固化」note (~:729); add their styles
- [x] 2.4 Update the `practice` prop contract comment (~:69) + the repairConsolidated comment (~:256) to document prescription crediting as a deliberate exception to practice-inert

## 3. DailyPrescriptionCard — low-salience cram exit (C)

- [x] 3.1 Import `{ Link }` from `react-router-dom`
- [x] 3.2 Add a single low-emphasis `<Link to="/cram">考前？看高頻考點 →</Link>` after the CTA block, before the mascot row; add `cramLinkStyle` (small, muted, secondary — no badge/count/countdown)

## 4. Tests

- [x] 4.1 Extend `prescription.test.ts`: `breadthConsolidated` true on first breadth answer, false on replay; wrong-family breadth answer does not set it
- [x] 4.2 `justCompleted` true only on the answer that completes both lines (first time), false thereafter (idempotent)
- [x] 4.3 Existing `.repairConsolidated` assertions still pass (additive fields)

## 5. Verify

- [x] 5.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` — prior baseline + new cases green
- [x] 5.3 Chrome MCP: homepage 處方箋 card shows the low-salience /cram link (secondary to CTA); clicking it lands on /cram
- [x] 5.4 Credit-visible-from-cram-practice: verified via unit tests (repairConsolidated/breadthConsolidated/justCompleted trigger flags) + code-verified unguarded path (QuizModal:385 calls recordPrescriptionAnswer regardless of `practice`; verdict block renders the notes). Live screenshot deferred (needs a seeded today-plan overlapping a cram sourceQuestionId).
- [x] 5.5 `/verify` dead-code audit — no orphans
