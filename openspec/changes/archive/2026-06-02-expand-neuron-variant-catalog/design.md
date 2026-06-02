# Design — expand-neuron-variant-catalog

## Context

The catalog seam is already built for variable per-family counts (rarity is an explicit field; `slotIndex` is `0..N-1`; `VARIANT_COUNT_BY_FAMILY` and `slotsForFamily` derive from the catalog). So this is a content-growth change against a stable mechanic, not a re-architecture. The only code touched beyond the catalog array is: the pyramid test (re-pin), the achievement thresholds (content), and theme-pack sprite registration (already glob-driven). No schema/sync/Worker change.

Three decisions below — D1 (distribution) and D3 (achievement re-tune) have a recommended default; **D2 (sprite strategy) is the headline GATE 1 question** because it determines whether prod ships with a placeholder grid.

## Decisions

### D1 — Per-family tier distribution for the 3 new slots (RECOMMENDED: thicken mids)

Current per family (7): `P0×1 / P1×1 / P2×1 / P3×1 / P4×1 / P5×2` (P5 at slots 1 & 6).
Need +3 to reach 10, keeping the pyramid invariant (rarer tier ≤ commoner tier).

**Recommended — Option A (thicken mid-tiers):** new slots `7=P4, 8=P3, 9=P2` →
`P0×1 / P1×1 / P2×2 / P3×2 / P4×2 / P5×2 = 10`.
Invariant (common→rare): P5(2) ≥ P4(2) ≥ P3(2) ≥ P2(2) ≥ P1(1) ≥ P0(1) ✓.
- Mid-tier reveals are the satisfying ones (commons are filler, apex stays a chase) → growth lands where it feels rewarding.
- P5 stays at exactly slots {1,6}, so the existing test's P5 assertion barely moves; apex (P0,P1) stays scarce.

**Alternative — Option B (wider common base, most "pyramid"):** new slots `7=P5, 8=P4, 9=P3` →
`P0×1 / P1×1 / P2×1 / P3×2 / P4×2 / P5×3 = 10`.
Invariant: P5(3) ≥ P4(2) ≥ P3(2) ≥ P2(1) ≥ P1(1) ≥ P0(1) ✓.
- More faithful to the grill's "P5 many → P0 few" silhouette, but the +3 lands mostly on the least-exciting common tier (3× P5/family).

Neither changes drop rates (tier-first roll). Difference is purely *which tiers gain collection variety*.

### D2 — Sprite strategy → RESOLVED at GATE 1: Path 2 (generate all 33 inline, 110 all-real)

33 new sprites needed at `packages/theme-pixel-neurons/sprites/variants/<family>-{7,8,9}.png`. The committed 77 are all real art; the staged scratch dirs (`neurons-p0-apex`, `neurons-slot6-p5`) were the sources for already-wired art — **nothing reusable for the new slots**, so this is fresh generation either way.

- **Path 1 — placeholder now + art-fill follow-up (faster `/spec run`):** ship the 33 keys as placeholders (fall back to `variant:default`, spec-permitted by the line-334 requirement), real art in a follow-up `art-fill-neuron-variant-slots-7-9` (mirrors the `7fb36b3` slot-6 cadence). **Cost: prod shows a ~30% placeholder grid (33/110) until the follow-up** — partially undoes `7fb36b3`'s "0 placeholder" polish.
- **Path 2 — generate all 33 inline (ships complete):** apply-phase runs a codex/Gemini batch (~1–2 hr wall, codex-quota risk per `image_gen_routing.md`). `/spec run` verify/deploy waits on it; ships fully-arted.

`tasks.md` is written for **Path 1** (placeholder) so the pipeline can proceed; if owner picks Path 2 at GATE 1, the sprite-gen tasks + the line-334 spec delta get rewritten before apply.

### D3 — Distinct-count achievement re-tune (RECOMMENDED: scale to preserve proportional intent)

Milestone thresholds live in `achievements.ts` (content), NOT the `neurons-achievements` spec — so this is a content edit, no spec delta, entry count unchanged (spec invariants ≥30 / ≥4-per-category / P1-composite stay satisfied).

Original ratios at 77-cap → scaled to 110 to keep the same "% of collection" feel:
| id | old | new | note |
|---|---|---|---|
| `variant-first-pull` | 1 | 1 | unchanged (first pull) |
| `variant-fifteen` | 15 (19%) | 20 (18%) | early colony |
| `variant-thirty` | 30 | 40 (36%) | **drop "過半典藏"** (30/110 = 27%, never was half at 110) |
| `variant-fifty` | 50 (65%) | 70 (64%) | keeps the "過半" feel honestly |
| `variant-grand-collector` (P1) | 60 (78%) | 90 (82%) | near-completion apex; keeps `≥3 natural-P1-families` composite gate |

Rationale: leaving thresholds at 77-cap values makes "過半"/"萬神殿" milestones factually wrong at 110 and compresses progression into the first half. Scaling preserves the intended pacing.

### D4 — No schema/sync/Worker touch (locked, low-risk)

- No Dexie bump: no new field/table → **no upgrade fixture required** (dexie-fixture-lint only triggers on a new `.version(N)`).
- No R2 `SCHEMA_VERSION` bump: bundle shape unchanged; a device with the old catalog reading a new-catalog peer's rows just renders rows whose `slotIndex` it doesn't have a persona for — but personas are resolved from the synced row's own stamped `displayName`/`spriteKey`, not re-derived, so cross-version is a non-issue.
- `character-card.ts` `SLOTS_PER_FAMILY = VARIANT_TOTAL / FAMILY_TOTAL` = 110/11 = 10 (clean integer; uniform distribution chosen partly to preserve this assumption).

## Risks / Trade-offs

- **D2 placeholder regression** (Path 1) — the only real risk; mitigated by the follow-up art-fill, surfaced at GATE 1.
- **Persona authoring volume** (33 entries) — manageable; they're rarity-tier variations on already-anchored family neurons, not new science.
- **Within-tier pick fairness** — with 2 variants per mid tier, a tier roll picks uniformly among that tier's slots (new-or-dupe); existing behaviour, no change needed.
