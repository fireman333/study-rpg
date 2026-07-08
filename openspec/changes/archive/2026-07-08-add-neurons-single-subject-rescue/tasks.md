## 1. Device-local rescue store + lifecycle

- [x] 1.1 Add a device-local rescue store (localStorage) holding plan state `{ familyId, examDate, dailyMinutes, createdAt, lastStudiedAt }`, current-day queue, stop-loss markers, stop-loss-release flags, pre-reveal confidence records, and telemetry — no Dexie/R2/SYNCED_META_KEYS touch, no version bump
- [x] 1.2 Implement lifecycle with calendar-day D semantics (`D = examDate − today`; D=0 = exam day, D=1 = day before): start (one-at-a-time gate + explicit confirm to replace an active plan), D-day countdown, **auto-archive at `examDate + 1 day`**, and abandon
- [x] 1.3 On archive/abandon, emit a signal that reverts targeted-drill absorption for that family
- [x] 1.4 Lazy-load `cram.json` on rescue start (data flow for Yield tier + kernel resolver); reuse existing `loadCram`/`useCram`

## 2. Selection algorithm (pure functions)

- [x] 2.1 `typeCoefficient(q)` seam returning `1.0`, called inside the priority computation (no UI/naming implying type intelligence)
- [x] 2.2 `Yield(q)`: map freeform `CramPushItem.tier` ordinally (`常青必掃`→high, `穩定考點`→mid, `經典但降溫`→low; unmapped/absent → corpus cross-year appearance-frequency percentile terciles → high/mid/low). Expose the numeric band values (≈1.0/0.6/0.3) as dogfood-tunable; define the `high-frequency` (stop-loss) and `mid-frequency` (triage) thresholds against these bands
- [x] 2.3 `Movability(q)` five bands — Unanswered (concept-mastery prior) / Wrong-learnable (~1.0) / Correct-unsure (~0.5) / Unrecoverable-by-behavior (~0.2, ~0.05 if low-freq) / **Already-mastered = exactly 0** (consecutive-correct ≥2 OR SRS interval≥7 & not due); confidence multiplier excluded from this function
- [x] 2.4 `Confidence(q)`: sole home of ×1.5 high-confidence-wrong (a Wrong-learnable question with pre-reveal 有把握), ×1.1 low-confidence-correct, ×1.0 otherwise; existing flags as cold-start prior only
- [x] 2.5 `EstTime(q)` (global constant acceptable for MVP; comment the `÷EstTime` no-op) and assemble `priority(q) = Yield × Movability × Confidence × typeCoefficient ÷ EstTime`
- [x] 2.6 Triage-drop rules — `Movability == 0` (drops already-mastered, the canonical zero case) and `Movability <= 0.05 AND Yield < mid` (unrecoverable low-yield)
- [x] 2.7 Stop-loss switch: high-frequency stuck → inject concept re-read card then re-test ~60–90 min; low-frequency stuck → ×0.15; device-local override flag (not synced `pinnedAt`) with visible cost, 24h/6-attempt auto-re-eval, 加練 quota isolation
- [x] 2.8 `resolveConceptRereadCard(conceptId)` — resolve a concept-scoped re-read card from the concept's `CramPushItem` (via `sourceQuestionIds`); fall back to subject-level `buildSpeedReviewCards` kernel when no concept-level card exists (mark as fallback, since that builder is family-level not concept-level)

## 3. Queue builder + scheduling

- [x] 3.1 `buildSubjectHighYieldPool(subjectId)` — join `CramPushItem.sourceQuestionIds` scoped to subject, tier-ordered, corpus-frequency fallback, flag unanswered
- [x] 3.2 `buildRescueQueue(subjectId, D, dailyMinutes)` — rank by `priority`, apply triage/stop-loss, split core quota vs 加練 override quota
- [x] 3.3 Backward-planning day mix (~20% prior-day wrong recovery / ~65% new targets blocked-to-interleaved at ≥0.75 / ~15% closing mixed-check), rolling re-plan each session
- [x] 3.4 Window-compressed spacing per D (D≥4 / D=2–3 / D=1 with exam-eve consolidation-only block on the **D=1 night** / D=0 exam morning = quick-scan only); enforce the "D=1 blitz already ran → D=0 morning runs quick-scan not a second full diagnostic" rule

## 4. RescueScore + return estimate

- [x] 4.1 `computeRescueScore(subjectId)` — runtime recency-decayed mastery over `questionHistory` (`lastResult × lastAnsweredAt`, τ≈7–14d) weighted by concept Yield; NOT from `familyMastery`
- [x] 4.2 Qualitative three-tier return label (夯 / 普通 / 低迷); no fabricated "預估追回 X 分" number

## 5. Diagnostic blitz + 戰情圖

- [x] 5.1 D-scaled blitz sampler (~25 D≥3 / ~15 D=2 / ~10 D=1, thick-history auto-shrink), frequency-weighted toward no/stale-history concepts; sparse result used as startup weighting only
- [x] 5.2 Concept red/yellow/grey 戰情圖 (red = high-frequency-weak + high-confidence-wrong)

