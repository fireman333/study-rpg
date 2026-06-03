## Context

The neurons-tw Overview page is the daily-driver entry point. Its `FamilyPicker` component renders an 11-chip grid (grouped by 4 NT branches: DA / 5-HT / GABA / Glu) that lets the player narrow the quiz pool to a single family before launching the QuizModal. Each chip currently renders the family persona name (e.g. `VTA Dopaminergic — Thrill-Seeker`) as the **primary** visible label, with the 國考 subject identifier (`subject.id`, e.g. `藥理學`) NOT shown on the chip at all — it only appears in `title` tooltip and in `selectedHint` text below.

Owner 2026-05-28 dogfood feedback: this hierarchy inverts what the player needs at this surface. The player's mental model is「練藥理 / 練解剖」(國考 subject); the family persona is reskin flavor that belongs at the connectome / collection / achievement layer, not at the practice-entry layer. Players reading 11 distinct family persona names cannot quickly find the subject they want.

Confirmed by code read:
- [FamilyPicker.tsx:99-131](apps/neurons-tw/src/components/FamilyPicker.tsx:99) — `FamilyCard` derives `primary` and `persona` from splitting `family.displayName` on `—`; this is what the chip shows
- [subjects.json](apps/neurons-tw/public/content/neurons-tw/subjects.json) — `subject.id` is already the canonical 國考 name (`藥理學`, `公共衛生學`, `寄生蟲學` ...); `displayName` is the family persona; no schema change needed
- [neurons-mode/spec.md:468–510](openspec/specs/neurons-mode/spec.md:468) — the requirement governing this picker; specifically line 479 says chips "SHALL source identity from the `content-neurons-tw` family roster (family `displayName`, family sprite key ...)". This sentence needs the modified scenario to lock label hierarchy.

## Goals / Non-Goals

**Goals:**
- Quiz-entry button's PRIMARY visible label = 國考 subject name (`subject.id`).
- Family persona name (`subject.displayName`) demoted to SECONDARY supporting text on the same card.
- Preserve discoverability of family identity via title tooltip + connectome page + quiz modal flavor.
- Minimal code churn (~10–15 lines in one file).
- Zero data / schema / API changes.

**Non-Goals:**
- ❌ Renaming families (catalog unchanged).
- ❌ Removing family persona name from the card entirely (still shown as secondary, plus on hover).
- ❌ Visual polish of the card (colors / sprites / motion / spacing) — that's `polish-neurons-clinical-machine-aesthetic` (sibling change).
- ❌ Changing connectome page family-label rendering (family stays primary there).
- ❌ Changing QuizModal interior (family flavor stays as quiz framing).
- ❌ Changing achievements / leaderboard / family-mastery surfaces.
- ❌ Hardcoding 11 國考 names in app code (still source from `subject.id` in content pack).

## Decisions

### D1: Modified capability = `neurons-mode`, not `connectome-collection`

The requirement "Overview SHALL surface a family subject picker that filters the active quiz pool" lives in `neurons-mode` (line 468). The picker's label hierarchy is part of that requirement's normative behavior (line 479 specifies what chip identity sources from). The delta scenario MODIFIES the picker behavior under `neurons-mode`.

`connectome-collection` spec is NOT touched — it governs the connectome visual layer (synapse formation rules, family node rendering on the SVG tree, etc.) which keeps family persona names as primary.

**Alternatives considered:**
- Put delta in `connectome-collection`: rejected because the picker is on Overview page, not connectome page. Picker is a separate surface from the connectome SVG tree.
- Create a new sub-capability `neurons-quiz-entry-picker`: rejected as over-decomposition for a label-hierarchy refinement. The existing requirement covers it.

### D2: Primary = `subject.id`; Secondary = `subject.displayName` (full family persona)

Card layout becomes (top → bottom):
1. **Sprite frame** (unchanged)
2. **Primary label**: `subject.id` (e.g. `藥理學`) — large, bold, center
3. **Secondary label**: `subject.displayName` full text (e.g. `VTA Dopaminergic — Thrill-Seeker`) — small, muted, 1-line ellipsis
4. **Count chip** (unchanged: `{N} 題`)

