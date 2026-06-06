# Tasks — REVISED 2026-06-05 to the D8 layered-tileset architecture

> The Wave-1/2 procedural approach (filled-brain → varied-wall pattern fill + stroke-carve) is SUPERSEDED by D8 (layered editable tileset). The generated histology element tiles are REUSED as background decor. Done-but-superseded items kept checked for provenance; the live build target is §3 onward.

## 1. Assets generated (Wave-1/2 — REUSE as background decor)

- [x] 1.1 codex histology element tiles generated + in `apps/neurons-tw/src/assets/maze/tiles/`: `element-neuro-{myelin,fiber,vesicle,sulci,astrocyte,spine}.png` (32px) + `neuro-soma-violet.png` + `wall-neuro-field.png` (the superseded mosaic) + `wall-brain.png`/`node-soma.png` (Wave-1, orphaned).
- [x] 1.2 brain/full palettes: `palette.png` + `brain-palette.png`.

## 2. Cleanup of the superseded WIP (do FIRST next session)

- [x] 2.1 `MazeGrid.tsx` Wave-1/2 render replaced by the procedural renderer; the orphaned helpers (`fiberTileFor`, `drawFiberCell`, `dirOf`, `SYNAPSE_UNDER_BY_CELL`, `WALL_PX_PER_CELL`, `strokePath`, `drawNeuropil`) are all gone (grep-confirmed: none remain).
- [~] 2.2 DEFERRED to an untracked-orphan sweep: the superseded `tiles/*.png` (incl. `wall-brain.png`, `node-soma.png`, `wall-neuro-field.png`) + alt `bg-neuropil-{ghost,dti}.png` are left UNtracked (not committed, not imported by the app) — a follow-up cleanup deletes them from disk. Commit stays clean (explicit per-file add never touches them).

## 3. Build the layered render data (D9 — procedural, no authored PNG tile sheet)

> D9 (design.md): Aseprite isn't installed, and the path/rim tiles are pure geometry → render the D8 layer model PROCEDURALLY from a precomputed cell mask + the existing element PNGs. No `maze_tileset_32.png`, no 16+16+24 PNG cells, no atlas re-bake.

- [x] 3.1 **Static maze masks** (precompute ONCE from `FAMILY_GRAPHS`, module-level): `PATH_LIST` = each family centerline dilated to a chunky 2–3-cell corridor, each cell carrying `{familyId, pathIndex}` (pathIndex → fog/explored); `RIM_LIST` = non-path cells adjacent (4-neighbour) to a path, with which sides face the corridor; `DECOR_LIST` = sparse seeded `element-neuro-*` placements on open cells (deterministic per-cell hash, CALM density).
- [x] 3.2 **No rim/path PNGs** — rim = a black edge strip drawn on each `RIM_LIST` cell's corridor-facing side(s); path = a filled family-colored block per `PATH_LIST` cell. Consistent + chunky by construction.
- [x] 3.3 **Background decor REUSES `element-neuro-*.png`** (myelin/vesicle/astrocyte/sulci/spine/fiber) as `bg_*`, drawn sparsely + faintly (calm — the 「太亂了」 fix), NOT a full-bleed mosaic.
- [x] 3.4 **Overlays**: soma = `neuro-soma-violet.png` at lit nodes; **synapse spark drawn procedurally** (white core + cyan halo + yellow rays, hollow outer) keyed to live synapse rows; center amber core procedural. No new AI image-gen.
- [x] 3.5 ~~Assemble tile sheet + index~~ — N/A under D9 (procedural). `maze-atlas.png` / `wall-neuro-field.png` / `tile-index.ts` become orphaned (flag at §5 verify; not deleted this round to keep the diff render-focused).

## 4. Layered renderer (`MazeGrid.tsx`) — fixed render order, procedural

