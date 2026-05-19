## 1. Copy edit in content pack

- [x] 1.1 Open `packages/content-medexam2-tw/src/tutorial.ts`
- [x] 1.2 Replace `TUTORIAL_STEPS[2].body` (id `first-assignment`) — old `'把醫師拖到「門診」房間，他才會開始為醫院產出 throughput。同科別的醫師在對應房間內加成最大。'` → new `'點「門診」房間 → 從清單選一位醫師指派，他才會開始為醫院產出 throughput。同科別的醫師在對應房間內加成最大。'`
- [x] 1.3 Replace `SURFACE_HINTS[2].body` (id `hospital`) — old `'Facility 升級會放大該房間的 throughput；區域醫院以上可再花錢擴建額外房間，容納更多醫師。'` → new `'點房間 → 從清單選一位醫師指派（同科加成最大）。Facility 升級放大該房間 throughput；區域醫院以上可花錢擴建。場景下方名牌牆顯示 assigned 醫師依房間分組；想改名到上方「醫師」tab → 卡片右上的 ✏️。'`

## 2. Rebuild + typecheck

- [x] 2.1 Run `pnpm --filter @study-rpg/content-medexam2-tw build` and confirm exit 0 (rebuilds `dist/`)
- [x] 2.2 Run `pnpm -r typecheck` — 二階 stack clean (content-medexam2-tw / theme-pixel-hospital / apps/medexam2-hospital-tw all pass). 一階 `apps/medexam-tw` fails on `r2BundleName` field in unstaged WIP `apps/medexam-tw/src/lib/sync/types.ts` (parallel R2 cloud-sync Phase 1 work, NOT caused by this change). Isolation verified by stashing the WIP file → 一階 typecheck passes clean → restored.

## 3. Smoke-test in dev

- [x] 3.1 Started dev server on port 5175 (5173/5174 occupied by parallel sessions)
- [x] 3.2 Opened the app at `http://localhost:5175/study-rpg/hospital/` via Chrome MCP (preflight `list_connected_browsers` returned 1 browser)
- [x] 3.3 Faked fresh-save state in IndexedDB `gameCounters` singleton: `tier='診所'` + `tutorial.completedSteps={}` + `firstVisit={}` + `firedTips.v6_welcome=true` to bypass migration modal. Saved original `tier='醫學中心'` for restore.
- [x] 3.4 Advanced onboarding via DOM clicks; Step 3 body verified `"點「門診」房間 → 從清單選一位醫師指派，他才會開始為醫院產出 throughput。同科別的醫師在對應房間內加成最大。"` — no 拖 verb present
- [x] 3.5 Restored tier to `'醫學中心'` + cleared `firstVisit.hospital`; navigated to `#/hospital`; `.surface-hint__text` rendered all 4 clauses verbatim: (a) `"點房間 → 從清單選一位醫師指派（同科加成最大）"`, (b) `"Facility 升級放大該房間 throughput；區域醫院以上可花錢擴建"`, (c) `"場景下方名牌牆顯示 assigned 醫師依房間分組"`, (d) `"想改名到上方「醫師」tab → 卡片右上的 ✏️"`
- [x] 3.6 No console errors captured during walk-through. Note: smoke test mutated `tutorial.completedSteps` / `firedTips.v6_welcome` in real save (user was already past onboarding so functionally no-op); tier restored to original.

## 4. Verify + archive

- [ ] 4.1 Run `/opsx:verify` to validate spec ↔ code coherence
- [ ] 4.2 If verify passes, stage explicit paths: `git add packages/content-medexam2-tw/src/tutorial.ts openspec/changes/fix-medexam2-tutorial-copy-stale/`
- [ ] 4.3 Confirm `git diff --cached --name-status` shows ONLY those two paths (no parallel-session pollution per `multi_agent_git_safety.md`)
- [ ] 4.4 Commit on `track-m2` with message `spec(impl): fix-medexam2-tutorial-copy-stale — Step 3 click-room copy + skip-tutorial-safe hospital hint`
- [ ] 4.5 Run `/opsx:archive` to merge delta into `openspec/specs/hospital-tutorial/spec.md`
- [ ] 4.6 Post-archive: sync to `main` in next batch merge per `openspec/project.md` § Sync protocol (`cd ~/coding-scratch/study-rpg && git merge track-m2`) — done separately, not in this change
