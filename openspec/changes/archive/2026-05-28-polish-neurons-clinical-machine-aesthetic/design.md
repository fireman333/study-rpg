## Context

neurons-tw's current visual identity (per `openspec/project.md`: "GBA-era 像素 RPG 視覺") is a warm pixel-art aesthetic:
- Base palette: `--bg-cream: #f4ecd8`, `--ink: #1a1410`, frame cells `#8c6d4a` / `#5a3f29` (warm brown).
- 4 NT branch colors: warm earth tones (`--nt-da #d4a04d` gold, `--nt-5ht #c44d4d` coral, `--nt-gaba #6a9bc4` blue, `--nt-glu #6a8c3f` green).
- Fonts: Press Start 2P + VT323 (retro pixel).
- Sprites: warm-toned pixel PNGs (family portraits, NT icons, DMN cards). **Hard no-touch** — repainting = multi-hour codex CLI batch.

cssVars are injected at boot via [App.tsx:39-40](apps/neurons-tw/src/components/../App.tsx) (`root.style.setProperty`). Most component styling is **inline `React.CSSProperties`** (no CSS files); some references `var(--nt-*)` but many hardcode warm hex literals.

Observed drift worth fixing opportunistically: `--synapse-dormant/forming/potentiated/mastered` tokens exist in the theme but [SynapseEdge.tsx](apps/neurons-tw/src/components/connectome/SynapseEdge.tsx) hardcodes solarized `#268bd2` / `#b58900` / `#999` instead of consuming them.

Owner wants a neuroscience read on first glance (blind-test acceptance) but the warm pixel identity + sprite no-touch zone preclude a full cold repaint. Hence the hybrid strategy.

## Goals / Non-Goals

**Goals:**
- A medical-student blind-test viewer recognizes the neuro background on first glance (≥ 2/3).
- Data surfaces (connectome edges, stats readouts, quiz firing, data backdrops) read as a clinical EEG monitor: cold signal colors, monospace data readouts, spike-train motion, grid/scanline backdrop.
- Warm pixel sprites + chunky frames + cream base coexist without color clash.
- All new colors funnel through new cssVars (single source of truth), not scattered hex literals.

**Non-Goals:**
- ❌ Repaint sprite PNGs.
- ❌ Recolor the warm base palette / frames / sprites to cold.
- ❌ Move connectome SVG nodes or change force-sim (禁區).
- ❌ Change any normative spec semantics (NT branches, family taxonomy, firing rules, AP thresholds, rarity reveal timing constraints, synapse formation/strengthen/decay timing contract).
- ❌ Wholesale prose copy rewrite (copy is already neuro-heavy; only targeted stat-label tone pass).
- ❌ Full ICU-HUD or fMRI-heatmap vocabulary (EEG/spike-train is the locked single anchor; ICU/fMRI motifs deferred unless a future change pivots).

## Decisions

### D1: New capability `neurons-clinical-aesthetic` (not fold into `neurons-mode`)

The clinical signal layer is a distinct, cross-surface design-system overlay with its own normative contract (which surfaces adopt signal styling, the readout format, the preservation boundary). It spans Connectome / Overview / Quiz / stats — not owned by any one existing capability. A dedicated capability keeps the contract discoverable and lets future polish iterate against it.

**Alternatives considered:**
- Fold into `neurons-mode`: rejected — `neurons-mode` is the umbrella behavior spec; a visual design-system overlay is orthogonal and would bloat it.
- No spec at all (pure tasks): rejected — owner wants a verifiable "more neuro" outcome; the signal-layer adoption + preservation boundary are testable visual contracts worth pinning so future changes don't accidentally cold-repaint sprites or scatter hex literals.

### D2: Signal-layer palette — additive cssVars, warm base untouched

Add to `THEME_PIXEL_NEURONS.cssVars` (names provisional, finalize in apply):

```
--signal-cyan:   #38e0d0   /* primary EEG trace / active signal */
--signal-amber:  #f0a830   /* secondary trace / warning-tier signal */
--signal-dim:    #2a4a52   /* inactive trace on dark data-surface */
--signal-bg:     #0c1418   /* dark data-surface backdrop (NOT global bg) */
--grid-line:     rgba(56,224,208,0.10)  /* faint grid on data surfaces */
--scanline:      rgba(56,224,208,0.04)  /* CRT scanline overlay */
```

Wire the existing `--synapse-*` tokens to the signal palette:
```
--synapse-dormant:     #2a4a52  (was #5a3f29 warm)  → --signal-dim
--synapse-forming:     #38e0d0  (was #6a9bc4)       → --signal-cyan (dashed)
--synapse-potentiated: #38e0d0  (was #d4a04d)       → --signal-cyan (solid, brighter)
--synapse-mastered:    #f0a830  (was #6a8c3f)       → --signal-amber + glow
```

`--bg-cream`, `--ink`, `--frame-cell-*`, `--nt-*`, `--rarity-*` are **NOT changed**. Data surfaces opt into `--signal-bg` locally (e.g. connectome canvas, stats panel) while the page chrome stays cream.

**Why cyan/amber:** EEG/clinical-monitor convention (cold cyan trace on near-black, amber for high-amplitude/alert). High contrast against the warm cream chrome makes the "data surface" visually distinct = the neuro read. Avoids clashing with warm sprites because sprites sit on cream chrome, not on the dark data surface.

### D3: Monospace data-readout contract for stats

