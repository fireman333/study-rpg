# Decisions — 2026-06-02: neuron squad / expedition (#5) — next-session plan

Supersedes the #5 line in `2026-06-02-neurons-pikmin-next-session.md`. Change B has now been
**deep-grilled (2026-06-02)** and expanded into a 6-phase "Collection 2.0" mini-milestone — the
authoritative plan is `~/.claude/scratch/grilled-neurons-changeB-collection-rework-2026-06-02.md`
(read it before any propose). The earlier quick-grill doc
`~/.claude/scratch/grilled-neurons-expedition-study-2026-06-02.md` still holds for Change A scope.

## Shipped this session (2026-06-02)
- ✅ **B — per-NT-branch decor** (`add-neurons-per-branch-decor`, commit **b971d4b** on `track-neurons`).
  Archived into spec `neurons-variant-context-art` (6→8 reqs). 12 branch-tinted decor textures
  (DA amber / 5HT red / GABA blue / Glu green), single-source `FAMILY_NT_BRANCH`, `decorSpriteUrl`
  fallback chain. Verify-green + Chrome MCP smoke. NOT merged to main (waits for clean main worktree).

## #5 deep-grilled → Collection 2.0 mini-milestone (6 phases, NOT yet proposed)

Quick grill (`/grill quick`) framed Change A; deep grill (`/grill deep`, 2026-06-02) blew Change B open into
a full collection rework. Locked decisions (full rationale in the changeB grill doc):

**Change A (still valid as grilled):**
- **Squad = party, UNIFIED**: the assembled squad IS the party shown during answering, celebrates on each
  correct answer (in QuizModal), and earns rewards. One "active squad" concept (LWW state).
- **Expedition = ALL-subject wrong questions** (cross-family 歷史曾錯/未答對 via QuizModal). One 出征.

**Change B → Collection 2.0 (deep-grill locked):**
- ⚠️ **"No passive 加成" REVERSED**: rewards now = **permanent passive accelerators** (boost AP gain /
  pull-rate / P0 soft-pity). Intentionally re-opens the fate-card cost-gate; **balanced by drop scarcity**
  (no hard cap — telemetry-watch risk).
- **Collection mechanic FLIPS**: "答對 N 題 → 自動解鎖" → **gacha pull**. Pull currency = study + correct →
  OE-themed neurotransmitter token (study-gated, no payment).
- **Rarity pyramid P0–P5**: P5 most/commonest … P1/P0 fewest/rarest; new **P0 super-rare per subject (<1%,
  soft pity ~0.6–0.8% base + ramp from ~40 pulls)**. Existing sprites retained.
- **Dupe fusion (衝卷軸)**: dupe → gamble promote to unowned higher tier; **fail → 碎片**, shards feed pulls.
- **特色 = pure flavor, ZERO stat** (OE-grounded). Neurons stay "no 優劣"; all power lives in reward items.
- **Taxonomy**: 4 NT 大分支 → 11 科目/家族 (each one 特色) → 10+ variants/subject.
- **Existing players: FULL RESET** (no dogfood/promo yet) → no grandfather, clean schema redesign.
- **Veteran flair** (expeditionCount): **merged into the 特色 / context-art layer** (not a separate badge).

### The roadmap (dependency + risk ordered; each = separate `/opsx:propose`)
| Phase | Change | Risk | Deps |
|---|---|---|---|
| **1** | `add-neurons-study-squad` (squad=party + celebration + all-subject 出征; reward seam = clean stub) | low | — |
| **2** ⭐spine | `rework-neurons-collection-gacha` (unlock→gacha + currency + P0–P5 pyramid + **full reset** + Dexie/R2 bump + fixture) | **high** | 1 (loose) |
| **3** | `add-neurons-dupe-fusion` (衝卷軸 + shards) | med | 2 |
| **4** | `add-neurons-expedition-rewards` (supplement/glial permanent-passive multipliers + 出征 drop + animations) | med-high | 1+2 |
| **5** | `enrich-neurons-subject-flavor` (11-subject OE pure-flavor 特色 + veteran flair into 特色 layer) | low | parallel |
| **6** | `expand-neurons-variant-roster` (5→10+/subject ~110+ sprites + 11 P0s; **split per NT branch**) | low/high-effort | 2 |

Cross-cutting follow-up: **P0 leaderboard/achievement wiring** (Worker regex `P[1-4]`→`P[0-4]` + D1 +
achievement validator/catalog) — fold into Phase 2 or small change.

## Next session — DO THIS
1. `/spec resume`.
2. **`/opsx:propose add-neurons-study-squad`** (Phase 1). Design.md notes the reward seam plugs into Phase 4.
3. Before Phase 2/4/5 propose, **`/oe`** the neuroscience anchors (currency theme, glial reward functions,
   11-subject 特色). Game-loop numbers (rates/pity/scarcity) are dogfood-tuned, not OE.
4. Open ordering choice (owner leaning Phase 1 first): Phase 1 vs Phase 2 (gacha flip) first — see grill doc.

## Carry-over context
- Merge `track-neurons` → main only when the **main worktree is clean** (it has untracked WIP:
  `add-cloudflare-auth-migration`, `remove-medexam-tw-and-promote-neurons`).
- Stray `apps/neurons-tw/public/content/neurons-tw/meta.json` `builtAt` churn — exclude from commits.
- This decision note is currently **uncommitted** (parked); next `/spec handoff` or commit will pick it up.
