## Context

`apps/neurons-tw` renders an 11-card family picker on the homepage. Each card's accent comes from `Subject.color`, which `packages/content-neurons-tw/scripts/build.ts` currently sets to `NT_COLOR[ntBranch]` — a 4-entry map (DA `#d4a04d` / 5-HT `#c44d4d` / GABA `#6a9bc4` / Glu `#6a8c3f`). Result: the 11 subjects carry only 4 distinct colors; same-branch families are visually identical (4 Glu subjects all share one green).

The `neurons-mode`「Connectome visual SHALL use Linnean taxonomy」 requirement already forbids player-facing NT-branch color grouping, so the 4-color-by-branch `subjects.json` is a standing spec-vs-impl drift. Two other requirements (`neurons-mode`「Overview … family subject picker」 and `neurons-homepage`「compose … family-detail grid」) still contain stale "NT-branch-derived accent color" + "per-NT-branch family grid" + branch-header language, even though the live `FamilyPicker.tsx` is already a flat grid with no branch headers.

**Concurrency constraint**: a separate session is actively rewriting the maze in this same worktree (`redesign-neurons-maze-brain-tileset`; dirty files include `MazeGrid.tsx`, `graph.ts`, `grid-graph.json`, maze tiles, and `meta.json`). `FAMILY_IDS` (in `families.ts`) is the maze's border-entry order, coupled to the committed `grid-graph.json`. This change must not touch any maze-owned file, must not reorder `FAMILY_IDS`, and must not commit the maze session's `meta.json` churn.

## Goals / Non-Goals

**Goals:**
- Each of the 11 subjects gets a distinct, mutually-discernible accent color, sourced from one canonical map.
- The family picker groups cards by exam paper (醫學一 / 醫學二) in 試題順序, replacing the implicit NT-branch grouping.
- The two affected specs stop asserting NT-branch grouping/coloring (reconcile drift).
- Minimize sprite rework: 4 families keep their branch color exactly (zero sprite change).

**Non-Goals:**
- Re-tinting the 7 changed families' sprites (separate follow-up change). A transient card-accent ≠ sprite-tint for those 7 is accepted.
- Responsive (RWD) reflow of the two-row layout on narrow viewports (follow-up).
- Touching `character-card-render.ts` 4-NT internal colors or the `statSchema` 4 player-stat colors (different concepts).
- Any Dexie / R2 bundle / Worker / sync change.
- Reordering `FAMILY_IDS` or editing any maze-owned file.

## Decisions

### D1 — Per-subject color is a single canonical map in `content-neurons-tw`
A new `FAMILY_COLOR: Record<string, string>` (11 entries) lives beside `FAMILY_NT_BRANCH` in `packages/content-neurons-tw/src/families.ts`, mirroring the established D2 single-source pattern. `build.ts` reads `FAMILY_COLOR[id]` instead of `NT_COLOR[ntBranch]` for the subject `color`. The `group` field (= NT branch) is **unchanged** — it still feeds context-art / internal derivations. _Alternative rejected_: overriding color at the app/theme layer would split the source of truth (browse UI 11 colors vs maze 4 colors) — violates canonical-form principle.

### D2 — Palette: keep 4 branch anchors + 7 new distinct colors (LOCKED by user)
The 4 established branch colors are retained on one representative family each (zero sprite change); the other 7 get new mutually-distinct colors. Per-subject palette (user-confirmed, one decision per subject):

| 卷別 | 科目 | color | 類型 |
|---|---|---|---|
| 醫學一 | 解剖學 | `#6a8c3f` | anchor (Glu green) |
| 醫學一 | 胚胎學 | `#7e7b25` | new |
| 醫學一 | 組織學 | `#c44d4d` | anchor (5-HT red, H&E) |
| 醫學一 | 生理學 | `#27866f` | new |
| 醫學一 | 生物化學 | `#6a9bc4` | anchor (GABA blue) |
| 醫學二 | 微生物學 | `#278634` | new |
| 醫學二 | 免疫學 | `#696cd3` | new |
| 醫學二 | 寄生蟲學 | `#ca4970` | new |
| 醫學二 | 公共衛生學 | `#c639ba` | new |
| 醫學二 | 藥理學 | `#d4a04d` | anchor (DA gold) |
| 醫學二 | 病理學 | `#9859cf` | new |

