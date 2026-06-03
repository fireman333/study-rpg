## Context

`apps/neurons-tw` homepage (`/`, `src/routes/OverviewPage.tsx`) is text + buttons + chips: a status-chip row, a hero title + Hebb quote, a CTA section (manual reading-timer toggle + random-quiz button), and the `FamilyPicker`. The signature visual — the connectome phylogenetic tree (`ConnectomeTreeSvg`, 664 lines, rAF force-sim + pan/zoom/pinch) — lives only on `/connectome`, alongside a dense family-detail grid and synapse table.

Already wired and reusable (verified this session):
- `reading-timer.ts` accrues `meta['totalStudyMinutes']` per game-minute and fires `dmnReadingTimerSubscriber.onMinutesAccrued(1)` → `accrueReadingMinutes` (`dmn-trigger.ts`), which counts 30-min thresholds within a daily cap and grants DMN time-axis draws. `readDmnMeta()` exposes the time-axis minute counter + draw counters + caps.
- `loadConnectome()` returns the snapshot (families, `familyAccrual`, synapses with `dormant|weak|strong` state).
- `neurons-motion-library` provides Framer-Motion primitives: per-rarity reveal modals, generic Toast, SVG-tree synapse animations, spike-train firing + signal-oscillation primitives, the `useRespectsReducedMotion` hook, exported timing tokens, and a `/motion-demo` self-verify route.

Constraints: live site on Cloudflare Pages (`med-study-rpg.com/neurons/`); `packages/core` stays content-agnostic; reading timer stays manual-start (誠信防護); 60fps + mobile raf-throttle friendly + `prefers-reduced-motion` fallback required; no IAP/monetary path.

## Goals / Non-Goals

**Goals:**
- Homepage hooks visually (top) and serves as a progress dashboard (bottom) in one page.
- Game mechanics are shown as visuals (hero tree + progress ring), not text rules, so the user just reads + quizzes.
- Reward moments feel more cinematic everywhere, via shared-primitive enhancement (no per-consumer edits).
- First-visit onboarding lowers the "what do I do" barrier without becoming recurring friction.
- All new motion degrades cleanly under reduced-motion and survives SPA direct-URL + F5.

**Non-Goals:**
- NOT merging the dense family-detail grid + synapse table onto the homepage (stays on `/connectome`).
- NOT mounting the heavy interactive `ConnectomeTreeSvg` on the homepage.
- NOT auto-starting the reading timer; NOT collapsing the CTA into one mega-button.
- NOT adding page-transition animation.
- NOT touching Dexie schema, R2 bundle, Worker, or `packages/core`.

## Decisions

### D1 — Hero tree is a brand-new lightweight presentational component (not reuse / not extracted)
Build `ConnectomeHero` (new) that consumes the `loadConnectome()` snapshot and renders a compact, stable-layout SVG of the 4 NT branches → 11 family leaves with state-driven edge styling, plus a gentle ambient firing animation, and routes to `/connectome` on click/Enter.
- **Why not reuse `ConnectomeTreeSvg`**: 664 lines of rAF force-simulation + pan/zoom/pinch is wrong for a landing hero — perf cost, accidental drag/pan, and the background-tab rAF-throttle pitfall. A hero wants *stable* positions, not a physics sim.
- **Why not extract shared layout primitives**: the interactive tree derives node positions from force-sim; the hero wants fixed taxonomy positions. Sharing a layout util couples two components with different positioning models — any change to one risks the other. A purpose-built component is simpler and decoupled.
- Layout uses fixed/precomputed branch+leaf positions (taxonomy is static: 4 branches, 11 families). Recent-synapse highlight = pick the synapse with max `lastCoFireDate`.

### D2 — "Next DMN draw" progress ring reads real DMN time-axis state, cap-aware
Replace the homepage text rule line with a `DmnDrawProgressRing` driven by `readDmnMeta()`: progress = minutes into the current 30-min threshold; also surfaces today's granted/remaining time-axis draws and a "今日抽卡已達上限" state when the daily cap is reached.
- **Why not the existing naive `30 - (totalStudyMin % 30)`**: it ignores the daily cap and keeps "counting down" even when no more draws can be granted today — misleading. The ring must reflect cap state.
- Ring covers the **time-axis** story only ("reading accrues toward a draw"); behavior-axis draws (variant/synapse events) surface via their own toasts, not the ring.