Stat/counter values (AP, LTP Δ, streak, mastery X/N, study minutes) render as fixed-width signal-colored readouts: value-leading, label-trailing, monospace family (VT323 is already monospace-ish; or a dedicated `--font-data`). Example visual: `AP 0042` / `LTP +13▲` / `🔥 STREAK 07`. This is the single highest-ROI "neuro monitor" signal per the grill.

### D4: Motion motifs added to `neurons-motion-library`, within existing constraints

Two new exported timing tokens (mirror `RARITY_TIMINGS` / `SYNAPSE_TIMINGS` pattern in [timings.ts](apps/neurons-tw/src/lib/motion/timings.ts)):

```
SPIKE_TRAIN_TIMING = { burst: 280, spikes: 4, settle: 160 }   // correct-answer firing
OSCILLATION_TIMING = { period: 900, amplitude: ... }          // loading / pending
```

- **Spike-train firing**: on quiz correct-answer, a short 4-spike EEG burst renders near the answer (SVG polyline animating a spike-train shape). Total < SKIP_THRESHOLD-friendly; does not block the answer flow.
- **Signal-oscillation**: replaces/augments generic pending spinners with a sine-trace oscillation.
- Both gated by `useRespectsReducedMotion` (zero-duration / static fallback) and added to `/motion-demo` for apply-time self-verify (per existing `neurons-motion-library` self-verify requirement).
- **No change** to `RARITY_TIMINGS` or `SYNAPSE_TIMINGS` values or constraints. Connectome edge formation reuses existing `SYNAPSE_TIMINGS.formation` — we only recolor + optionally add a glow, no new timing.

**Delta type:** `## ADDED Requirements` in `neurons-motion-library` (two new exported-token requirements + `/motion-demo` coverage). Existing requirements untouched.

### D5: Surface adoption map (what gets signal-layer styling)

| Surface | Signal treatment | File(s) |
|---|---|---|
| Connectome edges | EEG signal trace: cyan forming/potentiated, amber mastered, glow | `components/connectome/SynapseEdge.tsx` |
| Connectome backdrop | `--signal-bg` dark canvas + grid + scanline | `components/connectome/ConnectomeTreeSvg.tsx`, `routes/ConnectomePage.tsx` |
| Quiz correct-answer | spike-train firing burst | `components/QuizModal.tsx` |
| Stats / counters | monospace data readouts | Overview stats area, HUD components |
| Overview data area | subtle grid backdrop behind stats (sprites/chips stay on cream) | `routes/OverviewPage.tsx` |
| Loading / pending | signal-oscillation | shared loading component(s) |

**Explicitly NOT signal-styled** (stay warm): FamilyPicker chips (sprites + cream — just shipped in realign change), DMN card art, achievement badges, dorm/cosmetic surfaces, leaderboard rows.

### D6: Copy tone pass scope

Only stat/counter labels + the most visible HUD strings get clinical-data phrasing (AP / LTP Δ / spike rate). The 422 existing neuro mentions in prose stay as-is. This requirement lives in `neurons-clinical-aesthetic` as a single normative line; the broad copy stays out of spec (tasks-level if anything).

### D7: Single-source-of-truth discipline (anti-churn)

Given ~26 components are inline-styled, the rule for this change: **every new signal color MUST be referenced via `var(--signal-*)`**, never a raw hex literal. This caps the blast radius (future re-tune = edit cssVars once) and is the mitigation for the large surface risk. Verify step greps for stray new hex literals.

## Risks / Trade-offs

- **[Risk]** Large inline-style surface (26 components) → high churn, easy to miss a surface or introduce inconsistency → **Mitigation**: D7 single-source cssVars; surface adoption map (D5) as the explicit checklist; Chrome MCP smoke each listed surface.
- **[Risk]** Cyan/amber data surfaces next to warm cream chrome could look incoherent ("two games") rather than "pixel game with a monitor in it" → **Mitigation**: confine signal-bg to genuinely data/instrument surfaces (connectome canvas, stats panel); keep transitions framed (chunky pixel border around the "monitor") so it reads as an in-world device. Blind-test catches if it fails.
- **[Risk]** Spike-train / oscillation motion could feel gimmicky or distract from answering → **Mitigation**: short, peripheral, reduced-motion-aware; `/motion-demo` lets owner tune before wiring into QuizModal.
- **[Trade-off]** EEG anchor locked → fMRI-heatmap mastery grid + ICU-HUD ideas parked. Acceptable; single coherent anchor beats a broken mix (grill open-uncertainty resolved toward EEG).
- **[Risk]** Recoloring `--synapse-*` could subtly change connectome legibility (state distinction) → **Mitigation**: keep 3 visually-distinct states (dim / cyan / amber+glow); verify on `/connectome` that dormant/forming/potentiated/mastered remain distinguishable.

## Migration Plan

- **Deploy**: standard CF Pages + GH Pages pipelines. No DB / schema / content rebuild.
- **Rollback**: revert the commit; no persisted state affected. cssVars revert restores warm look instantly.
- **Sequencing**: depends only on shipped `realign-neurons-quiz-entry-to-subject-labels`. No conflict with other in-flight main-branch changes (this is track-neurons, data-surface visual only).

## Open Questions

- Exact signal hex values + whether to add a dedicated `--font-data` monospace vs reuse VT323 → resolve in apply (D2/D3 provisional; tune live on `/motion-demo` + Connectome).
- Whether grid+scanline reads as "neuro monitor" or just "retro CRT" to blind-test viewers → empirical; capture both Connectome + Overview screenshots for the blind test and iterate if the read is "retro" not "neuro".
