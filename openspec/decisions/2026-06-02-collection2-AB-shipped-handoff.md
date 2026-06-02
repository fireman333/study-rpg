# Decisions — 2026-06-02: Collection 2.0 A+B shipped + next-batch handoff

Continues `2026-06-02-collection2-parallel-lane-serial-merge-sop.md`. Read both before resuming.

## Ship status (2 parallel lanes → prod)

Both lanes built in parallel worktrees, then **serial-merged** to main (main `db65568`,
all CI green, `med-study-rpg.com/neurons/` verified):

- **Lane A — `add-neurons-og-share`** (`f7b9288` merge): /collection 「🔗 分享角色卡」 client-side
  canvas→PNG character card. Carried study-squad + per-branch-decor to main too.
- **Lane B — `rework-neurons-collection-gacha`** (`b620138` merge): Collection 2.0 Phase 2 spine —
  unlock→gacha flip, neural-energy currency (study earns, spend to pull), P0–P5 fixed-rarity
  model, **full collection reset** on Dexie v10, R2 SCHEMA_VERSION 8→9. Verified on prod:
  v9→v10 upgrade boots clean, /collection shows 66-slot grid + ⚡ HUD + 11 pull buttons + 「已收集 0 隻」.

`track-neurons` caught up with main = `648f0ad`. Lane worktrees removed.

## Fixes applied during B's merge (so they're not re-litigated)

- **Spec-delta authoring bug**: B's `/spec run` wrote `## MODIFIED` requirement headers with reworded
  titles that didn't match the main-spec headers → `openspec archive` sync aborts. Convention going
  forward: **MODIFIED header must match the existing main-spec header verbatim**; if the requirement's
  identity/numbers change (e.g. 55→66), use REMOVE(old)+ADD(new), not a reworded MODIFIED.
- **Cross-lane type integration**: B widened `VariantRarity` (+P0) and `FamilyAccrualRow` (+pullCount);
  A's character-card code had to absorb both (RARITY maps gain P0; `SLOTS_PER_FAMILY` hardcoded 5 →
  derived `VARIANT_TOTAL/FAMILY_TOTAL`). Lesson: a hardcoded slot/tier count silently breaks when the
  catalog grows — derive from the catalog.
- **Dexie-fixture-lint script bug** (`db65568`): `scripts/lint-dexie-fixtures.sh` fed `comm` numeric-sorted
  version lists; comm needs lexical order — diverges at double digits, so **v10 was the first version to
  expose it**. Fixed (re-sort comm inputs lexically). Future double-digit bumps won't spuriously fail.

## Open follow-ups (each its own change; NONE started)

- **P0 cross-cut** (B tasks §13): leaderboard Worker badge regex `^([a-z]+:P[1-4])` → `P[0-4]` + D1 +
  achievement validator, so P0 surfaces on the leaderboard. Touches the **shared sync Worker** (also
  medexam2) → cross-track, do carefully as its own small change.
- **Currency OE theming**: name/theme the neural-energy token + faucet flavor via `/oe` (project rule:
  neuroscience facts OE-anchored; the rates themselves are dogfood-tuned).
- **Phase 3 `add-neurons-dupe-fusion`**: 衝卷軸 — dupe → promote-or-shards; shard currency feeds pulls;
  last-copy protection. Depends on B (dupes exist post-gacha). Deep in gacha/currency core.
- **Phase 4 `add-neurons-expedition-rewards`**: permanent-passive multipliers (AP / pull-rate / P0 pity)
  from probabilistic 出征 drops; scarcity-balanced. Deep in gacha/currency core.
- **Phase 5 `enrich-neurons-subject-flavor`**: 11-subject pure-flavor 特色 + veteran flair. Mostly
  content pack + display layer — peripheral to the gacha engine.
- **Phase 6 art**: ⚠ **model discrepancy to resolve first** — the grill envisioned a *pyramid* (P5 many
  variants … P1 few, "10+/subject, ~110 sprites"), but B shipped a *simpler fixed 6-slot* model (exactly
  one variant per rarity per family = 66). So "expand to 110" would re-architect the slot model again.
  Decide: keep fixed-6-slot (Phase 6 = just wire real P0 art + polish) vs multi-variant-per-tier (bigger).
  **11 P0 apex sprites already generated + staged** at `~/.claude/scratch/neurons-p0-apex-2026-06-02/`
  (B ships P0 as placeholders) — wiring = copy `sprites/*.png` → `packages/theme-pixel-neurons/sprites/variants/<family>-0.png`.

## Parallelism going forward — NOT single-session-only, but narrower than A+B

The A+B parallel run worked but paid an **integration tax** (spec-delta bug + CollectionPage conflict +
4 type fixes + lint fix — all single-threaded merge work). That tax was *manageable* only because A
(og-share, peripheral) barely overlapped B (gacha core) — one file (CollectionPage) + one type (Rarity).

Rule learned: **parallelize ACROSS subsystems, serialize WITHIN a subsystem.** All merges serialize
regardless (single `main` ref + Dexie/R2 version reconcile + merge=deploy).

Applied to the remaining work:
- **Phase 3 + Phase 4 are BOTH gacha/currency core** → running them in parallel = heavy conflict on the
  same files + Dexie/R2 version collisions. **Do them sequentially in ONE lane (3 → 4).**
- **Phase 5 (flavor) + Phase 6 art-gen are peripheral** (content pack + theme sprites, not the engine)
  → these CAN run as **one parallel lane** alongside the 3→4 core lane. Watch the `variants.ts` overlap
  (catalog flavor text vs core fields) — keep flavor edits to displayName/description, not gacha fields.
- **P0 Worker cross-cut**: small, shared-Worker, its own sequential change.

So the realistic shape is **≤ 2 lanes** (1 gacha-core-sequential + 1 peripheral flavor/art), not the
free-for-all the 6-phase list might suggest. Given the integration tax, single-session for the gacha-core
phases is genuinely cleaner; reserve parallelism for the clearly-independent art/flavor/sprite work.

## Watch-items

- Pre-existing **uncommitted** edits in the `study-rpg-neurons` worktree (NOT from the A+B work):
  `CLAUDE.md` (+6 lines: an "OpenSpec interactions in Traditional Chinese" rule) + `openspec/config.yaml`
  (+1). Commit when ready or discard.
- `track-neurons` local (`648f0ad` + this handoff) is **ahead of origin/track-neurons** — push to back up.
- meta.json `builtAt` churn keeps reappearing across worktrees — always exclude from commits.
