# Decisions — 2026-06-02: neurons Pikmin Bloom — next-session plan

Handoff. Continues `2026-06-01-neurons-pikmin-bloom-direction.md`. Read that + this before resuming.

## Ship status (Pikmin Bloom core = DONE)

The 3 core moves are **all shipped to prod** (`med-study-rpg.com/neurons/`) as of 2026-06-02 (main `05d7a35`, CF Pages + GH Pages + dexie-lint CI all green):
1. ✅ `add-neurons-variant-collection-view` — /collection 圖鑑
2. ✅ `add-neurons-variant-provenance` — birth-context caption (`5ff6532`)
3. ✅ `context-driven-variant-art` — 情境視覺 (`daa41a8`): decor neuro-field backdrops behind the neuron + circadian δ/θ/α/β band letter

## Next session — DO THESE TWO (each a separate OpenSpec change)

### A. #4 — OG share / character card (roadmap M6 social) — NEW capability
Make a player's connectome / representative variants into a **shareable OG image / character card**. Currently only a deferred plan line — **no spec yet**, needs scoping at propose time. Open scoping questions to grill: what's on the card (connectome snapshot? top representatives? AP / synapse stats? nickname?), static OG-meta image vs. on-demand canvas render, where the share entry point lives, privacy (opt-in like leaderboard?). Likely `/opsx:propose add-neurons-og-share` (or `neurons-character-card`). Mirror 二階/一階 social patterns if any exist; otherwise greenfield. Pure client-side canvas → PNG is the simplest first cut (no backend).

### B. per-NT-branch flavoured decor — MODIFY `neurons-variant-context-art`
Today's decor = 3 **universal** textures (`decor:redemption` / `decor:milestone` / `decor:elder`) shared across all 11 families. Flavour them per NT branch so a DA neuron's firing-field looks different from a GABA one's, etc.
- **Shape**: 4 NT branches (DA / 5HT / GABA / Glu) × 3 decor types = up to **12 textures** (9 new; or keep the 3 universals as fallback per branch-miss).
- **Touch points**: `apps/neurons-tw/src/lib/variant-decor.ts` (decor key gains a branch dimension — derive the variant's branch from its family; the family→branch map lives in the connectome/content pack), `apps/neurons-tw/src/components/VariantSprite.tsx` (resolve `decor:<type>:<branch>` with `?? decor:<type>` fallback), `packages/theme-pixel-neurons/sprites/decor/` (+ glob already globs the folder, just add files), `sprites.ts` (`DECOR_KEYS` list). Keep the background-watermark model (faint, behind neuron) — DON'T regress to foreground badges.
- **Assets**: Gemini-first full-bleed neuro-field textures per `image_gen_routing.md` (the 3 current ones = firing field / myelin field / Cajal plate; per-branch = same motif tinted/styled per NT, e.g. branch-coloured). Originally telemetry-gated; owner has decided to do it.
- **Tests**: extend `__tests__/variant-decor.test.ts` for the branch dimension + fallback. No schema/sync change (still pure-derived).

## Still deferred (not these two)
- #5 expedition-as-study (safe 活軍隊 subset — fielded squad surfaces a family's SRS-due / wrong questions; output = more studying, no buff). Depends on neurons-tw SRS due-queue being wired — verify first.
- context-art polish: sparser milestone myelin field (currently ~93% coverage → soft gold haze at low opacity).

## Carry-over context (from memory + this session)
- **Design rule (don't re-litigate)**: visual context markers on sprites = semi-transparent background BEHIND the sprite, not foreground badges (no occlusion / no alignment); avoid per-item colour washes (rainbow grid) — one small colour accent. See project `CLAUDE.md` § "Neurons context-driven variant art".
- **Main worktree WIP** (`~/coding-scratch/study-rpg`): 2 untracked openspec changes NOT actively worked (`add-cloudflare-auth-migration`, `remove-medexam-tw-and-promote-neurons` — the latter retires medexam-tw + promotes neurons; will likely overlap neurons on its next merge). A stray `meta.json` builtAt churn appears across worktrees — exclude from commits.
- **CI env gotcha**: `.github/workflows/deploy-cf-pages.yml` builds neurons-tw with only `VITE_DEPLOY_BASE` (no `VITE_SUPABASE_*` / `VITE_SYNC_WORKER_URL`). If neurons cloud features look broken in prod, add those env vars to that build step (mirror 一階/二階). Not introduced by context-art.

## Resume checklist
1. `/spec resume` (warms project.md + decisions + in-progress).
2. Pick A or B → `/opsx:propose <name>` (consider `/grill quick` first for A — it's under-scoped).
3. Work on `track-neurons` (worktree `~/coding-scratch/study-rpg-neurons`); merge→main only when the main worktree is clean (see WIP note).
