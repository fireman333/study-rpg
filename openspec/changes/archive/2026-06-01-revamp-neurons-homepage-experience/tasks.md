## 1. Motion-library primitives (foundation — homepage consumes these)

- [x] 1.1 Locate the `neurons-motion-library` primitive module + its `/motion-demo` registry; confirm `useRespectsReducedMotion` + exported timing tokens are the integration points.
- [x] 1.2 Add an **ambient resting-state firing** primitive implemented with CSS `@keyframes` / compositor transforms (opacity/transform only, no per-frame JS rAF); gate on `useRespectsReducedMotion` (static when reduced).
- [x] 1.3 Add an **answer-resolution feedback-flash** primitive (correct → green firing pulse / incorrect → red dim); non-blocking; gate on `useRespectsReducedMotion` (static colour cue when reduced).
- [x] 1.4 Enhance the reward reveal-modal + celebratory toast primitives with an additional cinematic celebration layer (glow/particle/scale), reduced-motion gated, **within existing total durations**; do NOT mutate any already-published exported timing token (add new tokens additively if needed).
- [x] 1.5 Register the two new primitives (ambient firing + feedback flash) as isolated triggers on the `/motion-demo` route.
- [x] 1.6 `grep` existing consumers of reward-timing tokens (variant-gacha / dmn-fate-cards / achievements / connectome-collection) and confirm none break against unchanged token values. (`timings.ts` diff empty → token values intact.)

## 2. ConnectomeHero (lightweight presentational hero)

- [x] 2.1 Create `apps/neurons-tw/src/components/ConnectomeHero.tsx` — a compact, fixed-layout SVG of 4 NT branches + 11 family leaves consuming the `loadConnectome()` snapshot (no force-sim, no pan/zoom/drag).
- [x] 2.2 Apply state-driven edge styling (`dormant | weak | strong`) consistent with `neurons-clinical-aesthetic` signal palette; emphasize the synapse with the latest `lastCoFireDate`.
- [x] 2.3 Wire the ambient resting-state firing CSS layer into the hero (`.neuron-firing-node` nodes + `.neuron-signal-edge` on strong synapses).
- [x] 2.4 Make the hero active: click + keyboard Enter navigate to `/connectome`; add accessible role/label.
- [x] 2.5 Ensure responsive layout < 768px (no horizontal overflow, legible) using the project's RWD conventions.

## 3. DmnDrawProgressRing

- [x] 3.1 Create `apps/neurons-tw/src/components/DmnDrawProgressRing.tsx` reading `readDmnMeta()` (time-axis minutes + draw counters + cap) + `totalStudyMinutes`.
- [x] 3.2 Fill ring proportionally toward the next 30-min threshold; subscribe via Dexie liveQuery so it advances live.
- [x] 3.3 Render an explicit "今日抽卡已達上限" terminal state when the daily time-axis cap is reached (no false countdown).

## 4. Homepage onboarding

- [x] 4.1 Create a homepage first-visit onboarding panel gated on a new additive `meta['homepageOnboardingDismissed']` flag; brief + skippable + one-tap dismiss.
- [x] 4.2 Wire dismiss → set the meta flag; confirm it never re-renders after dismiss (incl. F5).
- [x] 4.3 Add the flag to the reset path (`resetConnectomeForDebug`) so a reset user sees onboarding again; leave the `/connectome` callout untouched.

## 5. Homepage composition (OverviewPage rework)

- [x] 5.1 Rework `apps/neurons-tw/src/routes/OverviewPage.tsx` into hook-top + dashboard-bottom: top = `ConnectomeHero` + `DmnDrawProgressRing` + onboarding; bottom = status chips + CTA + `FamilyPicker`.
- [x] 5.2 Remove the prose DMN rule line ("每 30 min 觸發 DMN 抽卡…"); the ring conveys it visually. Keep the credits/footer + Hebb framing.
- [x] 5.3 Preserve manual reading-timer start (no auto-start) and keep BOTH 🎲 random-quiz + `FamilyPicker` entries (no mega-button collapse); smooth the path only.
- [x] 5.4 Confirm the dense family-detail grid + synapse table are NOT added to the homepage (stay on `/connectome`).

## 6. Answer-feedback wiring

- [x] 6.1 Hook the feedback-flash primitive (1.3) into the quiz answer path (correct/incorrect resolution in the QuizModal) so it fires on answer resolution without blocking next-question flow.

## 7. Verification

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean; `pnpm --filter @study-rpg/neurons-tw test` → 89/89 pass.
- [x] 7.2 `pnpm --filter @study-rpg/neurons-tw build` succeeds (TS strict + Vite; only pre-existing chunk-size warning).
- [x] 7.3 Chrome MCP smoke on dev: hero renders (16 circles, 15 firing nodes) + routes to `/connectome`; ring shows "再讀 30 min…可抽 2"; onboarding shows once then gone after dismiss + reload; answer-flash fires (red on wrong, auto-clears, non-blocking); prose DMN rule absent; dense grid not on homepage; console clean.
- [x] 7.4 Reduced-motion: CSS `@media (prefers-reduced-motion: reduce)` ships and disables `.neuron-firing-node`/`.neuron-signal-edge`; every new primitive also gates on `useRespectsReducedMotion` in source (full OS-toggle emulation left to prod check).
- [x] 7.5 SPA 三件套: in-app nav to `/connectome` (hero click), direct-URL `/connectome`, and F5 on `/connectome` all render (dev). No new routes added → prod host config unchanged.
- [x] 7.6 Orphan check: removed `minutesUntilDmnDraw`, no unused style consts/imports (strict typecheck passes). Optional deeper `/simplify` pass available.

## 8. Deploy (owner-gated)

- [ ] 8.1 Confirm `apps/neurons-tw/.env.local` exists in the deploy worktree (`~/coding-scratch/study-rpg`) before deploy (per-app + per-worktree footgun).
- [ ] 8.2 Owner runs `pnpm deploy:cf`; re-run SPA 三件套 + reduced-motion check on prod (`med-study-rpg.com/neurons/`).
- [ ] 8.3 `gh run list --branch main --limit 5` (if pushed) / confirm CF Pages serves the new build (not a cached snapshot).
