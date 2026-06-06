## Why

The 11 neuron families (= 11 國考 subjects) currently share only **4 colors** — one per NT branch (DA / 5-HT / GABA / Glu) — because `content-neurons-tw/scripts/build.ts` assigns each subject's `color` from a 4-entry `NT_COLOR[ntBranch]` map. Families within the same branch are visually identical (e.g. the 4 Glu subjects 解剖/生理/胚胎/微生物 are all the same green), so on the family-picker card wall they can only be told apart by sprite + name. This also contradicts the already-shipped `neurons-mode`「Connectome visual」 requirement, which mandates that any accent color previously signifying an NT-branch group SHALL no longer be presented as an NT-branch grouping signal — making the current 4-color-by-branch `subjects.json` a spec-vs-implementation drift.

## What Changes

- Give each of the 11 subjects a **distinct per-subject accent color** (single canonical source in `content-neurons-tw`), replacing the 4-color `NT_COLOR[ntBranch]` assignment in `build.ts`. Strategy: keep the 4 existing branch colors on one representative family each (4 anchors, no sprite change) + 7 new mutually-distinct colors.
- Add a canonical **exam-paper map** (醫學一 / 醫學二 + within-paper subject order, derived from the corpus) and re-group the family picker into **two rows by exam paper** (🧠 醫學一 一列 / 🔬 醫學二 一列, each in 試題順序), replacing the single flat grid. Responsive (RWD) reflow is deferred.
- Reconcile the stale NT-branch language in two specs: the family-picker requirement no longer asserts "NT-branch-derived accent color" or "NT-branch grouping SHALL be preserved" / branch-header scenarios; it now asserts per-subject distinct color + exam-paper grouping.
- **Out of scope (follow-up changes)**: (a) re-tinting the 7 changed families' sprites to match their new accent (their cards will temporarily show accent ≠ sprite, a known acceptable transient); (b) responsive reflow of the two-row layout on narrow viewports.
- No schema / sync change: `subjects.json` is static content-pack data (no Dexie bump, no R2 bundle, no adapter). `FAMILY_IDS` array order is left untouched (it is coupled to the maze grid border-entry order).

## Capabilities

### New Capabilities

_None._ The behavior fits within the existing family-picker requirements.

### Modified Capabilities

- `neurons-mode`: the「Overview SHALL surface a family subject picker」 requirement changes from "NT-branch-derived accent color" + "NT-branch grouping SHALL be preserved" (branch-header rows/scenarios) to **per-subject distinct accent color** + **exam-paper grouping (醫學一 / 醫學二) two-row layout**.
- `neurons-homepage`: the composed family grid changes from "single per-NT-branch family grid (4 branches DA/5-HT/GABA/Glu)" to **single family grid grouped by exam paper (醫學一 / 醫學二)**.

## Impact

- **Content build**: `packages/content-neurons-tw/src/families.ts` (+ canonical per-subject color map + exam-paper map), `packages/content-neurons-tw/scripts/build.ts` (per-subject color assignment). Rebuilt artifact `apps/neurons-tw/public/content/neurons-tw/subjects.json` (11 distinct `color` values; `group` field unchanged).
- **App UI**: `apps/neurons-tw/src/components/FamilyPicker.tsx` (two-row exam-paper layout). Card accent already reads `family.color` — no per-card color logic change.
- **Downstream auto-updates** (read `family.color`, no edit needed): mastery / variant-collection chips; the maze per-family tint (`MazeGrid` — owned by a concurrent session, NOT edited here; it inherits the new colors via the content pack — coordinate via session-bus).
- **Not touched**: `FAMILY_IDS` order (maze coupling), `character-card-render.ts` 4-NT internal colors, `statSchema` 4 player-stat colors, sprites (this change), any Dexie / R2 / Worker path.
