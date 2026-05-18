## 1. Fix α-1 — Malpractice auto-resolve actual-delta

- [x] 1.1 Edit `apps/medexam2-hospital-tw/src/lib/tick.ts:194-202`: compute `prevRep`, `newReputation = Math.max(0, prevRep - MALPRACTICE_PENALTY_REP)`, `actualRepDelta = newReputation - prevRep`; write `actualRepDelta` to `eventLog.reputationDelta` (replace intent constant `-MALPRACTICE_PENALTY_REP`)
- [x] 1.2 Mirror the variable-naming pattern from the toast-event branch (tick.ts:225-243) and the player-action branch (services/event.ts:85-105) for cross-branch consistency
- [x] 1.3 Verify `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` zero errors

## 2. Fix α-2 — EventModal malpractice button label

- [x] 2.1 Edit `apps/medexam2-hospital-tw/src/components/EventModal.tsx:242`: conditionally append `「（將至 0）」` to the 接受懲處 button label when `counters.reputation < MALPRACTICE_PENALTY_REP`
- [x] 2.2 Preserve the existing button label format `「接受懲處（−{penalty} 聲望[（將至 0）]）」` so the player still sees the intent constant
- [x] 2.3 Verify the label fits within the existing modal footer flex layout (no horizontal overflow at 768px breakpoint)

## 3. Fix α-3 — FateCardPage dead code cleanup

- [x] 3.1 Edit `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx:118`: change `mono?.fateCardBadLuckPity[tier === 'legendary' ? 'common' : tier] ?? 0` to a non-legendary-narrowed lookup (e.g., `tier === 'legendary' ? 0 : (mono?.fateCardBadLuckPity[tier] ?? 0)`)
- [x] 3.2 Confirm the existing guard at line 139 (`tier !== 'legendary'`) still gates the pity row display
- [x] 3.3 Verify no TypeScript errors after narrowing

## 4. Fix γ-1 — Paused banner copy

- [x] 4.1 Edit `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx:112`: change `'⏸️ 已暫停（離開分頁，回來會自動繼續）'` to the reason-agnostic short label `'⏸️ 已暫停'`
- [x] 4.2 Confirm the footer hint at lines 143-147 (still gated by `state === 'paused'`) continues to render and explains both visibility-return auto-resume and manual-pause click-to-resume cases
- [x] 4.3 No spec or controller API changes (per design D3 — sidesteps exposing `lastPauseReason`)

## 5. Fix D1 — Training preserves female sprite

- [x] 5.1 Edit `apps/medexam2-hospital-tw/src/services/training.ts:57`: use `doctor.spriteKey.endsWith('-female')` to conditionally append `-female` to the new spriteKey
- [x] 5.2 Verify `packages/theme-pixel-hospital/sprites/index.ts` exports all 70 female sprite keys (`14 subjects × 5 rarities`) — `grep -c "doctor-.*-female" packages/theme-pixel-hospital/src/sprites/manifest.ts` or equivalent
- [x] 5.3 Do NOT modify `starter-pull.ts:44` (out of scope per proposal — deterministic male starter intent confirmed by β finding)

## 6. Fix D2 — 24h grace narrowed for requireP1

- [x] 6.1 Edit `apps/medexam2-hospital-tw/src/lib/tick.ts:147-167`: keep `effectiveDoctors` (live + retired-within-24h) feeding `countDistinctSubjectsAtRarity` for the diversification check
- [x] 6.2 Change the `requireP1` check at tick.ts:164-167 to use the live `doctors` array (not `effectiveDoctors`): `doctors.some((d) => rarityIsAtLeast(d.rarity, 'P1'))`
- [x] 6.3 Add a code comment near the requireP1 branch citing the spec scenario name ("Retiring only P1 immediately fails requireP1 despite 24h grace") so future readers understand the asymmetry
- [x] 6.4 No changes to `services/retire.ts` (retirementLog write semantics unchanged; only the gate evaluation is narrowed)

## 7. Verification — Build + typecheck

- [x] 7.1 Run `pnpm -r typecheck` — zero errors across all 8 workspace projects
- [x] 7.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` — successful production build
- [x] 7.3 Re-verify no incidental edits to `apps/medexam-tw/` (一階 untouched per worktree scope)

## 8. Verification — Chrome MCP smoke on port 5186

- [x] 8.1 Start dev server on port 5186: `pnpm --filter @study-rpg/medexam2-hospital-tw dev --port 5186` (background)
- [x] 8.2 Smoke α-1: inject `gameCounters.pendingEventId = 'medical-malpractice'`, `pendingEventTriggeredAt = Date.now() - 25*3600*1000`, `reputation = 1500` → start session → wait for tick → verify `eventLog.reputationDelta` row equals `-1500` not `-5000`
- [x] 8.3 Smoke α-2: inject `reputation = 3000`, force malpractice modal → verify button label includes 「將至 0」 hint; toggle to `reputation = 12000` → verify hint absent
- [x] 8.4 Smoke α-3: navigate to `/fate-cards` while at tier `醫學中心` → verify no console errors and the legendary tier's pity row is absent (only common/rare/epic show pity counts)
- [x] 8.5 Smoke γ-1: pause via 暫停 button → verify banner shows 「⏸️ 已暫停」 only; verify footer hint at line 143-147 still renders with the differentiated explanation; trigger visibility-hidden pause via tab switch → verify same banner copy
- [x] 8.6 Smoke D1: inject a doctor row with `spriteKey = 'doctor-內科-P5-female'` → train to P4 → verify resulting `spriteKey === 'doctor-內科-P4-female'`; verify a base-male `spriteKey = 'doctor-外科-P5'` trains to `'doctor-外科-P4'` (no suffix)
- [x] 8.7 Smoke D2: inject 9 distinct P2 doctors + 1 P1 doctor + `reputation = 2_500_000`, retire the P1 → start session → wait for tick → verify tier remains `醫學中心` (NOT upgraded to 國家級教學醫院); inject 2 P1 doctors + retire one → verify upgrade fires
- [x] 8.8 Run `/opsx:verify` — zero issues across all 4 spec deltas

## 9. Archive

- [x] 9.1 `/opsx:verify` pass with zero P1/P2 issues
- [ ] 9.2 `/opsx:archive` — sync 4 capability deltas (hospital-events, hospital-study-session, doctor-training, hospital-finances) into main specs
- [ ] 9.3 Confirm commit template: `spec(archive): merge fix-dogfood-2026-05-18-findings — 6 fixes from 2026-05-18 parallel dogfood` (per project CLAUDE.md auto-git rules — needs explicit user confirmation)
- [ ] 9.4 DO NOT merge to `track-m2` or `main` — user owns merge per dogfood handoff
- [ ] 9.5 DO NOT remove the worktree — user owns cleanup
