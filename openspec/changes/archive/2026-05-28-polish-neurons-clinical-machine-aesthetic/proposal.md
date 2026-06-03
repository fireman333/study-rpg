## Why

Owner dogfood (2026-05-28) + grill (`~/.claude/scratch/grilled-neurons-tw-科學感-polish-2026-05-28.md`): neurons-tw reads more like a generic warm GBA pixel game than a neuroscience product. The copy is already neuro-jargon-heavy (~422 mentions across `apps/neurons-tw/src`), but the **visual + motion language** doesn't signal "neuro" — a medical-student player doesn't get the immediate "this is a brain / EEG / synapse" read. Acceptance bar (owner): ≥ 2/3 醫學生 / 學長 blind-test viewers should recognize the neuro background on first glance without prompting.

The constraint: neurons-tw's identity is a GBA-era warm pixel RPG (cream/brown palette, Press Start 2P / VT323 fonts, warm-toned pixel sprites). Sprite PNGs are a hard no-touch zone (can't be repainted without burning a multi-hour codex CLI batch). A full cold-clinical repaint would clash with the warm sprites. So we adopt a **hybrid**: keep the warm pixel base + chunky frames + sprites, and overlay a cold **clinical "signal layer"** on the *data surfaces* (connectome edges, stats readouts, quiz-answer feedback, data-heavy backdrops) — anchored on **EEG waveform / spike-train** visual vocabulary.

## What Changes

**Locked design decisions (grill + AskUserQuestion 2026-05-28):**
- Aesthetic strategy = **hybrid** (Option B): pixel base preserved, clinical signal layer added to data surfaces only.
- Primary clinical anchor = **EEG waveform / spike-train** (firing = spike train, connectome edge = signal oscillation, loading = oscillation wave, stats = live-trace readouts).

**Visual axis:**
- Add a **signal-layer palette** to `theme-pixel-neurons` cssVars (e.g. `--signal-cyan`, `--signal-amber`, `--signal-trace`, `--grid-line`, `--scanline`) WITHOUT removing or recoloring the warm base tokens (`--bg-cream`, `--ink`, frame cells). Warm sprites + chunky frames stay.
- Recolor connectome **synapse edges** to the signal-layer palette (wire the currently-unused `--synapse-*` tokens; today edge colors are hardcoded solarized `#268bd2` / `#b58900`) so edges read as EEG signal traces (cyan/amber glow).
- Convert stats / counters (AP, LTP delta, streak, mastery counts) to **monospace data-readout** styling (EEG/ICU-monitor feel) — value-leading, fixed-width, signal-colored.
- Add a **grid + scanline backdrop motif** to data-heavy surfaces (Connectome page, Overview stats area) — subtle, behind content, does not obscure pixel sprites.

**Motion axis:**
- Add **spike-train firing** micro-animation on quiz correct-answer (a short EEG-spike burst keyed to the answer event).
- Add **signal-oscillation** loading / pending motif (replaces / augments any generic spinner).
- Optionally add an EEG-trace draw-in flourish to connectome edge formation (within existing `SYNAPSE_TIMINGS`, no timing change). All new motifs respect `useRespectsReducedMotion` and hook into the `/motion-demo` self-verify route.

**Copy axis (light):**
- Tone pass on the highest-visibility stat/counter labels so they read as clinical neuro-data (AP count, LTP Δ, spike rate) consistent with the EEG anchor. Broad prose copy is largely already neuro-themed; this is targeted, not a wholesale rewrite.

## Capabilities

### New Capabilities

- `neurons-clinical-aesthetic`: the clinical EEG "signal layer" design-system overlay — defines the signal-layer palette tokens, which surfaces adopt signal styling (connectome edges / stats readouts / quiz firing / data backdrops), the monospace data-readout contract, the grid+scanline backdrop motif, and the explicit preservation boundary (warm base palette, chunky frames, and sprite PNGs are NOT modified).

### Modified Capabilities

- `neurons-motion-library`: ADD EEG-anchored motion primitives — a spike-train firing timing token + a signal-oscillation timing token, both exported as public constants (mirroring existing `RARITY_TIMINGS` / `SYNAPSE_TIMINGS` pattern), driven by `useRespectsReducedMotion`, and surfaced on the `/motion-demo` self-verify route. Existing per-rarity + synapse timing constraints are unchanged.

## Impact

- **Code (visual)**: `packages/theme-pixel-neurons/src/index.ts` (add signal-layer cssVars) + inline styles across ~26 components in `apps/neurons-tw/src/components` and 6 route pages (data surfaces only). Largest touch surface of any neurons change to date.
- **Code (motion)**: `apps/neurons-tw/src/lib/motion/timings.ts` (+ `index.ts` exports), new spike-train + oscillation primitives, `/motion-demo` route additions.
- **NOT touched** (禁區): sprite PNG assets (no repaint), connectome SVG **layout / force-sim** (only edge *color/glow*, not node positions or timing), spec semantics of NT branches / family taxonomy / firing rules / AP thresholds, Dexie schema, R2 bundle, leaderboard / achievements data contracts.
- **No data / schema / API / migration change.** Pure presentation + motion.
- **theme-pack-contract NOT modified**: `cssVars: Record<string, string>` already permits arbitrary `--[a-z][a-z0-9-]*` keys; adding signal-layer tokens is contract-compatible.
- **connectome-collection NOT modified**: edge recolor is styling; the formation/strengthen/decay animation contract (timings + behavior) is unchanged.
- **Verification**: Chrome MCP smoke across all data surfaces + RWD probe (class-override pattern) + `/motion-demo` for new primitives + console-clean check; blind-test prep = capture screenshots of Overview / Connectome / Quiz-firing for owner to send to 2–3 醫學生.
- **Risk**: large inline-style surface = high churn; mitigated by funneling colors through new cssVars (single source) rather than scattering hex literals. Sibling-clean: depends only on shipped `realign-neurons-quiz-entry-to-subject-labels`.
