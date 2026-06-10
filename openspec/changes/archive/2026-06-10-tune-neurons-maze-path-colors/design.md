## Context

`MazeGrid.tsx` Layer ② renders each family route as a gold myelin sheath with a family-colour axon core on top, in two passes (unexplored baseline + explored prefix). Current weights: `sheathW = max(2, 1.05·tile)`, `coreW = max(1, 0.4·tile)`, unexplored gold `alpha 0.2`, unexplored family core `alpha 0.4`. The gold band is ~2.6× the core width, so the family colour reads as a thin line over a wide gold path → routes look uniformly gold. The renderer comment already records "owner: gold no longer sacred", so de-emphasising gold in favour of the family colour is the intended direction.

## Goals / Non-Goals

**Goals:**
- The 11 family colours become the dominant, glance-legible identity of each corridor, satisfying the existing "colour-traceable end to end" scenario in practice.
- Keep the gold myelin / nodes-of-Ranvier visual metaphor as a frame/accent (don't delete it).

**Non-Goals:**
- No change to routes, autotiling, fog, economy, node/shape encoding, schema, or sync.
- No new per-family atlas art (colours stay tinted from the single neutral set / `enc.color`).

## Decisions

### D1 — Widen the family-colour core and raise its unexplored alpha (over narrowing the sheath)
Increase `coreW` from `0.4·tile` to ~`0.6·tile` so the family colour is the corridor's central band (~57% of the sheath width, leaving gold as a frame on each side), and raise the unexplored-baseline family-core alpha from `0.4` to ~`0.55` so colour is traceable even before exploration. Prefer widening the core (additive, keeps the myelin sheath intact as a frame) over shrinking the sheath (which would erode the brain-fiber read). The gold unexplored alpha may drop slightly (`0.2 → ~0.18`) so it recedes behind the colour, but the sheath width stays so the myelin metaphor survives.
- *Alternative considered*: invert by making gold the thin line and family colour the wide band — rejected, loses the "myelin wraps the axon" read the theme depends on.

### D2 — Tune constants only; no structural change
The change is confined to the Layer ② stroke-weight/alpha constants. The two-pass (unexplored baseline + explored prefix) structure, dashing (internodes / nodes of Ranvier), rounded bends, and the explored bright sheath+highlight are all unchanged — the explored prefix already draws the family core at full alpha, so only the *width* needs to grow there.

## Risks / Trade-offs

- [Too-wide core swallows the gold entirely, losing the myelin look] → cap the core at ~0.6·tile so a visible gold frame remains on both edges; verify on the live maze that gold is still perceptible as a sheath.
- [Brighter/wider colour reduces fog-of-war contrast for unlit pins] → unlit node pins (Layer ③a) and fog are separate layers, unchanged; the corridor baseline staying at a moderate alpha keeps lit nodes the hero.
- [Color-blind regression] → node colour + node-shape + distinct spatial route are unchanged, so the redundant encoding requirement still holds; this change only strengthens the colour channel.

## Migration Plan

Presentation-only; no data/rollback implications. Verify via the live maze (Chrome MCP / local eyeball): 11 routes show distinct subject colours, gold still frames them, fog/nodes unaffected. Rolls into the batched `track-neurons → main` merge with Changes A and C.

## Open Questions

(none — exact final constants are dogfood-tunable; the spec locks the *relationship* "family colour dominant, gold framing", not the literal numbers.)
