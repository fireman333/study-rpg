## Why

The neurons-tw homepage (`/`, `OverviewPage.tsx`) is almost entirely text + buttons + chips with no large dynamic visual, while the product's signature visual — the connectome phylogenetic tree — sits one route away on `/connectome`. Meanwhile two friction sources keep the core loop from feeling like "just study and answer questions like an exam candidate": the game mechanics (synapse co-fire, 30-min DMN draw, AP slots) have to be *read and understood* as text rules before they make sense, and the path into answering questions feels roundabout. This change reshapes the homepage into one integrated experience that hooks visually, surfaces progress as a dashboard, and lets the mechanics run in the background so the user only reads and quizzes.

## What Changes

- **Lightweight connectome-tree hero on the homepage** (NOT a full merge): a presentational, gently-animated tree of the 4 NT branches that highlights the most recently wired synapse and routes to the full interactive `/connectome` on click. The heavy 664-line interactive `ConnectomeTreeSvg` (rAF physics + pan/zoom/pinch) is NOT mounted on the homepage; a new lightweight component is built instead. The full family-detail grid + synapse table STAY on `/connectome`.
- **Homepage becomes "hook (top) + dashboard (bottom)"**: hero tree + a "next DMN draw" progress ring on top; progress chips + the read/quiz CTA path on the bottom.
- **Rules-as-visuals (friction reduction)**: the homepage text rule line ("閱讀 → 每 30 min 觸發 DMN 抽卡…") is replaced by a visual progress ring driven by real reading-timer / DMN time-axis data (already wired). Synapse co-firing is shown by the hero tree visually rather than explained in prose.
- **First-visit onboarding on the homepage**: a brief, one-tap-dismissable guide that never reappears. The existing `/connectome` first-visit callout is KEPT (serves users who land directly on `/connectome`); no de-duplication.
- **Ambient + answer-feedback motion (homepage-scoped)**: gentle resting-state firing on the hero tree (the "environment is alive" feel) and an instant correct/incorrect firing flash on answer resolution. Page-transition animation is explicitly out of scope.
- **Globally stronger reward celebrations**: enhance the shared `neurons-motion-library` reveal-modal / toast celebration primitives so synapse-formed / variant-unlocked / DMN-draw / achievement reveals feel more cinematic everywhere — consuming capabilities (variant-gacha, dmn-fate-cards, achievements, connectome-collection) get the upgrade for free without spec changes.
- **All new motion respects `prefers-reduced-motion`** and stays 60fps / raf-throttle friendly on mobile, and every new reusable primitive remains self-verifiable on the `/motion-demo` route.

Non-goals / explicit constraints carried from clarification:
- Reading timer keeps MANUAL start (not a flagged friction; auto-start would also violate the 誠信防護 anti-inflation rule).
- The CTA is NOT collapsed into a single mega-button; 🎲 random-quiz and the family-select FamilyPicker choices stay — only the path is smoothed.
- `packages/core` stays content-agnostic; all neurons-specific code lives in `apps/neurons-tw` + `packages/theme-pixel-neurons`.

## Capabilities

### New Capabilities
- `neurons-homepage`: The composition and behavior of the neurons-tw homepage (`/`) — the lightweight connectome-tree hero (presentational, ambient-animated, routes to `/connectome`), the "next DMN draw" progress ring driven by real reading-timer/DMN data, the progress-chip + CTA dashboard with a smoothed read/quiz path, the first-visit onboarding, and the homepage-scoped answer-feedback motion. Reduced-motion and SPA-route (direct URL + F5) behavior included.

### Modified Capabilities
- `neurons-motion-library`: Reward-celebration reveal-modal / toast primitives are enhanced for a more cinematic feel (timing/visual layering), and new reusable primitives are added for homepage ambient resting-state firing and answer-resolution feedback flash. All remain reduced-motion gated and self-verifiable on `/motion-demo`. Existing exported timing tokens that downstream code budgets against are preserved or superseded additively (no silent breaking of published constants).

## Impact

- **App code**: `apps/neurons-tw/src/routes/OverviewPage.tsx` (major rework); new homepage hero + progress-ring + onboarding components under `apps/neurons-tw/src/components/`; answer-feedback hook into the quiz answer path; `MotionDemoPage.tsx` gains triggers for the new primitives.
- **Motion library**: `packages/theme-pixel-neurons` (or wherever `neurons-motion-library` primitives live) — enhanced reveal/toast primitives + new ambient/feedback primitives + exported tokens.
- **Data**: none new. Reuses already-wired reading-timer (`reading-timer.ts`) + DMN time-axis (`dmn-trigger.ts` `accrueReadingMinutes`) + connectome snapshot (`loadConnectome`). No Dexie version bump, no R2 bundle schema change, no Worker change.
- **Specs**: new `neurons-homepage` spec; delta to `neurons-motion-library`. `connectome-collection`, `neurons-mode`, `reading-loop` unchanged.
- **Deploy / verify**: live site on Cloudflare Pages (`med-study-rpg.com/neurons/`). Verification requires the SPA 三件套 (in-app nav + direct URL + F5) and `prefers-reduced-motion` check; prod deploy via `pnpm deploy:cf` from the deploy worktree (per-app + per-worktree `.env.local` footgun applies — `apps/neurons-tw/.env.local` must exist in the deploy worktree).
