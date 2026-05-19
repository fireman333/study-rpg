## 1. Bug 1 — Remove fate card tier gate

- [x] 1.1 Edit `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx`:
  - Remove `const FATE_TIER_UNLOCKED = new Set([...])` at line 35
  - Remove `const tierUnlocked = FATE_TIER_UNLOCKED.has(counters.tier)` at line 94
  - Remove `{!tierUnlocked && (...)}` locked banner block at lines 166-173
  - Change button `disabled={!tierUnlocked || insufficient || drawing}` → `disabled={insufficient || drawing}`
  - Change button label `{drawing ? '抽卡中…' : tierUnlocked ? '抽一張' : '🔒 鎖定中'}` → `{drawing ? '抽卡中…' : '抽一張'}`
  - Update header docstring (lines 1-11): drop "Tier gate" sentence

- [x] 1.2 Edit `apps/medexam2-hospital-tw/src/lib/useMilestoneTips.ts`:
  - Remove the `tier_unlocked_fate_cards` block (lines 92-93 + the docstring entry at line 12)
  - Keep all other milestone tips untouched

## 2. Bug 2 — ER consult dialog lifecycle fixes

- [x] 2.1 Edit `apps/medexam2-hospital-tw/src/components/ERConsultDialog.tsx`:
  - Change useEffect at lines 49-51:
    ```ts
    // before:
    useEffect(() => {
      if (dbActive) setSticky(dbActive)
    }, [dbActive])

    // after:
    useEffect(() => {
      if (dbActive && sticky === null) setSticky(dbActive)
    }, [dbActive, sticky])
    ```
  - Remove `setTimeout(onClose, 2000)` at line 129; keep `setToast(...)` for the reward delta toast (toast stays until user clicks 關閉)
  - Update the inline comment at lines 45-48 to explain the new "don't replace sticky while showing" invariant

## 3. Spec deltas

- [x] 3.1 Write `openspec/changes/fix-quiz-ux-batch-2026-05-19/specs/hospital-fate-cards/spec.md`:
  - REMOVE requirement "Fate cards SHALL be unlocked at 醫學中心 tier" (with both scenarios)

- [x] 3.2 Write `openspec/changes/fix-quiz-ux-batch-2026-05-19/specs/er-consultation/spec.md`:
  - MODIFY requirement "ERConsultDialog UI SHALL show ER doctor sprite + consult-tone dialogue + embedded question":
    - Change correct-answer behavior: "auto-close after 2 seconds" → "user clicks 關閉 to dismiss (toast shows reward delta until close)"
    - Replace scenario "Correct answer dialog auto-closes after 2 seconds" with new scenario "Correct answer dialog stays open until user clicks 關閉"
  - ADD requirement "Dialog SHALL hold sticky question until user closes" with scenario about Q1-still-on-screen-when-Q2-arrives

## 4. Verify

- [x] 4.1 `pnpm -r typecheck` clean
- [x] 4.2 `openspec validate fix-quiz-ux-batch-2026-05-19` passes
- [x] 4.3 Dev smoke (Chrome MCP if connected):
  - Bug 1: with tier === 區域醫院 (or any tier ≠ 醫學中心), navigate to `/fate-cards` → 抽一張 button is **enabled** when reputation sufficient
  - Bug 2 (a): in dev, fire ER consult → answer correctly → dialog stays open with 關閉 button + toast + explanation; click 關閉 → dialog unmounts
  - Bug 2 (b): if a second consult fires while first is still open (verify via tick speed or manual `gameCounters.put` in console), the first remains visible until user clicks 關閉; on close, second appears

## 5. Pause for user

- [x] 5.1 Show `git diff` summary to user; await explicit confirm before `git commit` (per CLAUDE.md curator rule + multi-agent git safety — explicit `git add path/to/file`)
