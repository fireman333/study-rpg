# Handoff — rebalance shipped, no locked NEXT (2026-06-07, post-rebalance)

> Written for `/spec clear` → `/clear` → next-session `/spec resume`.
> **Supersedes** `2026-06-07-outstanding-inventory-post-emoji.md` (its A1 owner-locked NEXT = `rebalance-neurons-*` is now SHIPPED).
> **State at write**: no active OpenSpec changes; both worktrees clean (`track-neurons` 0/0 vs `origin/track-neurons`+`origin/main`; `main` worktree 0/0, only the peer's untracked `add-cloudflare-auth-migration/`); `openspec validate --all --strict` = **84/0**. Prod `med-study-rpg.com/neurons/` healthy.

## What just shipped (DONE)
**`rebalance-neurons-maze-economy`** — main merge `07b2aac` (impl `c1ebcaf` + archive `f8cafa7`) + CF Pages `27091705437` + prod-verified. Model-driven maze pacing rebalance:
- `PACING_BASE` 14→11; NEW `RAMP_CAP_N=20` (cost flattens at 33 past N=20; settle index stays uncapped).
- within-tier pick → **fill-missing-first** (cross-tier rarity RNG unchanged → first P1 still a surprise).
- **silent P1 soft-pity** (`effectiveP1Rate` 30/.06; no `wasPityFloor`/UI 保底).
- C1 hygiene: `neuron-family-mastery` "two faucets" SHALL → single live maze faucet (owner-approved).
- ZERO Dexie/R2/Worker schema; monotonic-positive for in-flight saves.
- Model lands 100%-collect-220 at ~2,728 correct (p90 ~4,400 ≈ 2-month達標), down from ~15,257.
- Archive `openspec/changes/archive/2026-06-07-rebalance-neurons-maze-economy/` (incl `model/01-current`+`02-candidate` .mjs — re-runnable to re-tune). Grill `~/.claude/scratch/grilled-rebalance-neurons-2026-06-07.md`.

## A0 — Nothing broken / half-done
No active changes; clean worktrees; CI green. Everything below is a candidate, not an obligation.

## A1 — NEXT options (NONE locked — owner to pick)
1. **Dogfood-tune the rebalance constants** (highest-signal, was the original telemetry-first intent). The numbers (`PACING_BASE=11` / `RAMP_CAP_N=20` / `PACING_K=0.1` / P1-pity 30,.06) are **dogfood-tunable, zero-schema** — actually play the 220 grind, then a one-line constant re-tune + re-deploy. The model scripts in the archived change's `model/` re-run to re-validate any new candidate.
2. **Low-effort polish** (from earlier handoffs, low priority):
   - 6 long-tail neurons-only emoji still native: 🔢`1f522` 🚫`1f6ab` 😣`1f623` 🔬`1f52c` 🔥`1f525` 🐜`1f41c`. Backfill = drop a 64×64 PNG into `apps/neurons-tw/public/icons/emoji/<codepoint>.png` + add a row to `apps/neurons-tw/src/lib/emoji-icons.ts` (zero other code).
   - `HomepageOnboarding` teaching paragraphs render pixel font (Option-B accepted); legible-ify = 1-line `fontFamily:'var(--font-legible)'`.
3. **M6 — Social light** (⏳ roadmap): 朋友 leaderboard (read-time / mastery%) + **公開分享角色卡 OG image** (neurons already has `/collection` 🔗 分享角色卡 / `ShareCardModal`; OG-image + richer context-art-on-card is the M6 extension).

## A2 — Owner dashboard-only cleanup (I'm barred; tangential, non-blocking)
From `remove-medexam-tw-and-promote-neurons` (2026-06-03): delete R2 `m1` (一階) snapshot blobs in bucket `study-rpg-saves` (dashboard — `wrangler` has no `r2 object list`); Supabase Auth redirect-URI allowlist tidy-up (dashboard, NO `config push`). Neither blocks any neurons feature.

## A3 — Peer / cross-session (NOT mine — do not touch)
- **`add-cloudflare-auth-migration`** — peer's untracked proposal folder in the **main worktree** (`~/coding-scratch/study-rpg`). Left untouched throughout.
- Before touching shared maze/spec files, check session-bus `/inbox` for active peers.

## Process reminders
- Worktree `track-neurons` (`~/coding-scratch/study-rpg-neurons`); `main` checked out in `~/coding-scratch/study-rpg` — merge→main happens THERE (`git -C … merge --no-ff`), triggers `deploy-cf-pages.yml` = deploy. Confirm before merge (GATE 2).
- A future change should re-check + `git merge origin/main` at start.
- Multi-agent safety: explicit per-file `git add`; revert `meta.json` builtAt churn (dev/predev content-copy re-stamps it); leave the main-worktree peer folder alone.
- Neuroscience facts → `/oe` (OpenEvidence), not memory. Game-loop numbers (pacing/caps) are NOT OE-anchored — dogfood-tune.
- Image-gen: Gemini MCP was logged-out recently (`account_status=UNAUTHENTICATED`) → codex CLI fallback (`codex exec -m gpt-5.5 --sandbox workspace-write --skip-git-repo-check "… $imagegen" < /dev/null`) if generating sprites/icons.
