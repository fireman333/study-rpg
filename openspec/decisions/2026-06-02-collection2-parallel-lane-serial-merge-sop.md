# Decisions — 2026-06-02: Collection 2.0 parallel-lane setup + serial-merge SOP

Cross-session handoff. Two parallel neurons lanes were spun up in dedicated worktrees so two
Claude sessions can run `/spec run` simultaneously. This doc is the **source of truth for merging
their results back to `main` safely** (and the template for future Collection 2.0 phases).

## Why parallel implementation but serial merge

- **Parallel is safe for apply/verify/archive/commit/push**: each git worktree has its own index, so
  `git add`/`commit` never cross-contaminate; feature branches are distinct refs.
- **Merge→main MUST serialize** — three independent reasons:
  1. `main` can only be checked out in ONE worktree (it is pinned to `~/coding-scratch/study-rpg`).
     A `/spec run` in any other worktree that reaches its `git checkout main` step will FAIL.
  2. `merge = deploy` (push to `main` triggers CI → prod). Two concurrent pushes race two deploys.
  3. Dexie `.version()` + R2 `SCHEMA_VERSION` are single integer counters → two schema-touching
     changes collide on the same number (this is the class of bug that took prod down 40 min on the
     `add-r2-cloud-sync-migration` pk-change incident).
- Therefore: both `/spec run` sessions STOP at GATE 2 (merge confirm → "先不要"), leaving work pushed
  on their feature branch. Merges happen here, by hand, from the main worktree, one at a time.

## The two lanes (this batch)

| Lane | Worktree | Branch | Scope | Schema touch |
|---|---|---|---|---|
| A | `~/coding-scratch/study-rpg-neurons-og` | `feat/neurons-og-share` | #4 OG share / 角色卡 (M6 social), v1 pure client-side canvas→PNG | **none** (v1 canvas-only) |
| B | `~/coding-scratch/study-rpg-neurons-gacha` | `feat/neurons-collection-gacha` | Collection 2.0 Phase 2 spine: unlock→gacha flip, P0–P5 pyramid, full reset | **Dexie v10 + R2 SCHEMA_VERSION 9** |

Both branched off `track-neurons` @ `d474024` (= main merged in + neurons' 3 unmerged commits
study-squad / per-branch-decor / handoff). Whichever lane merges to main FIRST also carries those
3 commits into main — expected, fine.

**Baseline version counters at d474024** (next-free to claim): Dexie `v10`, R2 `SCHEMA_VERSION 9`.
Lane A avoids both by staying canvas-only; Lane B claims them. If Lane A later needs persistence,
it must claim `v11` / `SCHEMA_VERSION 10` and rebase if it merges after B.

## Serial-merge checklist (run from `~/coding-scratch/study-rpg`, the main worktree)

Recommended order: **A (OG, low-risk) first** to validate the pipeline cheaply, then **B (gacha, high-risk)**
with full prod attention. (Order is collision-free since A touches no schema.) Do ONE lane fully —
incl. prod verify — before starting the next.

For EACH lane:

1. **Re-check for foreign git activity** (not just once — every merge):
   `git -C ~/coding-scratch/study-rpg status --porcelain` clean? `git reflog -5` — any commit/reset you
   didn't run? If a parallel session is mid-`.git` write, STOP and wait.
2. **Update main**: `cd ~/coding-scratch/study-rpg && git pull --ff-only origin main`.
3. **Merge the feature branch** (no force): `git merge --no-ff feat/neurons-<lane>`.
4. **Reconcile version collisions** (only relevant once ≥2 schema-touching changes exist):
   if two merged branches both claimed Dexie `v10` / `SCHEMA_VERSION 9`, the second one must be bumped
   to `v11` / `10` (edit `db.ts` `.version()` chain + its upgrade fixture + `bundles.ts` SCHEMA_VERSION
   history + reader-tolerance comment) before the merge is considered done. For THIS batch only B touches
   schema, so no reconcile needed unless A grew persistence.
5. **Rebuild + reinstall** (dist staleness + lockfile): `pnpm install && pnpm --filter @study-rpg/core build`.
6. **Exclude churn**: never stage `apps/neurons-tw/public/content/neurons-tw/meta.json` (builtAt churn,
   regenerable). Explicit per-file `git add <path>` only — NEVER `git add -A` / `.` (multi-worktree race).
7. **Typecheck + tests**: `pnpm -r typecheck` + `pnpm --filter @study-rpg/neurons-tw test`
   (Lane B: the dexie-upgrade fixture for v10 + the gacha mechanics tests must be green).
8. **Push = deploy**: `git push origin main` (no `--force`, ever).
9. **Watch CI**: `gh run list --branch main --limit 5` — BOTH "Deploy to GitHub Pages" + "Deploy Cloudflare
   Pages" must be green. (GH Pages does NOT build neurons-tw, so a green GH Pages alone is NOT proof neurons
   shipped — CF Pages is the one that serves `med-study-rpg.com/neurons/`.)
10. **Prod SPA 三件套** on `https://med-study-rpg.com/neurons/` (Chrome MCP): in-app nav + direct URL +
    F5-on-non-root, console clean. Lane B (full reset): verify a fresh-state boot + first gacha pull on prod.
11. Only then start the next lane.

## After both lanes are on main

- `cd ~/coding-scratch/study-rpg-neurons && git merge main` (catch the dev worktree up).
- Remove the throwaway lane worktrees: `git worktree remove ~/coding-scratch/study-rpg-neurons-og`
  + `... -neurons-gacha` (confirm no uncommitted work first).
- Collection 2.0 Phase 3 (`add-neurons-dupe-fusion`) / 4 (`add-neurons-expedition-rewards`) /
  6 (`expand-neurons-variant-roster`) depend on Phase 2's schema + pyramid slots — only start them AFTER
  B lands. Phase 5 (`enrich-neurons-subject-flavor`) can parallel but shares content-pack files with B.

## Known watch-items (carried from memory `neurons-prod-state-2026-06-02`)

- Main worktree has 2 untracked WIP changes NOT being worked: `add-cloudflare-auth-migration` +
  `remove-medexam-tw-and-promote-neurons` (the latter retires medexam-tw / promotes neurons → will likely
  conflict with neurons work on its eventual merge; watch).
- CI env gotcha: `.github/workflows/deploy-cf-pages.yml` builds neurons-tw with only `VITE_DEPLOY_BASE`
  (no `VITE_SUPABASE_*` / `VITE_SYNC_WORKER_URL`). If neurons cloud features look broken in prod after a
  deploy, add those env vars to that build step (mirror 一階/二階 blocks). Lane B touches R2 sync → if its
  cloud path looks dead in prod, check this first.
- P0 tier wiring (Lane B follow-up): Worker leaderboard regex is `^([a-z]+:P[1-4])...` and achievement
  tiers are P1–P4. P0 requires extending the SHARED Worker regex (`P[0-4]`) + D1 + achievement validator —
  the Worker is also used by medexam2, so that change is cross-track. Left as Lane B design.md follow-up,
  NOT done in the spine cut.