- [x] 4.1 Layer ① background: one dark-tissue fill + sparse faint `DECOR_LIST` element blits (seeded, deterministic, calm).
- [x] 4.2 Layer ② wall-edge rim: iterate `RIM_LIST` (viewport-culled), draw a black strip on each corridor-facing side. Do NOT black-fill the whole non-path area.
- [x] 4.3 Layer ③ colored path: iterate `PATH_LIST` (viewport-culled), fill a family-colored chunky block; dim on unexplored route / bright on explored prefix (preserve fog). Width comes from the dilated mask, not a stroke.
- [x] 4.4 Layer ④ overlay: procedural synapse spark at live synapse cells (weight by state); soma PNG at lit nodeCells; amber core at center. `imageSmoothingEnabled=false`; keep existing wheel-zoom/drag-pan + contextual focus.
- [x] 4.5 Performance: iterate only the precomputed `PATH_LIST`/`RIM_LIST`/`DECOR_LIST` (a few thousand entries) with per-entry viewport bounds-check — NOT all 9801 cells/frame — so whole-maze zoom stays ~60fps.

## 5. Validate + spec + verify (gate before commit)

- [x] 5.1 Chrome MCP in-context (2026-06-06): brain backdrop + carved corridors + per-family routes + dense neuron-landmark sprites render; console clean; maze legible on top of the faint brain.
- [x] 5.2 Owner gate (2026-06-06): owner live-tuned via the DEV switcher and confirmed "Look OK" (brain 1.8× / mode A / soft edges / mid-density sprites).
- [x] 5.3 `neurons-brain-maze` spec delta updated: ADDED "Brain-image backdrop with neuron-symbol landmark overlays" requirement (2 scenarios); MODIFIED color-blind encoding still holds. `openspec validate --strict` green.
- [x] 5.4 `pnpm -r typecheck` · neurons test (359 pass) · `pnpm lint:dexie-fixtures` (no-op) · build. Zero schema/sync (no Dexie/R2 bump).

## 6. Final aesthetic (2026-06-06 owner live-tuning) — brain backdrop + landmark density

> The D9 procedural carved-corridor field is kept; this session layered the brain-read on top of it
> after a `/grill` locked "looks like brain" = neural wiring schematic + landmark sprites as the main lever.

- [x] 6.1 **Brain-image backdrop**: codex gpt-image-2 top-down brain (`bg-brain-hero.png`, muted teal/violet, two hemispheres + central fissure + fibers) blitted full-bleed behind the maze. Mode A (faint screen-blend, owner default) / Mode B (recede: brain hero + translucent maze) toggle. `BRAIN_SCALE` enlarges the brain to contain the whole maze (owner default 1.8×); `BRAIN_HERO_ALPHA` keeps it faint. All DEV-tunable, `import.meta.env.DEV`-gated.
- [x] 6.2 **Neuron-symbol landmark layer** (`maze-landmarks.ts`, new): ~48 sprites (mid-density) — 11 soma at tract origins, 8 synapse boutons at inner terminals, 18 astrocytes + 11 oligodendrocytes along the tracts/crossings. Anatomically grounded (OE consult 2026-06-06: soma at origin / synapse at terminals not crossings / glia tiling+interfascicular). Drawn UNDER the gold routes (continuity); fog-of-war preserved. Sprites = codex gpt-image-2 textbook-clear PNGs (`landmarks/{soma-multipolar,soma-pyramidal,synapse,astrocyte,oligodendrocyte}.png`).
- [x] 6.3 **Soft edge**: feather the four canvas edges into the dark frame (owner: 方形邊界不要那麼明顯). DEV-tunable.
- [x] 6.4 **Node-seed glyph** for lit nodes + faint unlit-node position pins (position only, no identity/rarity); rounded route bends (`arcTo`).
- [x] 6.5 **Circuit-location regression fix**: the D10 grid-graph rebuild had dropped all 116 `synapses[].location` names → re-ran `assign-circuit-locations.mjs` (116 unique names restored); updated `maze-graph.test.ts` stale assertions to the rebuilt 384×384 / 467-weave topology. 359 neurons tests green.
- [x] 6.6 DEV switcher kept (prod-stripped via `import.meta.env.DEV`): `腦當主角(B)` / `腦放大` dial / `柔化邊界` / `🧠 神經元地標` / `🧬 BG` / `◦ 未亮節點` for future live tuning.
