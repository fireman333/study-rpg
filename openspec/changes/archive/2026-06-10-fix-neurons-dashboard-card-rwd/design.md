## Context

The merged stat card (`ConnectomeStatCard.tsx`) renders the causal chain as a `flex-wrap: wrap` row of three stages separated by literal `→` spans, with `flex: 1 1 130px` (and `1 1 200px` for the DMN stage). On a 375px viewport the stages wrap to multiple lines and the arrow spans — being inline flex items — strand on their own lines, mis-aligned with the stages. The three total-collection chips sit below the card in a separate dark "signal"-themed `<section aria-label="進度狀態">`.

## Goals / Non-Goals

**Goals:**
- The causal chain reads cleanly at every width: horizontal (→) on wide, vertical stack (↓) on narrow, arrows never orphaned.
- Fold the 🧬/💎/📖 collection chips into the card in its cream theme, RWD-safe.

**Non-Goals:** any data/schema/sync change; changing which values are shown; touching the maze or other surfaces.

## Decisions

### D1 — CSS media queries (not JS) for the responsive stage row
Drive the stage-row direction + arrow orientation + per-stage flex from `styles.css` classes, not a `matchMedia`/resize-listener in JS. Mobile-first default = `flex-direction: column` (stages full-width, `flex: 0 0 auto`) with `.neurons-stat-arrow { transform: rotate(90deg) }` turning `→` into `↓`; at `@media (min-width: 520px)` switch to `flex-direction: row` with `flex: 1 1 130px` (200px for the DMN stage) and `transform: none`. CSS handles reflow with zero JS re-render cost and no resize jank.
- *Alternative considered*: `matchMedia` hook + conditional render — rejected, adds a resize listener + re-renders for what CSS does natively; the arrow glyph rotates for free.

### D2 — Fold the collection chips into the card, re-themed cream
Pass `variants` / `dmnOwned` / `totalStudyMin` into `ConnectomeStatCard` and render a bottom chip row inside the card using the card's cream/brown palette (not the dark `--signal-*` strip). The chips wrap (`flex-wrap`) on narrow. Remove the standalone `進度狀態` `<section>` and its now-unused `status*` styles from `OverviewPage`. Chip semantics (🧬 = collected count, 💎 = DMN owned /20, 📖 = cumulative reading min) are unchanged — only the container + theme move.

## Risks / Trade-offs

- [520px breakpoint feels off on mid-size tablets] → 520px is a single value in `styles.css`, trivially tunable after the owner eyeballs real devices.
- [Re-theming chips loses the clinical-signal look] → that strip's dark aesthetic was intentional, but the owner explicitly asked the folded chips to match the card theme; the values/semantics are preserved.
- [Removing `status*` styles orphans an import] → after removing the strip, drop any now-unused `EmojiIcon` import from `OverviewPage` (typecheck `noUnusedLocals` enforces).

## Migration Plan

Presentation-only; batches with the maze-lite change into one `track-neurons → main` deploy. Owner verifies the card on a real iPhone (vertical stack + ↓ arrows + folded chips) post-deploy; the 520px breakpoint is tunable.

## Open Questions

(none — breakpoint value is owner-tunable.)
