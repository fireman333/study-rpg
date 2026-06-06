## 1. Canonical content-source data (`packages/content-neurons-tw/src/families.ts`)

- [x] 1.1 Add `FAMILY_COLOR: Record<string, string>` (11 entries) beside `FAMILY_NT_BRANCH`, using the LOCKED palette: 解剖學 `#6a8c3f`, 胚胎學 `#7e7b25`, 組織學 `#c44d4d`, 生理學 `#27866f`, 生物化學 `#6a9bc4`, 微生物學 `#278634`, 免疫學 `#696cd3`, 寄生蟲學 `#ca4970`, 公共衛生學 `#c639ba`, 藥理學 `#d4a04d`, 病理學 `#9859cf`. Document inline which 4 are NT-branch anchors (no sprite change) vs 7 new (sprite re-tint follow-up).
- [x] 1.2 Add `FAMILY_EXAM_PAPER: Record<string, '醫學一' | '醫學二'>` + `EXAM_PAPER_ORDER: { 醫學一: string[]; 醫學二: string[] }` (醫學一: 解剖學, 胚胎學, 組織學, 生理學, 生物化學 / 醫學二: 微生物學, 免疫學, 寄生蟲學, 公共衛生學, 藥理學, 病理學). Add an inline comment recording the corpus-derived basis (dominant-book + median qNumber). **Do NOT modify `FAMILY_IDS` order** (maze-coupled).
- [x] 1.3 Re-export `FAMILY_EXAM_PAPER` + `EXAM_PAPER_ORDER` (and `FAMILY_COLOR` if useful) from `packages/content-neurons-tw/src/index.ts`.

## 2. Content build (`packages/content-neurons-tw/scripts/build.ts`)

- [x] 2.1 Replace the subject `color` assignment from `NT_COLOR[ntBranch]` to `FAMILY_COLOR[id]` (import from `../src/families`). Throw if a subject id is missing from `FAMILY_COLOR` (no silent fallthrough). Leave the `group` (NT branch) field assignment unchanged.
- [x] 2.2 Remove the now-unused `NT_COLOR` const if nothing else references it (orphan cleanup per surgical-change discipline).

## 3. Rebuild + place content artifact (multi-agent git safety)

- [x] 3.1 Run `MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-neurons-tw build`; copy `dist/subjects.json` (and only that) to `apps/neurons-tw/public/content/neurons-tw/subjects.json`.
- [x] 3.2 Restore `apps/neurons-tw/public/content/neurons-tw/meta.json` to the concurrent maze session's working-tree version (do NOT commit a `builtAt` change). Confirm `questions.json` is byte-identical to before the rebuild (colors live only in `subjects.json`).
- [x] 3.3 Verify `subjects.json` now has 11 distinct `color` values (no two equal) and unchanged `group` values + subject order.

## 4. App UI — two-row exam-paper layout (`apps/neurons-tw/src/components/FamilyPicker.tsx`)

- [x] 4.1 Ensure `apps/neurons-tw` can import `FAMILY_EXAM_PAPER` + `EXAM_PAPER_ORDER` from `@study-rpg/content-neurons-tw` (add the workspace dep to `apps/neurons-tw/package.json` if not already present).
- [x] 4.2 Partition `pack.subjects` into 醫學一 / 醫學二 via `FAMILY_EXAM_PAPER`, order each group by `EXAM_PAPER_ORDER`, and render two labelled sections (header = paper label + family count) each wrapping the existing responsive `.neurons-family-grid`. Remove the single flat grid. No per-card color logic change (cards already read `family.color`).
- [x] 4.3 Confirm the picker no longer renders (and never did) any NT-branch header / grouping.

## 5. Verify

- [x] 5.1 `pnpm -r typecheck` clean.
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw build` clean (Vite + TS strict).
- [x] 5.3 Chrome MCP smoke (dev): homepage renders two exam-paper sections (醫學一 5 cards / 醫學二 6 cards) in 試題順序; all 11 cards show distinct accent colors (no two same-branch cards share a color); console clean. SPA direct-URL `/` + F5 OK.
- [x] 5.4 `pnpm --filter @study-rpg/neurons-tw test` + `pnpm lint:dexie-fixtures` (expect no-op — no schema change) clean.

## 6. Coordination

- [x] 6.1 Send a session-bus message to the maze session: `subjects.json` per-subject colors changed (4→11 distinct); their `MazeGrid` per-family tint will inherit the new colors; this change did not touch any maze-owned file or `FAMILY_IDS`.
- [ ] 6.2 At commit time: explicit per-file `git add` (the 2 content-src files + `subjects.json` + `FamilyPicker.tsx` + `package.json` if changed + the openspec change/spec files); `git diff --cached --name-status` to confirm no maze-owned file (`MazeGrid.tsx` / `graph.ts` / `grid-graph.json` / maze tiles / `meta.json`) is staged.