## 6. Rescue session delivery (reuse existing answering path)

- [x] 6.1 Refactor `QuizModal` to support a **rescue submit mode**: three-stage flow `select option → confidence submit (兩鍵「確定・有把握」/「確定・猜的」) → reveal`, so confidence is captured pre-reveal. Current QuizModal is single-tap-submit with no injected submit UI — add a rescue-only submit affordance prop rather than a new scoring path
- [x] 6.2 Mount the rescue session in the existing expedition container; deliver ~8-per-block with same-concept ≤3 (interleaved), immediate per-option feedback, high-confidence-wrong extra re-schedule (per the block-delivery spec requirement)
- [x] 6.3 Rescue answers SHALL flow through `recordQuestionResult` + SRS **only** — do NOT call `recordCramRescueAnswer` / `creditCramRescue` (would write synced prescription meta, breaking the device-local invariant)
- [x] 6.4 Verify each rescue question card keeps 陽明國考考古題小組 attribution + source URL inline

## 7. Homepage entry + card 變身 (neurons-homepage delta)

- [x] 7.1 FamilyPicker header-level always-on "考前救急" entry → rescue setup (family + exam date + daily minutes), independent of the `pressure>=0.45` targeted-drill gate
- [x] 7.2 Active-rescue family card renders rescue chip (D-N · RescueScore · 今日佇列 CTA) in place of WeaknessIndicator; other cards unchanged; revert on archive/abandon
- [x] 7.3 Copy line "救急計畫與信心紀錄存於本裝置" surfaced on the active-rescue affordance (implementation of the device-local invariant)

## 8. Targeted-drill absorption (neurons-weakness-radar delta)

- [x] 8.1 During an active rescue plan, route the target family's one-tap targeted drill into that day's rescue queue (no parallel generic drill); other families unchanged; revert on archive/abandon

## 9. Telemetry (thin — device-local, scope-fenced)

- [x] 9.1 Device-local flat append-only JSON log + one-click export (NO in-app chart/dashboard) with min event set (diagnostic-answered / confidence-tap / priority-selected / stop-loss-demoted / manual-override / quick-scan-opened|completed) + per-band next-day accuracy change + per-question seconds; manual-override excluded from any success metric

## 10. Tests

- [x] 10.1 Vitest: `typeCoefficient` contract test (asserts it is called inside priority)
- [x] 10.2 Vitest: Movability band coverage (Unanswered / mastered-without-flag → 0 / unrecoverable-by-behavior), triage-drop (mastered dropped via `==0`), and stop-loss intervention switch + concept re-read resolver fallback
- [x] 10.3 Vitest: priority ordering property + Yield tier mapping + corpus fallback + Confidence ×1.5 single-source (no double-count)
- [x] 10.4 Vitest: lifecycle (calendar-day D, one-at-a-time gate, auto-archive at examDate+1 reverts absorption, abandon)
- [x] 10.5 Chrome MCP end-to-end: enter rescue → D-scaled blitz two-button pre-reveal submit → daily queue → stop-loss → override → D=0 exam-morning quick-scan (no double diagnostic) → post-exam auto-archive + card/drill revert; confirm zero schema bump, device-local-only writes, and no cram-rescue/prescription meta written
  - Verified via preview (dev server): setup → 25-Q D-3 blitz → two-button pre-reveal submit (confidence 'sure' captured device-local pre-reveal) → questionHistory+SRS written but NO prescription/cram-rescue meta + no Dexie schema bump (§6.3) → overview (RescueScore + 戰情圖 with hi-conf-wrong red ‼) → 18-Q daily queue session → header entry (§7.1) + card 變身 chip (§7.2) + weakness-row/特訓 absorption (§8.1) → D=0 exam-morning quick-scan (~15 min, no second diagnostic) → abandon → card + 特訓 revert. Stop-loss switch + override bounds covered by unit tests (rescue-engine/rescue-session); live in-browser trigger needs a seeded ≥6-attempt history.

## 11. Exam-morning quick-scan preset (pressure-release valve — cut first if over budget)

- [x] 11.1 D=0 exam-morning quick-scan preset: filter to prior-day-corrected high-confidence-wrong + high-frequency kernel cards, ~15 min, reusing speed-review + quiz delivery (no new answering path)

## 12. Verify + docs

- [x] 12.1 Run `/verify` (typecheck + tests + Chrome MCP smoke); confirm no Dexie/R2 schema bump introduced and no synced prescription meta written by rescue answers
  - Manual equivalent done: `pnpm -r typecheck` 0 errors, 1040 neurons tests green (incl. 75 rescue), preview e2e verified device-local-only writes (localStorage `neurons:rescue:v1`) + questionHistory+SRS written but NO prescription/cram meta + Dexie version unchanged. Codex UI/UX review folded in (戰情圖 三段式 + 降壓措辭 + RWD/a11y).
- [x] 12.2 Update `docs/NEURONS_FEATURE_NOTES.md` pointer + `openspec/project.md` roadmap row for the new capability
