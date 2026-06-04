# Tasks — drop-neurons-nt-branch-claim-and-synapse-axis

> Phase 1 of 2. Small / low-risk / decoupled. ZERO Dexie / R2 / D1-table schema change.
> Out of scope (Phase 2): 110 variant personas + DMN flavor, maze 4→N restructure, per-branch economy, flatten maze, rot.js redesign, accent recolor.
>
> **Apply-time scope decisions (owner-confirmed mid-apply):**
> - NT-claim removal goes to **all 6 player-facing surfaces** (broader than proposal estimate): FamilyPicker, MazeBrainMap, FirstPull, HomepageOnboarding, BookmarksPage, character-card. The 110 personas + DMN flavor stay (Phase 2).
> - **FamilyPicker → flattened** (11 families, no NT-branch grouping).
> - **Maze 4 regions: structure unchanged, labels neutralized only** (圓徑/菱徑/方徑/角徑 by existing shape). The "maze 4→11 區" restructure is Phase 2 (rot.js + 11-pool economy + schema) — explicitly NOT done here.
> - character-card "強連結 synapse" stat **kept** (it's the synapse *game stat*, not the leaderboard axis nor an NT claim; synapse mechanic stays for Phase 2).

## 1. Remove leaderboard `synapse` axis — client

- [x] 1.1 `neurons-leaderboard.ts`: dropped `'synapse'` from `LeaderboardFilter` + `LEADERBOARD_FILTERS`; removed `synapse_strong` from snapshot/row/payload types + the `synapses.filter(strong)` derivation + the now-unused `db.synapses` read.
- [x] 1.2 `LeaderboardPage.tsx`: dropped Synapse tab (FILTER_LABELS / FILTER_PRIMARY_STAT), empty-state branch, allSynapseZero banner + orphan `zeroSynapseHintStyle`, table header column + row cell. `styles.css`: `--neurons-lb-cols` 7→6, removed `.neurons-lb-cell--synapse` hide + active-stat rules. → 5 tabs render.
- [x] 1.3 `LeaderboardOptInModal` (五→四 fields, dropped Strong Synapse) + `LeaderboardPromoBanner` (synapse→探索進度) + `HelpMenu` (6→5 filters, dropped Synapse from public fields + filter list).
- [x] 1.4 Grepped — no dangling client `synapse_strong` / `'synapse'` leaderboard reference (the `'synapse'` in `VALID_CATEGORIES` is the achievement category, out of scope).

## 2. Remove `synapse` axis — Worker + cron (leave D1 column orphaned)

- [x] 2.1 `cloudflare/sync-worker/src/neurons-leaderboard.ts`: removed `synapse` from `FILTERS`, `ORDER_BY`, `SNAPSHOT_COLUMNS`; dropped `synapse_strong` from `LeaderboardRowInternal` / `UpsertBody` / upsert parse+validation / INSERT columns+VALUES+SET+bind / handleGetMe SELECT+shape+return. Doc comment filter list updated.
- [x] 2.2 **Resolved**: `composite` ORDER_BY = `variant_count DESC, total_study_min DESC` — does **NOT** weight `synapse_strong`. No composite recompute needed.
- [x] 2.3 D1 `synapse_strong` column + `idx_leaderboard_neurons_synapse` index left orphaned (no D1 migration); inline comment added mirroring the `family_complete` vestigial pattern.
- [x] 2.4 Worker `tsc --noEmit` green.

## 3. Remove player-facing NT-branch grouping presentation

- [x] 3.1 Located all 6 surfaces (FamilyPicker / MazeBrainMap / FirstPull / HomepageOnboarding / BookmarksPage / character-card).
- [x] 3.2 FamilyPicker flattened (removed NT_BRANCHES/BRANCH_LABEL/BRANCH_ACCENT + grouped render + orphan branch* styles); MazeBrainMap 4-region labels → 圓/菱/方/角徑 + hint/aria-label de-NT'd; FirstPull "四大神經傳導物家族"→"四條路徑"; HomepageOnboarding "神經傳導物分支"→"探索路徑"; BookmarksPage family filter flattened (removed NT_BRANCHES ordering).
- [x] 3.3 Untouched: `FAMILY_NT_BRANCH` data, maze graphs, `economy.ts`, `maze:<branch>:*` meta, per-branch decor, 110 personas, DMN flavor. character-card `--nt-*` *colors* kept (no label) per design Decision 3.

## 4. Theme — neutralize `--nt-*` NT role

- [x] 4.1 `theme-pixel-neurons/src/index.ts`: kept the 4 `--nt-*` color values; comment reframed to "internal region/family accent, NOT a player-facing NT taxonomy" + Phase-2 recolor note. Var names kept as internal identifiers.

## 5. Verification

- [x] 5.1 `pnpm -r typecheck` → 0 errors (all 5 projects incl Worker + neurons app).
- [x] 5.2 `pnpm --filter @study-rpg/neurons-tw test` → 351/351 green (no test asserted the synapse axis / NT grouping).
- [x] 5.3 `pnpm lint:dexie-fixtures` → `[lint:dexie] OK` (confirms ZERO Dexie `.version()` change).
- [x] 5.4 Worker `tsc` green; `cloudflare/sync-worker/migrations/` unchanged (no D1 migration).
- [x] 5.5 Anti-residual grep: player-facing NT-transmitter claim text = CLEAN; synapse-axis text = only `character-card-render.ts:212` 「強連結 synapse」 remains (intentional game-stat keep).
- [x] 5.6 Chrome MCP smoke (localhost:5175): `/leaderboard` = exactly 5 tabs, no Synapse, no synapse text; `/` = no NT claim, maze labels 圓/菱/方/角徑, FamilyPicker flat; `/bookmarks` direct-URL renders (no 404), flat family filter, no NT claim; console clean.
- [x] 5.7 `openspec validate ... --strict` → valid.

## 6. Git hygiene (multi-agent safety) — owner-gated commit

- [ ] 6.1 `git status` before staging; **explicit per-file `git add`** (this worktree may have parallel sessions). Exclude `apps/neurons-tw/public/content/neurons-tw/meta.json` builtAt churn.
- [ ] 6.2 `git diff --cached --name-status` before commit → confirm only this change's files; no schema files, no maze/economy/persona files.
