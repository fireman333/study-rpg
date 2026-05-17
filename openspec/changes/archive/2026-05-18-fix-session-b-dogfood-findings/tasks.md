## 1. Fix services/event.ts rep floor reporting

- [x] 1.1 `resolveMalpractice` accept-penalty branch — compute `actualDelta = newRep - oldRep` after `Math.max(0, ...)` floor, use for `eventLog.reputationDelta` + return value
- [x] 1.2 `resolveAudit` fail branch — same pattern (audit pass adds rep, no floor concern)
- [x] 1.3 Verify `resolveMalpractice` settle path unaffected (revenue check returns early before mutation; no floor)
- [x] 1.4 Verify `resolveEmergencyShift` / `resolveVipPatient` unaffected (both add or zero, no floor concern)

## 2. Fix AssignDoctorModal facility button copy parity

- [x] 2.1 `AssignDoctorModal.tsx:170` — dynamic visible label `{canAffordUpgrade ? '升級設施' : '需要 N 營收'}`
- [x] 2.2 Keep existing `title=` tooltip (a11y / hover affordance)

## 3. Typecheck

- [x] 3.1 `pnpm -r typecheck` zero errors

## 4. Chrome MCP smoke verify on prod (post-deploy of this fix)

- [ ] 4.1 Force-inject medical-malpractice with `reputation < 5000` → 接受懲處 → verify `eventLog.reputationDelta = actualDelta` (NOT -5000), resolver return value matches, modal copy reads actual amount
- [ ] 4.2 `/hospital` → click room → AssignDoctorModal facility section with revenue < cost → visible label reads「需要 N 營收」

## 5. Archive

- [x] 5.1 `/opsx:verify` — completeness / correctness / coherence check
- [x] 5.2 `/opsx:archive fix-session-b-dogfood-findings`
