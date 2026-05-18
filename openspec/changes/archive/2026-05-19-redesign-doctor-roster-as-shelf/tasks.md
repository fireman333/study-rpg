## 1. Component refactor — HospitalScene.tsx

- [x] 1.1 Add `SHELF_ROW_LAYOUT: SlotPosition['room'][][]` module-level constant defining 2-rank layout (`[['outpatient'], ['ward', 'surgery']]`)
- [x] 1.2 Add `ROOM_LABEL: Record<SlotPosition['room'], string>` mapping ward/outpatient/surgery → 病房/門診/開刀房
- [x] 1.3 Replace `filled` overlay computation in `useMemo` with `shelfByRoom` + `groups` structure (filled doctors first, then padding empty cells per slot capacity)
- [x] 1.4 Remove old `<img className="hospital-scene__doctor">` overlay JSX from inside `.hospital-scene__canvas`
- [x] 1.5 Restructure JSX: `<section.hospital-scene>` contains `<div.hospital-scene__canvas>` (clickable, renders bg PNG) + `<div.doctor-shelf>` sibling
- [x] 1.6 Render shelf as `SHELF_ROW_LAYOUT.map((rowRoomTypes, rowIdx)) => <div.doctor-shelf__rank>` containing one or more `<div.doctor-shelf__group>` (each with header + scrollable row)
- [x] 1.7 Each cell: filled variant displays sprite + name + subject + rarity-class border; empty variant displays "?" placeholder + dashed border + hatch background
- [x] 1.8 Move click handler from `<section>` to `<div.hospital-scene__canvas>` so only the building (not the shelf) opens the upgrade modal
- [x] 1.9 Keep orphan-room skip behavior but remove the `console.warn` (per ADDED + REMOVED requirements in spec delta)

## 2. CSS — styles.css

- [x] 2.1 Update `.hospital-scene` to flex column (canvas + shelf vertically stacked, center-aligned)
- [x] 2.2 Move click/cursor/focus-visible from `.hospital-scene` to `.hospital-scene__canvas`
- [x] 2.3 Remove `.hospital-scene__doctor` absolute-positioned overlay rule
- [x] 2.4 Add `.doctor-shelf` flex column, `max-width: 700px`, gap: 10px
- [x] 2.5 Add `.doctor-shelf__rank` flex row with `gap: 8px`, `justify-content: center` (centers content under canvas)
- [x] 2.6 Add `.doctor-shelf__group` flex column with `gap: 4px`; each group sized by its row's natural content width
- [x] 2.7 Add `.doctor-shelf__group-header` (label + count) with Cubic 11 / Press Start 2P fonts
- [x] 2.8 Add `.doctor-shelf__row` flex row with `gap: 8px` (matches rank gap so cells align across ranks), `overflow-x: auto`
- [x] 2.9 Add `.doctor-shelf__cell` (84 px wide, paper-bg, wood-dark border, rarity-conditional border color)
- [x] 2.10 Add `.doctor-shelf__cell--p1` through `--p5` rarity color variants
- [x] 2.11 Add `.doctor-shelf__cell--empty` (dashed, 0.55 opacity)
- [x] 2.12 Add `.doctor-shelf__sprite-frame` (64×64 px frame) + `--empty` variant with 45° diagonal hatch
- [x] 2.13 Add `.doctor-shelf__sprite` (64×64 px image, `image-rendering: pixelated`)
- [x] 2.14 Add `.doctor-shelf__placeholder` (28 px Press Start 2P "?")
- [x] 2.15 Add `.doctor-shelf__name` + `--empty` variant + `.doctor-shelf__subject`
- [x] 2.16 Add mobile `@media (max-width: 768px)` rule shrinking cell to 72 px, sprite-frame + sprite to 56 px

## 3. Verify

- [x] 3.1 Run `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` and confirm no new errors in `HospitalScene.tsx` (pre-existing `tick.ts` errors out of scope) — pass, no errors
- [x] 3.2 Start dev server (`pnpm --filter @study-rpg/medexam2-hospital-tw dev`) and open in Chrome MCP — port 5175, tabId 275642107
- [x] 3.3 Verify DOM: 2 `.doctor-shelf__rank` elements; rank 1 = 門診 group, rank 2 = 病房 + 開刀房 groups; old `.hospital-scene__doctor` overlay class = 0 occurrences — verified via `javascript_tool`
- [x] 3.4 Verify alignment math via `getBoundingClientRect`: for each column `i in [0..6]`, `rank1_cells[i].left === rank2_cells[i].left` — both ranks `[610, 702, 794, 886, 978, 1070, 1162]`
- [x] 3.5 Verify centering: `canvas_center === rank1_center === rank2_center` (within 1 px) — all = 960
- [x] 3.6 Visual screenshot via `mcp__computer-use__screenshot`: medical center tier (default dev save) shows 醫院 PNG above + 2-rank shelf below, no sprite overlapping building — captured
- [ ] 3.7 Sanity check on 區域醫院 tier: shelf renders with 病房 0/2 + 門診 0/7 + 開刀房 0/3 = 12 total cells distributed across 2 ranks (manual smoke if dev save reaches that tier) — DEFERRED: current dev save is 醫學中心 tier; math is identical (3+7+4 vs 2+7+3 both fit 2-rank layout per `SHELF_ROW_LAYOUT`), no logic specific to 醫學中心 in renderer
- [x] 3.8 Confirm clicking shelf cell does NOT open `<UpgradeModal>`; clicking hospital canvas DOES open it — verified by code: `onClick` handler attached only to `.hospital-scene__canvas`, not to `.doctor-shelf` or `.doctor-shelf__cell`

## 4. Spec sync + archive

- [x] 4.1 Run `openspec validate redesign-doctor-roster-as-shelf` (or `openspec status --change ... --json`) and confirm all artifacts `done` — passed
- [x] 4.2 Run `/opsx:verify` to check completeness / correctness / coherence — passed (1 deferred task acknowledged, 0 critical, 0 warnings)
- [x] 4.3 Run `/opsx:archive` to merge delta into `openspec/specs/hospital-scene/spec.md` — delta synced via subagent + folder moved to `archive/2026-05-19-redesign-doctor-roster-as-shelf/`
- [ ] 4.4 Commit (template: `spec(archive): merge redesign-doctor-roster-as-shelf — doctor sprites move from scene overlay to roster shelf`) — explicit user confirm before `git commit`
