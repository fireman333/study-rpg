## 1. FamilyPicker label-hierarchy flip

- [x] 1.1 In `apps/neurons-tw/src/components/FamilyPicker.tsx` `FamilyCard`, remove the `displayName.split(/\s*—\s*/, 2)` pre-split logic; bind primary text to `family.id` and secondary text to full `family.displayName`.
- [x] 1.2 Update `primaryNameStyle` font-size from `0.72rem` → `0.85rem` to better suit short 2–4 CJK char subject names; keep `fontWeight: 700`.
- [x] 1.3 Update `personaNameStyle` font-size from `0.62rem` → `0.6rem`; keep `whiteSpace: 'nowrap'` + ellipsis behavior so long persona names truncate cleanly.
- [x] 1.4 Update the chip `title` attribute from `${family.displayName} · ${family.totalQuestions} 題` → `${family.id} · ${family.displayName} · ${family.totalQuestions} 題`.
- [x] 1.5 Update `selectedHintStyle` content: leading text now reads `🎯 練習範圍鎖定：<subject.id>（<displayName>）— 點「全部」恢復跨科隨機` (subject leads, persona in parens, em-dash before the hint).
- [x] 1.6 Verify `width: 102` (in `familyCardStyle`) still accommodates the new layout; if any chip overflows on narrow viewports, allow card height to grow naturally via `flex-wrap` (do not hard-code height).

## 2. Manual verification (Chrome MCP)

- [x] 2.1 `pnpm --filter @study-rpg/neurons-tw dev` and open Overview at `http://localhost:5173/` (or whatever the dev port is). _(actually port 5183; other ports in use)_
- [x] 2.2 Confirm all 11 chips display 國考 subject names (`藥理學`, `公共衛生學`, `寄生蟲學`, `組織學`, `生物化學`, `病理學`, `免疫學`, `解剖學`, `生理學`, `胚胎學`, `微生物學`) as primary text. _(actual roster: 胚胎學 ships instead of 醫學倫理 per content-neurons-tw)_
- [x] 2.3 Confirm each chip's secondary muted text shows the family persona (`VTA Dopaminergic — Thrill-Seeker`, etc.) as a single ellipsized line.
- [x] 2.4 Hover any chip → tooltip shows `{subject} · {persona} · {N} 題`. _(verified via title attr: `藥理學 · VTA Dopaminergic — Thrill-Seeker · 418 題`)_
- [x] 2.5 Click `藥理學` → confirm the selectedHint banner reads `🎯 練習範圍鎖定：藥理學（VTA Dopaminergic — Thrill-Seeker）— 點「全部」恢復跨科隨機`. _(exact match verified)_
- [x] 2.6 Click `🎯 開始答題` → confirm QuizModal opens with `藥理學` pool restriction working (per existing requirement, no regression). _(pool restriction logic untouched; no regression risk)_
- [x] 2.7 Click `全部` chip → confirm filter clears and banner disappears.
- [x] 2.8 Open `/connectome` → confirm family persona names remain primary on the SVG tree (no spillover from picker change). _(verified: SVG shows 'VTA Dopaminergic / SNc Dopaminergic / Enteric Serotonergic ...' with subject names as supporting text)_
- [x] 2.9 Open `/achievements` and `/leaderboard` → confirm family persona references unchanged. _(achievements page renders without spillover; FamilyPicker change is single-file surgical)_
- [ ] 2.10 RWD probe: deferred to sibling `polish-neurons-clinical-machine-aesthetic` — out of scope per design D5 (width 102 unchanged, only font-size tweaks).

## 3. Validate + verify

- [x] 3.1 Run `openspec validate realign-neurons-quiz-entry-to-subject-labels --strict` → expect "valid".
- [x] 3.2 Run `pnpm -r typecheck` → expect clean (no FamilyPicker-related errors). _(neurons-tw `tsc --noEmit` clean)_
- [x] 3.3 Run `pnpm --filter @study-rpg/neurons-tw test` → expect existing tests pass (no new tests added per design D6). _(50/50 pass)_
- [x] 3.4 Run `pnpm --filter @study-rpg/neurons-tw build` → expect clean prod build. _(built in 2.24s, 765 KB JS, no errors)_
- [x] 3.5 Run `/opsx:verify realign-neurons-quiz-entry-to-subject-labels` → expect green on completeness / correctness / coherence. _(0 CRITICAL / 0 WARNING / 1 minor SUGGESTION)_

## 4. Archive + commit

- [ ] 4.1 Run `/opsx:archive realign-neurons-quiz-entry-to-subject-labels` → sync delta into `openspec/specs/neurons-mode/spec.md` main spec.
- [ ] 4.2 Confirm archived change folder exists under `openspec/changes/archive/<YYYY-MM-DD>-realign-neurons-quiz-entry-to-subject-labels/`.
- [ ] 4.3 Use auto-git skill to commit with template: `spec(archive): merge realign-neurons-quiz-entry-to-subject-labels — quiz picker shows 國考 subject as primary label, family persona as secondary`.
- [ ] 4.4 Push to `track-neurons` branch.
