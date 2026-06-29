## Context

Follow-up polish to `redesign-neurons-homepage-squad-and-maze-focus`. All three items are presentational; only the representative-sprite sync introduces a new (read-only, derived) behavior. No data/schema changes. Codex consulted on the two layout tweaks (both confirmed sound).

## Goals / Non-Goals

**Goals:** stop the family-card subject name truncating; make the 5 squad slots evenly fill the container so member names stop wrapping; make the homepage family-card sprite reflect the player's chosen 圖鑑 representative.

**Non-Goals:** no change to the focus mechanic, the squad data model, the representative selection mechanic, or any Dexie/R2 schema. Not redesigning the card body or the dex.

## Decisions

### D1 — 聚焦 button moves to the AP row (not the header)
The header gives its full width back to the name block (`flex:1; minWidth:0`); the 聚焦 button moves into the AP line, which becomes a flex row `[AP n] … [🔍 聚焦]` (`justify-content: space-between`). The button keeps its existing style/behavior; an explicit `aria-label` is added because the「聚焦」label is `display:none` < 768px (icon-only). *Alternative considered:* shrink the header sprite or hard-cap the name — rejected; the button simply doesn't belong in the identity row.

### D2 — SquadManager slots become an even 5-column grid
`.neurons-squad-slots { display:grid; grid-template-columns: repeat(5, minmax(0,1fr)) }`, dropping the inline `clamp()` width. Mobile reflows to `repeat(3,…)` < 768px and `repeat(2,…)` < 430px (no horizontal scroll — this is a core management surface, per Codex). The slot name keeps its 2-line clamp (graceful on the narrower mobile slots) rather than switching to nowrap+ellipsis (which would truncate long names on mobile). Remove-× stays absolute in the (still `position:relative`) slot; the wider slots keep it clear of the centered name.

### D3 — Family-card sprite = representative variant (new `useRepresentativeRows` hook)
A new reactive hook `useRepresentativeRows(): Map<familyId, NeuronVariantRow>` (in `representatives.ts`, mirroring `useActiveSquad`) liveQueries the `representativeVariants` meta + `neuronVariants`, dropping stale (uncollected) representatives. `FamilyPicker` calls it once and passes each family's `repRow` to its card; the card renders `<VariantSprite row={repRow} />` when present, else the generic `subject:<id>` sprite. This keeps the homepage card and the `/collection` dex showing the same chosen variant, with zero new persistence (reuses the existing synced `representativeVariants` key).

## Risks / Trade-offs

- **Extra liveQuery subscription on the homepage** (the rep hook) → negligible; it mirrors the existing `useActiveSquad` / mastery-chip subscriptions. *Mitigation:* single subscription at the `FamilyPicker` level, not per-card.
- **A representative pointing at an uncollected variant** → the hook drops it (stale-filtered), so the card falls back to the generic sprite (no broken image).

## Migration Plan

Pure client-side presentation. Deploy via the standard CF Pages pipeline. Rollback = revert the commit (nothing persisted in a new shape).

## Open Questions

None.