Anchors (no sprite change): 解剖學, 組織學, 生物化學, 藥理學. New (sprite re-tint follow-up): the other 7. _Alternatives rejected_: an even hue gradient (maximal distinction but every sprite needs re-tint), and a fully sprite-color-anchored palette (colors crowd in the warm band because sprites only carry ~4 NT-tinted hues).

### D3 — Anchors keep their exact light colors
`#d4a04d` (gold) and `#6a9bc4` (blue) have low text-on-white contrast (2.35 / 2.96). These are **pre-existing** values already shipping in the live app; keeping them exact is the user's explicit choice (no regression). The 7 new colors are tuned to ≥ 4.4:1 on white.

### D4 — Exam-paper grouping is new canonical data; display-only; `FAMILY_IDS` untouched
A new `FAMILY_EXAM_PAPER` map (subject → `醫學一 | 醫學二`) plus an ordered list per paper is added to `content-neurons-tw`. The split + within-paper order was derived empirically from the corpus (each subject assigned to its dominant book, ordered by median qNumber), recovering the official 第一階 composition:
- 醫學一: 解剖學 → 胚胎學 → 組織學 → 生理學 → 生物化學
- 醫學二: 微生物學 → 免疫學 → 寄生蟲學 → 公共衛生學 → 藥理學 → 病理學

`FamilyPicker.tsx` partitions `pack.subjects` by this map and renders two labelled rows. This is **display-only**: `subjects.json` array order and `FAMILY_IDS` stay as-is (the latter is maze-coupled). _Alternative rejected_: reordering `subjects.json` / `FAMILY_IDS` to exam order — risks the concurrent maze session + any index-coupling.

### D5 — Protect the concurrent maze session's working tree
`build.ts` rewrites `meta.json` (a `builtAt` timestamp) which the maze session has already modified (dirty). After rebuild, restore `meta.json` to the maze session's version (`git checkout` / leave their change intact) so this change commits only `subjects.json`. Stage explicitly file-by-file; never `git add -A`. Notify the maze session via session-bus that `subjects.json` colors changed (their `MazeGrid` per-family tint will pick the new colors up automatically).

### D6 — Sprite re-tint deferred
The 7 new-color families keep their current (NT-tinted) sprites this change. Cards will show accent ≠ sprite for those 7 until a follow-up `retint-neurons-subject-sprites` change regenerates them. Acceptable transient; flagged in the proposal.

## Risks / Trade-offs

- **Concurrent maze session corrupts the commit** → explicit per-file `git add subjects.json` + the two content-src files + spec/change files; `git diff --cached --name-status` before commit; restore `meta.json`; never touch `MazeGrid.tsx` / `graph.ts` / `FAMILY_IDS` / maze tiles.
- **Low-contrast gold/blue anchor text** → accepted (pre-existing, user-confirmed). Not regressing.
- **Transient card-accent ≠ sprite for 7 families** → flagged; follow-up re-tint change.
- **Exam-paper map could drift from corpus** → derived once from the shipped corpus and encoded as canonical data with the derivation documented; subjects are stable.
- **`questions.json` rewrite on rebuild** → colors live in `subjects.json`, not `questions.json`; verify `questions.json` is byte-identical after rebuild (no incidental diff) before staging.

## Migration Plan

1. Edit `families.ts` (+`FAMILY_COLOR`, +`FAMILY_EXAM_PAPER`/order) and `build.ts` (use per-subject color).
2. Rebuild the content pack (`MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-neurons-tw build`) → copy `subjects.json` to `apps/neurons-tw/public/content/neurons-tw/`. Restore `meta.json`; confirm `questions.json` unchanged.
3. Update `FamilyPicker.tsx` to two-row exam-paper layout.
4. Update the two spec deltas; rebuild app; Chrome MCP smoke (11 distinct card colors + two labelled rows; SPA route OK).
5. **Rollback**: revert `build.ts` + `families.ts` + `subjects.json` + `FamilyPicker.tsx`; pure content/UI, no data migration, no persisted state touched.

## Open Questions

_None._ Palette, strategy, ordering, layout, and contrast handling are all user-confirmed.
