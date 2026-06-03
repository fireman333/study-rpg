## Why

Owner dogfood (2026-05-28): quiz-entry surface (`FamilyPicker` on Overview page) currently uses neuron-family persona names as the primary button label — e.g. `VTA Dopaminergic — Thrill-Seeker` instead of `藥理學`. Players who land on the page wanting to「練藥理」have to map family persona → 國考 subject in their head, which adds cognitive load and slows down the path to first question. The family taxonomy is the neuro-flavor reskin layer; it should accent the visual / collection surfaces (connectome, achievements, family-mastery) but NOT block subject-driven entry to practice.

## What Changes

- **`FamilyPicker` quiz-entry buttons** display the **國考 subject name** (canonical `subject.id`, e.g. `藥理學` / `解剖學` / `生物化學`) as the **primary** label.
- **Family persona name** (current `subject.displayName`, e.g. `VTA Dopaminergic — Thrill-Seeker`) demoted to **secondary / supporting** position on the same card — small caption / muted color, kept for flavor but not the searchable label.
- **Title attribute / tooltip** still includes both: `{subjectId} · {familyDisplayName} · {N} 題` so hover reveals the family identity.
- **No change** to: connectome page (`/connectome` — family persona names stay primary there), QuizModal interior (family flavor stays as quiz framing), achievements (`/achievements`), leaderboard, family-mastery surfaces.
- **No change** to underlying data: `subjects.json` schema unchanged; `subject.id` is already the canonical 國考 subject name; this is a **display-only realignment** in the picker component.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `connectome-collection`: family subject picker (the quiz-entry surface) SHALL display 國考 subject name as primary label and family persona as secondary. Existing requirement governing the picker (the「Overview SHALL surface a family subject picker that filters the active quiz pool」line in `neurons-mode` referenced by `FamilyPicker.tsx`) needs a modified scenario reflecting the new label hierarchy.

(Note: `neurons-mode` capability owns the high-level「surface a family subject picker」requirement but the picker's label hierarchy is a UI presentation contract that belongs in `connectome-collection`. If review prefers, the delta can move to `neurons-mode` — design.md will lock the placement after a quick spec re-read.)

## Impact

- **Code**: `apps/neurons-tw/src/components/FamilyPicker.tsx` — flip primary / secondary label binding in `FamilyCard`; trivial diff (~10 lines).
- **No data migration**: `subject.id` already canonical; build artifacts (`subjects.json`) unchanged.
- **No Dexie schema change**, no sync schema change, no R2 bundle change.
- **Visual**: card width may need a small tweak (subject names are 2–4 CJK chars, much shorter than family persona; could allow center-align without ellipsis).
- **A11y**: `aria-pressed` already on the button; `title` attr extended to include both labels — screen readers get both contexts.
- **Tests**: no Vitest impact (FamilyPicker has no current unit test); manual Chrome MCP smoke covers the visual swap.
- **Out of scope** (defer to sibling change `polish-neurons-clinical-machine-aesthetic`): card visual styling, color tokens, sprite frame, motion. This change is the surgical label-hierarchy flip only.
