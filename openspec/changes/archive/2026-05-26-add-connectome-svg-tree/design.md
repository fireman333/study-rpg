## Context

`add-connectome-collection` shipped the connectome data model (Dexie tables `familyAccrual` + `synapses`, state machine `dormant → weak → strong`, LTP / LTD rules, AP threshold ladder) and a stub `/connectome` view (4-column text grid + tabular synapse list). The polished SVG Linnean phylogenetic tree was explicitly punted out per spec line 222 of `connectome-collection`: "The view SHALL NOT render any polished SVG / Canvas Linnean phylogenetic tree (deferred to a follow-up change)."

`add-neurons-motion-library` shipped Framer Motion primitives (`RarityRevealModal`, `AchievementUnlockModal`, `Toast`, `NumberTickUp`) and the `useRespectsReducedMotion` hook. The hook is already imported by `SynapseFormationToast`, `LeaderboardOptInModal`, `VariantUnlockModal`, `RarityRevealModal` and the new tree component will use it the same way.

This change adds the deferred SVG tree, integrates it into the existing `/connectome` route above the column grid, and wires the four state-transition events (formation / strengthen / decay / slot unlock) to Framer Motion animations gated by reduced-motion preference.

## Goals / Non-Goals

**Goals:**
- Land a polished SVG (no Canvas, no D3, no react-flow) Linnean tree as the primary visual of `/connectome`
- Preserve the existing column grid + synapse table as a supplemental detail section (a11y, fallback, debug)
- Add animations that read state transitions from the existing `subscribeConnectomeEvents` event bus — no new state plumbing
- Reuse `useRespectsReducedMotion` so the reduced-motion contract stays consistent across the app
- Expose `SYNAPSE_TIMINGS` token in `neurons-motion-library` so animation durations are introspectable, not magic numbers
- Be deployable as a same-app polish change with **no GH Pages / CF Pages workflow edits** (so the new CLAUDE.md "CF Pages vs GH Pages deploy asymmetry" sharp edge stays unprovoked)

**Non-Goals:**
- Not implementing zoom / pan / drag of the tree (out of scope; viewBox-driven responsive layout only)
- Not implementing per-family hover popovers / per-edge click detail panels (synapse table already serves this)
- Not introducing a new state machine on top of existing connectome events (consumer-only, no writes)
- Not refactoring the existing column grid / synapse table internals (they get repositioned, not rewritten)
- Not converting other neurons-tw pages to SVG (Overview, Leaderboard, Achievements remain non-SVG)
- Not adding new content to the content pack (no new fields on `Subject` for tree-specific metadata; layout derives entirely from existing `ntBranch` + content order)
- Not animating the daily reset transition (purely state-driven, no visual cue beyond the firedToday halo disappearing)

## Decisions

### D1 — SVG over Canvas / D3 / react-flow

