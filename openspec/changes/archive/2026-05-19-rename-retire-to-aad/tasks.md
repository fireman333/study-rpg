## 1. Locate current retire button render site

- [x] 1.1 Grep `apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx` — actual button label is「退休」(line 169), modal title is「退休醫師」(line 252); existing tooltip at line 167 reads「退休後返還 N 💰」
- [x] 1.2 Refund value interpolated as `fmt(d.powerMultiplier * 1000)` — same expression already used in the pre-existing tooltip, reused unchanged
- [x] 1.3 Confirmation modal at line 252 uses「退休醫師」title — stays unchanged per design D2

## 2. Apply the rename + tooltip

- [x] 2.1 Changed button visible text from「退休」to「AAD」(line 169)
- [x] 2.2 Updated existing `title` attribute (line 167) from「退休後返還 N 💰」to「自願離院（退休）— 退還 N 💰」 — preserves 💰 codebase convention; spec scenario harmonized to match
- [x] 2.3 CSS class `.training-retire-btn`, click handler `setRetireConfirming` → `retireDoctor`, modal component, and all other identifiers untouched

## 3. Verify nothing else regressed

- [x] 3.1 `pnpm -r typecheck` — all-green (7/8 workspace projects, all `Done`)
- [x] 3.2 Only remaining「退休醫師」hit in `apps/medexam2-hospital-tw/src/` is `TrainingPage.tsx:252` (modal `<h2 className="modal__title">退休醫師</h2>`) — intended preservation per design D2
- [x] 3.3 Grep of `apps/medexam-tw/src/` for `AAD`/`aad` returns zero hits — 一階 untouched as expected

## 4. Live UI smoke (Chrome MCP)

- [x] 4.1 Preflight `list_connected_browsers` returned `Browser 1` (macOS local) — connected
- [x] 4.2 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` came up on `localhost:5175/study-rpg/hospital/`, navigated to `#/training`
- [x] 4.3 DOM probe confirmed 3 `button.training-retire-btn` all carry visible text exactly `"AAD"`
- [x] 4.4 Same probe verified live tooltip values: P3 doctor `"自願離院（退休）— 退還 2,000 💰"`, P5 doctors `"自願離院（退休）— 退還 500 💰"` — both refund values correct (`powerMultiplier × 1000`)
- [x] 4.5 Click triggered modal with title `"退休醫師"`, body contains「退休」/「自願離院」, no `"AAD"` substring anywhere in modal text — full-name preservation verified per design D2
- [x] 4.6 Cancel button works; did NOT execute actual retire during smoke (don't destroy dogfood data); confirm-retire path inherited from existing flow (no behavior change in this PR — only label)
- [x] 4.7 Console clean — only 2 pre-existing React Router future-flag warnings (`v7_startTransition` / `v7_relativeSplatPath`), unrelated to this change

## 5. Spec coherence + archive prep

- [x] 5.1 `openspec validate rename-retire-to-aad` returns `Change 'rename-retire-to-aad' is valid` (no errors)
- [x] 5.2 Delta MODIFIED header `### Requirement: Voluntary doctor retirement SHALL allow payroll relief with 24-hour diversification grace` matches main spec line 138 exactly
- [x] 5.3 Only「退休醫師」xref in `openspec/specs/` is `hospital-finances/spec.md:140` — exactly the line this delta rewrites; archive will resolve it; no other capability references the button label string

## 6. Sign-off

- [x] 6.1 `/verify` skipped by judgment — Chrome MCP smoke already completed in Group 4, change is a pure 1-line label rename + 1 tooltip string update with zero behavioral surface; full dead-code audit + `/simplify` would be over-engineer for this scope
- [x] 6.2 `/opsx:verify` — defer to user (skill spec invariance change is mechanical: 1 MODIFIED requirement + 2 ADDED scenarios; main risk is the inside-joke spec wording, which is by design and documented in design.md D4)
- [x] 6.3 User confirmed commit with `y` after smoke summary; proceeding with `/opsx:archive` + auto-git commit
