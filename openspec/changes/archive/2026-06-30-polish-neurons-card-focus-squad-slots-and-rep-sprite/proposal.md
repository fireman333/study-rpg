## Why

Three prod-feedback polish items on the just-shipped `redesign-neurons-homepage-squad-and-maze-focus` (owner, on `med-study-rpg.com/neurons/`):

1. The new 🔍 聚焦 button sits in the family-card **header**, stealing width so even the short subject name (e.g. 解剖學) truncates to「解…」.
2. The `/collection` 神經元遠征隊 (SquadManager) slots are fixed at `clamp(96px,18vw,120px)`, so longer member names (e.g.「行為仲裁大師 · 共振核心」/「神經感官至尊 · 神經元始祖」) wrap to multiple lines.
3. The homepage family-card header sprite is the generic per-subject icon — it does NOT reflect the representative variant the player picked in 圖鑑, so the two surfaces feel disconnected.

## What Changes

- **Family-card 聚焦 placement (layout polish, no normative change):** move the 🔍 聚焦 button out of the card header onto the **AP row** (right-aligned, same row as `AP n`, below the X/20 axon bar). The header is now just sprite + full name → the subject name no longer truncates. Keep the existing focus behavior unchanged (the button still calls `onFocus`); add an explicit `aria-label` for the icon-only (<768px) state.
- **SquadManager slot width (layout polish, no normative change):** the 5 squad slots now **evenly split the container width** via a CSS grid (`repeat(5, minmax(0,1fr))`), reflowing to 3 then 2 columns on narrower viewports (no horizontal scroll). The fixed per-slot clamp width is dropped; member names fit on one line on desktop (the 2-line clamp stays as a graceful fallback on narrow mobile slots).
- **Family-card representative sprite (NEW behavior — spec delta):** each homepage family card's header sprite now renders that family's **representative variant** (the one chosen on `/collection`), kept in sync via the shared `representativeVariants` meta key, falling back to the generic subject sprite when no representative is set. A new reactive `useRepresentativeRows()` hook (in `representatives.ts`) drives this.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `neurons-homepage`: ADD a requirement that the family card's header sprite reflects the family's representative variant (synced with the `/collection` representative selection), with a generic-subject-sprite fallback.

## Impact

- **Code (apps/neurons-tw):** `components/FamilyPicker.tsx` (聚焦 → AP row + representative-sprite render via `VariantSprite`), `components/SquadSurfaces.tsx` (slot grid className, drop fixed width), `lib/services/representatives.ts` (new `useRepresentativeRows` hook), `styles.css` (`.neurons-squad-slots` grid rules).
- **Data / sync:** none — reuses the existing `representativeVariants` + `activeSquad` meta keys; no Dexie / R2 schema bump.
- **Cross-cutting invariants preserved:** reduced-motion, SPA direct-URL + F5, single `MazeGrid` canvas, the maze focus/recenter API.