- SVG `<path>` + Framer Motion `motion.path` covers `pathLength` animations natively (CSS variable `strokeDashoffset` trick plus Framer's `pathLength` driver — well-tested in the React ecosystem)
- 11 nodes + ≤ 55 edges is well under the SVG DOM-cost cliff; Canvas is overkill and loses a11y + DevTools inspectability
- D3 adds 80kb gzipped for force-directed layout which we don't need (Linnean tree is hierarchical, not force-directed); a hand-written pure layout function in `layout.ts` is ~40 lines
- react-flow is designed for editable graphs (drag, connect, delete); we are read-only — adds a dep + 60kb gzip with no payoff
- **Why**: keeps bundle small, leverages existing Framer Motion (already used by motion library), and the visual we want is hierarchical not force-graph

### D2 — Tree layout: horizontal on desktop, vertical on mobile, viewBox-driven

- Desktop (≥ 768px): root at left, branch labels left of leaf clusters, leaves arrayed in a vertical column on the right; horizontal `<path>` connectors arc from root → branch → leaf
- Mobile (< 768px): root at top, branches stacked horizontally, leaves cluster beneath; vertical connectors
- Use a single SVG `<svg viewBox="0 0 W H">` whose W / H change with viewport via CSS media query on the SVG container, NOT React conditional rendering — keeps DOM stable, lets browser animate layout shifts smoothly (and means Framer Motion's animation state survives the layout change)
- The layout function `layout.ts` takes `{ subjects: Subject[]; mode: 'horizontal' | 'vertical' }` and returns `{ rootPos, branchPos: Map<ntBranch, Vec2>, leafPos: Map<familyId, Vec2>, edgePath: (a: familyId, b: familyId) => string }`
- Pure function, fully unit-testable, no React state inside
- **Why**: deterministic layout, no DOM thrash on resize, full keyboard / screen-reader support

### D3 — Animation token shape and ownership

- `SYNAPSE_TIMINGS` lives in `neurons-motion-library` alongside `RARITY_TIMINGS`, mirroring the existing convention; shape `{ formation, strengthen, decay, slotUnlock }`
- Default values are educated guesses (formation 600ms / strengthen 400ms / decay 600ms / slot-unlock 500ms) — comfortable for human eye to register the transition but not so slow that batch synapses (e.g., 3 formations in quick succession after a 답 streak) stack into a janky queue
- Animations are NOT queued — if a synapse's formation animation hasn't finished when its strengthen event arrives, Framer Motion's `animate()` automatically interpolates from the current animated state to the new target (this is the default behavior; we don't need a manual queue)
- **Why**: matches existing motion library token pattern (`RARITY_TIMINGS`); consumers can override or read for test assertions

### D4 — Reduced-motion gating: shape-only fallback (no instant + flash)

- Existing primitives' contract: reduced motion = opacity fade only (preserves state visibility); we extend this to `pathLength` animations by setting `transition.duration: 0` instead of skipping the render entirely
- Specifically: edges still render at their target styling on event arrival, just without the draw-in / morph; node pulses are skipped (no scale change)
- This avoids a worse fallback where the absence of any cue makes state changes hard to notice — a frame-by-frame instant transition still appears via React state update
- **Why**: respects user preference without breaking the "I can see the change happened" signal

### D5 — Where the new components live (apps/, not packages/)

- All new files in `apps/neurons-tw/src/components/connectome/` because this visualization is neurons-app-specific (the Linnean tree only makes sense for the M_3rd reskin's `Subject.group: NtBranch` data model)
- Motion library export `SYNAPSE_TIMINGS` lives in `apps/neurons-tw/src/lib/motion/` (same dir as the rest of the local motion library — recall `neurons-motion-library` is per-app, NOT a published package — per the existing capability spec)
- **Why**: zero impact on `packages/core/`, no published-API surface bump, no `@study-rpg/core` version churn

### D6 — Cross-NT-branch edge routing without label collision

- Edges between leaves under different NT branches need to arc to avoid crossing labels and other edges
- Use cubic Bézier with control points offset proportional to the vertical (or horizontal in mobile) distance between endpoints — control points at 30% of distance, pushed sideways away from the tree's center axis
- For desktop's horizontal layout, the control point offset is on the X axis (push paths leftward into empty space); for vertical layout, it's on the Y axis
- This is purely cosmetic — no a11y impact (the path's screen-reader label encodes "synapse between A and B"); only visual quality
- **Why**: avoids the spaghetti-line look that hurts the "polished" goal without needing a full graph layout solver

### D7 — Event lifecycle and animation triggering

- `ConnectomeTreeSvg` consumes the existing `subscribeConnectomeEvents` API (no new event types)
- On `connectome.synapseFormed`: insert a new `<motion.path>` with initial `pathLength: 0`, target `pathLength: 1`
- On `connectome.synapseStrengthened`: existing edge component re-renders with new state prop; Framer Motion's `animate` prop interpolates stroke styles
- On `connectome.synapseDecayed`: same as strengthen but downward; if new state is `dormant`, set opacity target to 0 and use Framer Motion's `onAnimationComplete` callback to remove from React-rendered list
- On `connectome.variantSlotUnlocked`: target leaf gets a one-shot pulse via Framer Motion's `animate` prop driven by a `useEffect` listening to the event
- Component-internal state minimal — events drive the existing `loadConnectome()` refetch which provides the source-of-truth state; animations are layered on top

### D8 — Avoid CF Pages deploy asymmetry trap (CLAUDE.md sharp edge)

- This change does NOT add a new app to the monorepo (it edits files inside the existing `apps/neurons-tw/`)
- This change does NOT add anything to `scripts/build-cf-pages-dist.mjs` ROUTES
- This change does NOT touch `.github/workflows/deploy-cf-pages.yml` or `.github/workflows/deploy.yml`
- Verification at archive time: run `gh run list --branch <branch> --limit 5` after push and confirm BOTH "Deploy to GitHub Pages" AND "Deploy Cloudflare Pages" workflows go green — per CLAUDE.md L402 sharp edge

### D9 — Pivot from static SVG tree to force-directed simulation (2026-05-26)

Initial implementation (D1–D8) targeted a deterministic bilateral SVG layout (`layout.ts` computing fixed positions). After user dogfood it read as too rigid / "branchy-tree-like" rather than brain-circuit-like. **Switched to force-directed simulation** mid-apply per user feedback.

New architecture (`force-sim.ts` + `graph-builder.ts`):
- Pure 2D simulation (~200 LOC, **no d3-force dep** — Coulomb repulsion + Hookean springs + soft anchor + central gravity + damping + wall force)
- Root pinned at center (mass 6, radius 70)
- 4 NT branch sub-roots pinned at fixed angular positions (slice widths proportional to leaf count: DA 2/11 × 360° = 65.5°, GABA 3/11 = 98.2°, Glu 4/11 = 131°, 5HT 2/11 = 65.5°). Total = 360°
- 11 leaves with soft outward anchor (anchorK=0.012), drift freely under sim, settle outside their sub-root
- 99 year sub-nodes (11 families × 9 民國年 106-114) each linked to its leaf via spring (restLength 130, stiffness 0.05) with very soft outward anchor (anchorK=0.004)
- `requestAnimationFrame` tick loop, React re-render capped at ~30fps via `forceRender` ref
- Sim auto-pauses when KE < threshold (`settleKE=0.05`); pointer drag wakes it again

Layout module (`layout.ts`) demoted to type re-exports only (`NtBranch`, `NT_BRANCH_COLOR`, `NT_BRANCH_LABEL`, `NT_BRANCH_ORDER`); deterministic `computeLayout` retained but unused on the active path (vertical mode stub still in code for fallback).

### D10 — Add year sub-nodes (99-node third tier)

Each subject's question corpus spans 9 民國 years (106-114 / 2017-2025 CE). Decision: render every (subject, year) pair as a **small dedicated SimNode** so the visual reads as a 3-tier dendritic projection: `root → branch → leaf → year` (4 layers including root).

- Year extraction (`graph-builder.ts: extractYearsByFamily`) parses `Question.id` (format `<year>-<session>-<book>-<subject>-Q<num>`) — uniform 9 years per subject confirmed by sampling
- Initial spawn position: arc OUTWARD from leaf (along the root→leaf direction), narrow ±~30° spread per year
- Per-leaf year link: spring restLength 130, stiffness 0.05 (tight pull keeps the year halo close to its parent leaf)
- Year nodes render as `<YearNode>` — small circle (r=12) + inscribed year text, inherits parent leaf color, soft outward anchor (anchorK=0.02)
- Total node count: 1 root + 4 branches + 11 leaves + 99 years = 115 SimNodes. O(n²) all-pairs repulsion at this scale is ~2ms/tick = imperceptible

### D11 — Interactive: per-node drag + canvas pan + multi-input zoom

User can grab any node (leaf / year / branch / root) and drag it anywhere; sim re-energizes and connectors update in real time. On release the node un-pins and re-enters simulation. **Implemented with pointer events** (unified mouse / touch / pen) — `setPointerCapture` for cleanest cross-input handling.

Pan implemented separately: drag on empty SVG canvas (no `data-sim-id`) modifies a `pan: {dx, dy}` state which offsets the viewBox.

**Zoom** — three input paths converging on the same `zoom` state:
- Buttons: `−` / `+` / `重置` (resets pan + zoom both)
- Trackpad pinch on macOS: browsers translate to `wheel + ctrlKey` events → native wheel handler (bound via `useEffect` with `passive: false`, so we can `preventDefault` to suppress browser page-zoom)
- Mobile 2-finger touch pinch: `touchstart` / `touchmove` distance ratio (also passive: false to suppress native pinch-to-zoom)
- ctrl/cmd + mouse wheel: same path as trackpad pinch

`touchAction: 'none'` on the SVG so the browser doesn't try to scroll/pan-zoom the page; we own all touch gestures.

### D12 — 5 codex-CLI generated pixel-art icons (1 root brain + 4 NT branches)

Hand-grown vector placeholders looked generic. Used **codex CLI with `$imagegen` + `gpt-image-2`** to mint pixel-art identities for each NT branch + the central root:

| Sprite key | File | Theme |
|---|---|---|
| `branch:da` | `sprites/branches/da-icon.png` | Electric-yellow molecular sparkle (catecholamine ring + amine tail) |
| `branch:5ht` | `sprites/branches/5ht-icon.png` | Hot-pink indole ring with wave motif (mood / wellbeing) |
| `branch:gaba` | `sprites/branches/gaba-icon.png` | Sky-blue shield + GABA chain (inhibition / brake) |
| `branch:glu` | `sprites/branches/glu-icon.png` | Sage-green lightning bolt + glutamate backbone (excitation) |
| `root:brain` | `sprites/root/root-brain-icon.png` | Coral-pink pixel brain with kawaii eyes + smile, two hemispheres + cerebellum hint |

Codex CLI gotchas (per `~/.claude/imports/codex_image_gen.md`):
- Always `cd /tmp` first to avoid SessionStart hook injecting `/spec resume` into the codex agent loop (one of the 5 initial calls got interrupted by hook content — restart from `/tmp` resolves)
- Use `--skip-git-repo-check` (codex 1.x; older 0.128.0 didn't require)
- Use `--sandbox workspace-write` so the agent can write the output PNG
- Pipe `< /dev/null` to stdin so codex doesn't block waiting for input
- First brain icon attempt timed out at 12+ min with a verbose 8-clause prompt; succeeded in ~5 min after shortening to 3 sentences

Sprite registry (`packages/theme-pixel-neurons/src/sprites.ts`) extended with two new `import.meta.glob` patterns (`branches/*.png` keyed `branch:<nt>` + `root/*.png` keyed `root:brain`). Both fall back to TRANSPARENT_PIXEL if the file is missing.

Adding new sprite files to a workspace dependency requires a **dev server restart** for Vite's glob to re-index — hot reload doesn't catch new files in the dep's source. The 4 branch icons + brain icon all required restart.

### D13 — EdgePulse axon-signal animation (year → leaf → branch → root cascade)

Visualizes "signal propagation up the connectome hierarchy" — a debug-panel button `⚡ 觸發傳遞` fires a 3-leg cascade from a random year sub-node up through its leaf and branch to the central root. Each leg is a glowing dot + 3 trailing dots + halo flying along the connector at 1100ms ease-out.

`EdgePulse.tsx` component:
- Bright neon **core dot** (r=14) with `feGaussianBlur` glow filter
- **White-hot center** (r=7, fill #ffffff) on top of core for "incandescent" feel
- **Outer halo** (r=30, lower-opacity) trailing behind
- **3 trailing dots** at delay 0.07/0.14/0.21s, fading r=9/7/5 with opacity 0.6/0.45/0.3
- All animate `cx, cy` along the edge from `from` to `to` via Framer Motion (no `getPointAtLength` needed — current edges are straight lines)
- `useRespectsReducedMotion()` collapses to a single 200ms flash at destination

Cascade orchestration (`ConnectomeTreeSvg.tsx: fireRandomCascade`):
- Picks random family + random year of that family
- Spawns 3 pulses: `year:<fam>:<yr>` → `leaf:<fam>` → `branch:<NT>` → `root`
- Each leg starts after the previous arrives (+30ms gap)
- Each pulse auto-clears from React state via `onComplete` callback

### D14 — `colors.ts` shared neon palette + `neonForFamily` helper

Three components (EdgePulse / FamilyNode breathing glow / root concentric ripple) all need to convert the muted family color (e.g. `#d4a04d` DA gold) into a vivid neon variant (`#fff066` electric yellow). Extracted into `apps/neurons-tw/src/components/connectome/colors.ts`:

- `parseHex(hex) → [r, g, b]`
- `rgbToHsl(r, g, b) → [h, s, l]`
- Fixed `NEON_PALETTE` (4 entries: DA yellow / 5HT pink / GABA cyan / Glu green) keyed by hue
- `neonForFamily(color) → { core, halo }` picks closest entry by hue distance

Earlier iteration used a parametric `neonify(hex, deltaL, deltaS)` (HSL brightening); replaced because output varied unpredictably with input lightness. Fixed-palette lookup is deterministic and visually consistent.

### D15 — firedToday breathing glow replaces 🔥 emoji (二階 doctor-sprite-glow port)

Original FamilyNode showed `<text>🔥</text>` glyph on firedToday leaves. User: "有點醜". Replaced with **2-layer concentric breathing ring** (Framer Motion port of 二階 `doctor-sprite-glow` CSS keyframe pattern):

- Outer haze (r=0.7×SPRITE): neon halo color, blurred (`stdDeviation=5`), opacity 0.25→0.85→0.25, scale 1→1.15→1
- Inner ring (r=0.6×SPRITE): neon core color, stroke 4px, blurred, opacity 0.35→1→0.35, scale 1→1.18→1, delayed 0.08s
- 1.2s breath cycle, `repeat: Infinity`
- Reduced-motion fallback: static dim ring, no animation

Multiple iterations of halo size:
1. Initial: 0.95 / 0.68 — too big, overlapped year nodes
2. Halved: 0.72 / 0.55 — **inner ring r=0.55 == frame r=0.55, hidden behind white frame fill**. Bug. Halo only ~11px wide annulus, invisible
3. Fix: 0.92 / 0.72 — outer haze clearly outside frame, inner ring just outside, very visible
4. Bigger: 1.15 / 0.85 (after user "still can't see") — very obvious, but overlapped neighbors
5. **Final (per user 縮小一半)**: 0.7 / 0.6 — outer just outside frame, inner ring barely outside, visible without overlapping year nodes

### D16 — Root concentric multi-color ripple (replaces directional halo)

Initial root halo was solid coral pink (single color). User wanted "對應原本色系" → tried 4 directional halos (each biased toward its NT hub via sim positions × unit vector). User feedback: "看起來都是黃光" — all 4 colors overlap at root center → alpha blend averages to yellow-green mush.

Tried `mix-blend-mode: screen` — fails on cream canvas (screen with light bg ≈ white).

Final design: **4 concentric NT-color rings ripple outward from root center, sequential** (no spatial bias):
- 4 `<motion.circle>` at cx=cy=0, fill=none, stroke=neon color, strokeWidth=8
- Each animates `scale 0.55 → 1.55 → 1.7` over 2.4s, opacity 0 → 0.7 → 0
- Stagger delays 0/0.6/1.2/1.8s so a new color ring emits every 0.6s
- Result: continuous rainbow-ripple flowing outward like sonar pings — readable as 4 distinct colors instead of an averaged center mush
- Final ripple terminus ~85px from root center (was 168px before "halo too big" feedback)

### D17 — Root + 4 hubs visual hierarchy via icon-disc-frame size

User: 「第一層 hubs 大小應該要比第二層 leaves 大」. Set sprite-disc radii:
- Root (r=68 px): biggest, with multi-color ripple, brain icon, "Neuron Connectome" label
- NT-branch hubs (r=50 px): white disc + thick NT-color ring + NT pixel icon (40px) + label
- Family leaves (r=35 px, SPRITE_SIZE * 0.55): white disc + family-color ring + 64px sprite
- Year sub-nodes (r=12 px): small circle + inscribed 民國 year + family color stroke
- Pulse dot (r=14 px during transit): glowing dot + 3 trail dots

Strict size monotonicity root > hubs > leaves > years matches "hub-and-spoke with central authority" reading.

### D18 — Bug fixes during apply

Series of small correctness bugs caught + fixed during dogfooding:

- **Rules of Hooks violation**: `useRef` + `useEffect` for gesture handlers placed AFTER `if (!snapshot) return <p>...</p>` early return → React threw → blank page. Fix: move all hooks above the early return; use `svgReady = snapshot != null` flag as dep so the gesture-binding effect runs once snapshot lands
- **Vite glob caching**: adding new PNG to `packages/theme-pixel-neurons/sprites/branches/` after dev start → HMR didn't pick up the new file → `THEME_PIXEL_NEURONS.sprites['branch:da']` still returned placeholder. Fix: full dev server restart after sprite additions
- **z-order**: EdgePulse layer initially rendered BEFORE family leaves → pulse dot hidden behind sprite when arriving at leaf. Fix: move pulse `<g>` to the bottom of the SVG render tree (topmost layer)
- **Halo hidden by frame**: see D15 step 2 — `r=0.55*SPRITE` halo == `r=0.55*SPRITE` frame radius, frame `fill=#fff` covered the halo
- **Coupled rest length explosion**: when BRANCH_RADIUS went from 88 → 165 to make room for hub size r=50 + label, leaves drifted way out; tuned LEAF_DIST + YEAR_DIST proportionally + adjusted centerK to keep the overall blob ~roughly circular

## Risks / Trade-offs

- **Risk**: Hand-written layout function may need iteration once 11 actual sprites + real text labels render — some leaves may visually crowd
  - **Mitigation**: pure function = quick to iterate; can adjust spacing constants without React-state changes; verify by running dev server and visually inspecting both desktop + mobile widths

- **Risk**: Framer Motion's `pathLength` animation has a known quirk: requires SVG `pathLength` attribute = "1" for cross-browser consistency
  - **Mitigation**: explicitly set `pathLength="1"` on every `<motion.path>`; documented in component file

- **Risk**: Synapse with state `dormant` is invisible — players may not realize a co-fire below threshold still counts toward the pair
  - **Mitigation**: this is intentional per existing `connectome-collection` spec (dormant = no visible edge); the supplemental synapse table still shows the row, and the existing toast on first co-fire still fires; not addressed here

- **Trade-off**: SVG-based animation pushes more work to the main thread than Canvas; at 11 nodes + ≤ 55 edges this is negligible, but if neuron family count grows past ~30 we'd need to re-evaluate
  - **Mitigation**: family count is hard-coded in content pack at 11; growing would itself need a separate capability change

- **Trade-off**: Reduced-motion users see edges appear instantly — less "magical" but matches the existing primitive contract; users who prefer reduced motion explicitly opted into less animation
  - **Mitigation**: none needed (this is the contract)

- **Trade-off**: The supplemental column grid + table remain in the DOM (not collapsed) — adds vertical scroll
  - **Mitigation**: future change can wrap them in `<details open>` if owner wants collapsibility; out of scope here