Do NOT pre-split `displayName` on `—` anymore at the picker layer — display the full family persona as one line (truncated with ellipsis on narrow). Splitting on `—` was a workaround to fit the long persona into 2 lines when it was the primary label; once demoted to secondary, single-line ellipsis is cleaner.

**Why keep `displayName` visible at all on the chip:**
- Preserves the reskin flavor at the entry point (player still sees "I'm picking the dopamine family" alongside "I'm picking pharmacology")
- Provides a soft on-boarding bridge for new players learning the family taxonomy
- Avoids making the picker chip look completely 非-neuro themed

**Alternatives considered:**
- Hide `displayName` entirely from chip (only tooltip): rejected — strips too much flavor at the entry surface; player needs visual reinforcement of family identity to build mental model over weeks of play.
- Show only primary subject (`subject.id`) on chip, but persona on hover **and** in `selectedHint` below: viable but loses inline flavor; rejected for now, can reconsider in polish change if owner finds the secondary line cluttering.

### D3: `title` attribute extends to include both labels

```
title={`${subject.id} · ${subject.displayName} · ${subject.totalQuestions} 題`}
```

Screen readers + power users get both contexts on hover. Currently the tooltip only includes `displayName` + count.

### D4: `selectedHint` (the dashed-border banner below the picker when family is selected) MODIFIED to lead with subject

Current text: `🎯 練習範圍鎖定：<displayName>（點「全部」恢復跨科隨機）`
New text: `🎯 練習範圍鎖定：<subject.id>（<displayName>）— 點「全部」恢復跨科隨機`

Subject name leads, family persona follows in parens. Reinforces the same hierarchy as the chip itself.

### D5: Card width / typography minor tweak

Current `width: 102` was sized to fit a 2-line family persona split (lines 222-238 of `FamilyPicker.tsx`). With primary now a short 2-3 CJK char subject name, the card can:
- Keep width 102 (no churn)
- Primary text size bumps slightly (0.72rem → 0.85rem feels right for short Chinese)
- Secondary text size drops (0.62rem → 0.6rem, still legible)
- Allow secondary text to ellipsize at 1 line — no more 2-line persona split

Width itself unchanged to avoid layout reflow across the 11-card grid.

### D6: No new test required for this change

`FamilyPicker` has no Vitest coverage today (it's pure presentation). This change does not add logic — only flips which field is primary vs secondary. Manual Chrome MCP smoke is sufficient verification:
- Open `/` (Overview) → confirm 11 chips show 國考 subject names primary
- Hover any chip → tooltip shows both
- Click `藥理學` → `selectedHint` banner shows subject leading + persona in parens
- Open `/connectome` → confirm family persona names still primary there (no spillover)
- Open quiz modal → confirm family flavor still surfaces

Adding a `FamilyPicker.test.tsx` is YAGNI for this scope; deferred to sibling polish change if owner wants it then.

## Risks / Trade-offs

- **[Risk]** Players who've been playing for weeks may have built mental model around family persona names → switch causes mild confusion → **Mitigation**: family persona kept as secondary on card + still primary on connectome/achievements; tooltip exposes both. Owner is sole dogfooder right now; can iterate if external players land.
- **[Risk]** Card height changes slightly (drop from 2-line primary to 1-line + secondary) → minor layout reflow across grid → **Mitigation**: keep `width: 102` constant; height tweak is naturally absorbed by `flex-wrap` in the branch row.
- **[Trade-off]** Spec gets slightly more prescriptive (label hierarchy now spec'd, was implicit before) → **Decision**: acceptable; the picker is the primary daily-driver entry point and merits an explicit normative contract.
- **[Risk]** Sibling `polish-neurons-clinical-machine-aesthetic` change may want to re-design the picker card entirely (e.g. waveform-style chip) → **Mitigation**: this realign keeps the chip semantically clean (clear primary / secondary slots); polish can restyle visually without re-debating label hierarchy.

## Migration Plan

- **Deploy**: standard Cloudflare Pages + GH Pages deploy via existing pipelines. No DB migration. No content rebuild. No worker change.
- **Rollback**: revert the single commit; no data state to unwind.
- **User communication**: none needed (UI clarity improvement, no breaking change).

## Open Questions

- None for this change. (Polish-related visual questions parked for sibling `polish-neurons-clinical-machine-aesthetic`.)