### D3 — Reward-celebration enhancement at the motion-library primitive level
Enhance the shared reveal-modal / toast celebration primitives in `neurons-motion-library` (richer visual layering — glow/particle/scale accents — and tuned timing) so synapse-formed / variant-unlocked / DMN-draw / achievement reveals upgrade everywhere. Consuming capability specs (variant-gacha, dmn-fate-cards, achievements, connectome-collection) are unchanged.
- **Token compatibility**: existing exported timing tokens that downstream code budgets against (e.g., per-rarity totals for batch wall-time prediction) are **preserved or superseded additively** — no silent change to a published constant's value that would break a consumer's batch budgeting. New layers ride within existing total durations where possible; if a new token is needed it is added, not mutated.
- **Why primitive-level over per-consumer**: one edit, no drift, every reveal benefits; matches the library's existing "primitives are the contract" convention.

### D4 — Ambient + answer-feedback motion: CSS-first, reduced-motion gated, self-verifiable
- **Ambient resting-state firing** on the hero = a new reusable primitive in `neurons-motion-library`, implemented with **CSS `@keyframes` / compositor-driven transforms** (opacity/transform only) rather than per-frame JS rAF. This is intentional: CSS animations survive background-tab throttling (avoids the rAF-throttle "looks frozen" pitfall) and stay cheap at 60fps.
- **Answer-resolution feedback flash** = correct → green firing pulse, incorrect → red dim; hooked into the existing quiz answer path (`recordCorrectAnswer` / `recordIncorrectAnswer` consumers in the quiz UI). Homepage-scoped trigger, but the flash primitive itself lives in motion-library for reuse + `/motion-demo` self-verify.
- Both gate on `useRespectsReducedMotion`: reduced-motion drops animation but preserves the state-change cue (color/opacity end-state).

### D5 — First-visit onboarding persisted via Dexie meta flag
Render a brief, skippable onboarding panel on the homepage gated on `meta['homepageOnboardingDismissed']` (new additive meta key). One-tap dismiss sets the flag; never reappears. The account-reset path clears the flag (so reset users see it again — mirrors the existing `/connectome` callout reset behavior). The `/connectome` first-visit callout is **kept** (different entry point).
- **Why meta table over localStorage**: meta is the app's established small-flag store; consistent with how other neurons UX flags persist. The flag is a local UX preference — no sync requirement.

### D6 — Homepage structure: hook (top) + dashboard (bottom), hard no-merge boundary
Top (hook): `ConnectomeHero` + `DmnDrawProgressRing` + onboarding (first visit only). Bottom (dashboard): existing status chips (keep EEG signal styling per `neurons-clinical-aesthetic`) + smoothed CTA (manual reading toggle + 🎲 random + `FamilyPicker`). Dense `/connectome` content stays put. This keeps the page short and keeps the friction-reduction promise.

## Risks / Trade-offs

- [Hero tree perf on low-end mobile] → fixed-layout SVG (no force-sim), CSS-driven ambient, small node count (≤ ~15 nodes + few edges); no rAF loop on the landing page.
- [Primitive enhancement silently breaks a downstream timing budget] → preserve/supersede exported tokens additively; re-run `/motion-demo` and grep consumers for token usage before archive.
- [Progress ring misleads at daily cap] → ring reads `readDmnMeta()` cap state and renders an explicit "已達上限" terminal state instead of a false countdown.
- [Onboarding becomes recurring friction] → one-tap dismiss + persistent flag + skippable; verified it never reappears after dismiss + F5.
- [Live-site regression on a redesigned homepage] → SPA 三件套 (in-app nav + direct `/` URL + F5) on prod after `pnpm deploy:cf`; manual-timer + no-mega-button constraints preserved; reduced-motion path checked.
- [Chrome MCP verify sees "frozen" ambient animation] → ambient is CSS-driven (compositor), so it animates even in a backgrounded tab; verify asserts the rendered end-state + presence of animation, not a watch-it-play loop (per rAF-throttle discipline).

## Migration Plan

Pure frontend change. No Dexie version bump, no R2 bundle schema change, no Worker change → no cross-version/backward-compat concerns. The onboarding flag is an additive meta key (absent = treated as "not yet dismissed").

Deploy: build + `pnpm deploy:cf` from the deploy worktree (`~/coding-scratch/study-rpg`); ensure `apps/neurons-tw/.env.local` exists there (per-app + per-worktree footgun). Rollback: revert the commit and redeploy — no data to unwind.

## Open Questions

- Exact visual treatment of the hero tree (how literal vs stylized, density of ambient firing) — resolved in apply via dogfood screenshot iteration, not blocking the spec.
- Whether the reward-primitive enhancement should introduce any net-new exported timing token or stay within existing totals — decided during apply based on whether the richer layering fits current durations.
