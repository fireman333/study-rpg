## 1. HelpMenu reference sections (code already in working tree — confirm + finalize)

- [x] 1.1 Confirm `apps/neurons-tw/src/components/HelpMenu.tsx` carries the new sections: `question-bank`, `expedition`, `wrong-review`, `first-pull-second-lap`, `connector-neuron`, `acceleration`, `companion`, `achievements`, plus clarified `variant-unlock` copy
- [x] 1.2 Confirm the existing `hotkeys` + `bug-report` sections remain present (spec floor) and the `bug-report` section reflects shipped reality (BugReportModal per `neurons-bug-report`, not the retired GitHub-Issues placeholder)
- [x] 1.3 Confirm section copy is factually accurate against shipped behavior (connector = 55 closed-set bridge collectibles on first strong wire; acceleration caps ×2.5 energy / ×2.0 speed; achievements 30 × 4 tiers; 220-variant split; per-book 模考)
- [x] 1.4 Confirm no other file changed (no onboarding panel edit, no schema/sync/Worker touch) — `git status` shows only `HelpMenu.tsx`

## 2. Verify

- [x] 2.1 `pnpm -r typecheck` clean (post-edit edits were JSX text-only — no type impact)
- [x] 2.2 Chrome MCP smoke: ❓ HelpMenu opens on `/`, all 15 sections render in order, single-expand works, factual fixes live (33 achievements / 22 DMN cards / 變體解鎖-only behavior axis), connector + acceleration sections present, console clean
- [x] 2.3 `pnpm --filter @study-rpg/neurons-tw test` green — 449/449 across 67 files

## 3. Archive + commit

- [ ] 3.1 `/opsx:archive update-neurons-onboarding-connectome` (sync the `neurons-mode` MODIFIED delta into main specs)
- [ ] 3.2 Commit via auto-git: explicit per-file `git add` of `HelpMenu.tsx` + the change archive + the synced `neurons-mode` spec; `git diff --cached --name-status` confirms only those; message `spec(archive): merge update-neurons-onboarding-connectome — HelpMenu 補完整 loop（含 connector）`
