# Decisions — 2026-06-02: context-driven-variant-art (locked, pre-propose)

Next Pikmin-Bloom step after `add-neurons-variant-provenance` (shipped, archived `2026-06-01-add-neurons-variant-provenance`, on origin/track-neurons). This change turns the provenance data into glanceable variant **art** ("帽子=出身"). Design grilled + locked with user 2026-06-02; **not yet proposed**. Full grilled draft: `~/.claude/scratch/context-driven-variant-art-design-2026-06-01.md`.

## Locked decisions

1. **Architecture — decor-overlay, NOT per-context full sprites.** Base 55 variant sprites stay untouched; a few universal decor overlays composite over the base at render, selected from `row.provenance`. Bounded asset count (~3), purely additive, display-only.
2. **Decor visual vocabulary (採用提案):**
   - `救贖` (`provenance.wasRedemption === true`) → 餘燼/重生光暈 (ember-rebirth aura), bottom-corner.
   - `里程碑` (`provenance.streakAtMint >= MILESTONE_STREAK_THRESHOLD` = 7) → 連勝冠冕/桂冠 (streak crown/laurel), top-of-head.
   - `元老` (`provenance === undefined`) → 古銅 patina 框 (aged patina frame), full border. Mutually exclusive with 救贖/里程碑 (those need provenance).
   - standard (has provenance, neither flag) → no overlay (bare base).
3. **Seasonal tint — YES.** `bornAtISO` month → 春/夏/秋/冬 tint on the base. **Sub-detail to resolve in design:** 元老 has no `bornAtISO` → either derive season from `rolledAt` month, OR (preferred) 元老's 古銅 patina dominates and skips seasonal. Lean: 元老 = patina only, no season. **Impl preference:** CSS filter/hue (zero new assets) over 4 tint PNGs, unless pixel-level control needed.
4. **Display points:** dex card (`CollectionPage`) + `VariantUnlockModal` (both required) + **family-card representative variant also carries decor** (so homepage/family card shows the birth story at a glance).
5. **Stacking:** 救贖 + 里程碑 → composite BOTH overlays (crown top, ember bottom-corner, offset so neither covers the face). Seasonal tint is an orthogonal base layer, coexists with overlays.

## Engineering shape (cheap — like provenance, no data plumbing)

- **Zero new Dexie field, zero schema bump, zero new R2 adapter.** Decor + season are fully **derived from existing `provenance` (already synced) + `rolledAt` at render**. Cross-device free.
- New: a pure helper (mirror `lib/variant-caption.ts`) e.g. `variantDecorOverlays(row): DecorKey[]` + season helper + `DECOR_SPRITE_MAP`; render composites base `<img>` + overlay `<img>`(s) + season tint (CSS).
- Asset gen: 3 decor PNGs via Gemini-first (transparent bg → chroma-key + nearest-neighbor + 16-color), ~minutes. Season via CSS (likely 0 assets).
- Decor/season are cosmetic persona hooks → creative freedom; **no OE / neuroscience-accuracy gate** (base sprites carry the science). Confirmed.

## Next action (after /clear → /spec resume)

1. `/opsx:propose context-driven-variant-art` — fold the locked decisions above into proposal/design/tasks. Resolve the 元老-season sub-detail + CSS-vs-PNG-tint in design.
2. Then apply per the standard pipeline (apply → simplify → verify → /opsx:verify → archive → commit → push track-neurons; merge→main + deploy stay gated on a clean main worktree, same as provenance).

## Precondition status (all met as of 2026-06-02)

- track-neurons worktree clean; `origin/track-neurons` = `37873c0` (provenance `5ff6532` + question-figures `fb5d34c` + this decision commit). No active parallel session in this worktree.
- main NOT updated, prod NOT deployed — by design (per user: push track-neurons only).
