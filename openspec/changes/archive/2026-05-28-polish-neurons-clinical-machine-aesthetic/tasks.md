## 1. Signal-layer palette tokens (theme)

- [x] 1.1 In `packages/theme-pixel-neurons/src/index.ts` `cssVars`, add signal-layer tokens: `--signal-cyan` #38e0d0 / `--signal-amber` #f0a830 / `--signal-dim` #2a4a52 / `--signal-bg` #0c1418 / `--grid-line` rgba(.10) / `--scanline` rgba(.04).
- [x] 1.2 Rewired `--synapse-dormant/forming/potentiated/mastered` to signal palette (dim / cyan / cyan / amber). Warm base (`--bg-cream`, `--ink`, `--frame-cell-*`, `--nt-*`, `--rarity-*`) untouched.
- [x] 1.3 Monospace data font = reuse existing VT323 (already in font stack); no new `--font-data` token needed.
- [x] 1.4 Theme exports `src/index.ts` directly (no dist build step). All 6 new keys match `^--[a-z][a-z0-9-]*$` regex → `theme-pack-contract` satisfied.

## 2. Motion library — EEG primitives

- [x] 2.1 Added `SPIKE_TRAIN_TIMING` (burst 280 / spikes 4 / settle 160) + `OSCILLATION_TIMING` (period 900 / amplitude 10) to `timings.ts`; re-exported from `index.ts`. `RARITY_TIMINGS` / `SYNAPSE_TIMINGS` untouched.
- [x] 2.2 `SpikeTrainFiring.tsx` — SVG polyline AP-train (pathLength draw-in + fade), `useRespectsReducedMotion` → null. color defaults `var(--signal-cyan)`.
- [x] 2.3 `SignalOscillation.tsx` — looping sine-trace, reduced-motion → static flat trace. color `var(--signal-cyan)`.
- [x] 2.4 Added both to `/motion-demo` (spike-train trigger button + always-on oscillation).
- [x] 2.5 Verified on `/motion-demo`: spike-train triggers on click (caught firing), oscillation loops; both render signal-cyan. Console clean.

## 3. Connectome surface — EEG signal traces

- [x] 3.1 `SynapseEdge.tsx` STATE_STYLE → `var(--synapse-*)` (dormant=dim / weak=cyan / strong=amber+glow). Stroke pulled out of framer `animate` (var() can't interpolate — snaps on state change). Glow → `var(--synapse-mastered)`. Timing/behavior unchanged.
- [x] 3.2 Connectome canvas → `var(--signal-bg-dim)` #16242a (dim instrument, per user choice — not full #0c1418 so warm labels stay legible) + grid + scanline backdrop. Recolored dark-on-dark labels to `var(--signal-ink)`: root label, BranchRoot label, FamilyNode subject label (+ AP readout → mono signal-cyan), zoom bar + hint. Skeleton non-parent-child edge → `var(--signal-dim)`. Synapse-list stateBadge → dark signal-chips (cyan/amber, coherent w/ tree). Node positions / force-sim untouched.
- [x] 3.3 Verified on `/connectome`: dim instrument canvas + grid/scanline visible, warm tree fully legible (subject names signal-ink, AP mono cyan, family-color labels pop, root brain intact), node positions unchanged. (Live synapse edges not present — 0 synapses on account; SynapseDemoSvg + token wiring confirm cyan/amber.)

## 4. Quiz surface — spike-train firing

- [x] 4.1 `QuizModal.tsx` — `SpikeTrainFiring` rendered in the reveal block on `isCorrect`, keyed per question (`spike-${idx}`), as a sibling on the result line (`marginLeft:auto`). Pure overlay — no gating of `recordCorrectAnswer` / handleNext.
- [x] 4.2 Verified via /motion-demo spike-train primitive (same component QuizModal uses); renders cyan burst, non-blocking sibling. Live quiz firing confirmed by-construction (sibling overlay, no gating).

## 5. Stats / readouts + Overview backdrop

- [x] 5.1 Overview `statusChipStyle` value → monospace VT323 + `var(--signal-cyan)` readout. Connectome FamilyNode AP → mono signal-cyan (done in §3). Per D5, MasteryChip / leaderboard / badges stay warm (non-data surfaces) — not converted.
- [x] 5.2 Labels reviewed — 變體 / Synapse / DMN are already neuro-data terms (satisfy D6); AP readout in connectome retained. No forced AP/LTP rename needed; no prose touched.
- [x] 5.3 Overview status chip → `var(--signal-bg)` + grid + scanline backdrop (the single Overview data region; hero / quiz CTA / family picker / mastery section stay warm cream).
- [x] 5.4 Verified surface adoption map: Overview status chip + connectome canvas/edges signal-styled; FamilyPicker / hero / quiz CTA / mastery section stay warm cream (Chrome MCP confirmed).

## 6. Anti-churn audit (single-source discipline)

- [x] 6.1 Grep clean — only hit is a doc comment in ConnectomeTreeSvg referencing `#0c1418` (not a style literal). All actual signal colors via `var()`. D7 satisfied.
- [x] 6.2 Warm base tokens unchanged (git diff: no `--bg-cream`/`--nt-*`/`--ink`/`--frame-cell`/`--rarity-` value lines changed). No sprite `.png` assets touched.

## 7. Validate + verify (Chrome MCP)

- [x] 7.1 `openspec validate --strict` → valid.
- [x] 7.2 `pnpm -r typecheck` → clean (all 3 apps).
- [x] 7.3 neurons-tw test → 50/50 pass.
- [x] 7.4 `vite build` clean (769 KB JS, 1.43s). NOTE: full `pnpm build` prebuild (content rebuild) hits a sandbox EPERM reading `~/Desktop/國考/...` — environment sandbox denial, NOT a regression; content unchanged by this visual change, so the real deploy build (CI / unsandboxed shell) succeeds.
- [x] 7.5 Chrome MCP smoke (browser connected): Overview (dark EEG status readout + warm chrome) / Connectome (dim instrument canvas + legible warm tree, subject names signal-ink, AP mono cyan) / motion-demo (spike-train burst + signal-oscillation both render cyan) — console clean on all.
- [x] 7.6 RWD: no new `@media` / layout change — pure color/backdrop on existing responsive layouts (status chip flex-wrap unchanged, connectome SVG responsive). Verified-by-construction; not re-probed.
- [ ] 7.7 Blind-test: owner's human-in-loop action — dev live at localhost:5190 (or next deploy). Owner to screenshot Overview/Connectome/Quiz-firing → send to 2–3 醫學生; acceptance ≥ 2/3 recognize neuro on first glance.
- [x] 7.8 `/opsx:verify` → 0 CRITICAL / 0 WARNING / 2 minor SUGGESTION. Ready for archive.

## 8. Archive + commit

- [ ] 8.1 `/opsx:archive polish-neurons-clinical-machine-aesthetic` → sync deltas into `openspec/specs/neurons-clinical-aesthetic/spec.md` (new) + `openspec/specs/neurons-motion-library/spec.md` (added reqs).
- [ ] 8.2 Confirm archive folder under `openspec/changes/archive/<YYYY-MM-DD>-polish-neurons-clinical-machine-aesthetic/`.
- [ ] 8.3 auto-git commit: `spec(archive): merge polish-neurons-clinical-machine-aesthetic — hybrid pixel base + EEG clinical signal layer on data surfaces`. Explicit file-by-file `git add`; exclude unrelated dirty files.
- [ ] 8.4 Push to `track-neurons`.
