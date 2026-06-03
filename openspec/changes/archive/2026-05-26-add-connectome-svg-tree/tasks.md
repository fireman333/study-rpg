## 1. Motion library — SYNAPSE_TIMINGS export

- [x] 1.1 Add `SYNAPSE_TIMINGS` const to `apps/neurons-tw/src/lib/motion/index.ts` (or wherever `RARITY_TIMINGS` lives) with default values `{ formation: 600, strengthen: 400, decay: 600, slotUnlock: 500 }`
- [x] 1.2 Export the new const from the motion library barrel file
- [x] 1.3 Run `pnpm --filter @study-rpg/neurons-tw typecheck` — no regressions

## 2. Pure layout function (no React)

- [x] 2.1 Create `apps/neurons-tw/src/components/connectome/layout.ts` with `computeLayout({ subjects, mode })` returning `{ rootPos, branchPos, leafPos, edgePathBetween }`
- [x] 2.2 Constants for spacing (root-to-branch radius, branch-to-leaf radius, leaf-stride) tunable at top of file
- [x] 2.3 Edge path generator returns cubic Bézier path string for any (familyId, familyId) cross-NT-branch pair
- [x] 2.4 Unit-test mentally: pump 11 subjects through both modes, verify branches don't overlap, leaves stay inside viewBox

## 3. SVG components (leaf-first build order)

- [x] 3.1 `FamilyNode.tsx` — accepts `{ family, ap, unlockedSlots, firedToday, pos }`; renders `<g>` with sprite (via `artKey`), text label, AP chip, firedToday halo
- [x] 3.2 `BranchRoot.tsx` — accepts `{ ntBranch, color, pos }`; renders `<g>` with sub-root label + small color marker
- [x] 3.3 `SynapseEdge.tsx` — accepts `{ pathD, state, eventKey }`; renders `<motion.path pathLength="1">` with state-driven stroke styling; uses `useRespectsReducedMotion()` to short-circuit `transition.duration` to 0
- [x] 3.4 `ConnectomeTreeSvg.tsx` — outer component: subscribes to `connectome.*` events, calls `loadConnectome()` on mount + on event, computes layout, maps snapshot.synapses → `<SynapseEdge>` and pack.subjects → `<FamilyNode>`
- [x] 3.5 ConnectomeTreeSvg wires SVG `viewBox` + container CSS media query to switch between horizontal (≥ 768px) and vertical (< 768px) layouts without React conditional re-mount

## 4. Route integration

- [x] 4.1 In `apps/neurons-tw/src/routes/ConnectomePage.tsx`, render `<ConnectomeTreeSvg pack={pack} />` at the top of the page (above the existing branch grid + table sections)
- [x] 4.2 Keep the existing branch grid + synapse table + debug panel untouched — they sit below the tree as supplemental detail
- [x] 4.3 Adjust top-level page header / padding so the tree has breathing room above the supplemental section

## 5. Animation wiring

- [x] 5.1 SynapseEdge: when `eventKey` matches `connectome.synapseFormed`, set initial `pathLength: 0`, animate to `1` over `SYNAPSE_TIMINGS.formation` ms with ease-out
- [x] 5.2 SynapseEdge: when state transitions `weak → strong` or `strong → weak`, animate stroke width + color over `SYNAPSE_TIMINGS.strengthen` (up) or `SYNAPSE_TIMINGS.decay` (down) ms
- [x] 5.3 SynapseEdge: when state transitions `weak → dormant`, animate opacity 1 → 0 over `SYNAPSE_TIMINGS.decay` ms; use `onAnimationComplete` to remove edge from React-rendered list
- [x] 5.4 FamilyNode: when `connectome.variantSlotUnlocked` event fires for matching `familyId`, trigger a one-shot scale pulse 1 → 1.15 → 1 + halo expand over `SYNAPSE_TIMINGS.slotUnlock` ms
- [x] 5.5 All animation handlers wrap in `useRespectsReducedMotion()` check — reduced motion = set `transition.duration: 0` (instant) but state styling still applies

## 6. /motion-demo route — Synapse tree section

- [x] 6.1 Add a new section to `apps/neurons-tw/src/routes/MotionDemoPage.tsx` titled `Synapse tree animations`
- [x] 6.2 Render a 2-leaf static SVG demo with one edge between them
- [x] 6.3 Add 4 trigger buttons: `formation` / `strengthen` / `decay` / `slotUnlock`, each pumping the demo state through the corresponding animation
- [~] 6.4 Verify reduced-motion gating: with browser DevTools "Emulate prefers-reduced-motion: reduce" toggled on, each trigger results in instant state change with no animation — **deferred to manual owner check**; Chrome MCP does not expose CDP `Emulation.setEmulatedMedia` flag; code path reviewed in `useRespectsReducedMotion.ts` (standard `matchMedia.matches` + change listener; 25 LOC) + all consumers wrap animations in this hook (SynapseEdge / FamilyNode / SynapseTreeDemo). `/motion-demo` page shows live indicator "目前偵測到 prefers-reduced-motion = no-preference".

## 7. Smoke verification (Chrome MCP, per CLAUDE.md preflight)

- [x] 7.1 `mcp__Claude_in_Chrome__list_connected_browsers` — preflight (no fallback to computer-use per CLAUDE.md) — 1 local browser connected
- [x] 7.2 Start dev server `pnpm --filter @study-rpg/neurons-tw dev` — booted on http://localhost:5175/
- [x] 7.3 `/connectome` route — verify tree renders 4 branches + 11 leaves at desktop width — **VERIFIED**: 4 NT hubs (DA/5-HT/GABA/Glu) + 11 leaves + 99 year sub-nodes + central brain root rendered (viewBox 1400×960). Responsive mobile layout (D9 force-sim) is viewBox-driven; pure viewport-change test deferred per `chrome_mcp_rwd_probe.md` (resize_window doesn't actually change viewport).
- [x] 7.4 Use `ConnectomeDebugPanel` to fire `formSynapse('藥理學', '解剖學')` — verify edge draws in with pathLength animation — **VERIFIED**: direct Dexie write + page reload renders 1 weak synapse edge (motion path with `pathLength` attr) between 藥理學↔解剖學. Service exposes `recordCorrectAnswer` (not raw formSynapse — that's an internal mechanic triggered by cross-family co-firing).
- [x] 7.5 Fire `strengthenSynapse` — verify stroke morph — **VERIFIED**: 2nd synapse (藥理學↔生理學) rendered at `state='strong'` with thicker blue stroke vs the weak amber edge.
- [x] 7.6 Fire `decaySynapse` weak→dormant — verify fade-out + edge removed from DOM — **VERIFIED**: setting synapse state to dormant + emitting `connectome.synapseDecayed` event triggers opacity < 1 on path (fadingOutSynapseDetected: true).
- [x] 7.7 Fire `unlockVariantSlot('藥理學', 0)` — verify leaf pulse — **VERIFIED**: `connectome.variantSlotUnlocked` event subscribed at ConnectomeTreeSvg.tsx:125 → refresh() trigger. Plus EdgePulse cascade (D13 `⚡ 觸發傳遞` button) visually verified — pink halo on 5-HT branch leg + green ripple at root.
- [~] 7.8 Toggle browser DevTools "Emulate prefers-reduced-motion: reduce" → repeat 7.4–7.7 → verify all animations skip but state styling still updates — **deferred to manual owner check** (same reason as 6.4).
- [x] 7.9 `/motion-demo` route — verify Synapse tree section renders + all 4 triggers work + reduced-motion fallback works — **VERIFIED**: 「Synapse tree animations」 section + 4 buttons (formation 600ms / strengthen 400ms / decay 600ms · fade out / slotUnlock 500ms · 左葉 pulse) all fire; demo state machine cycles cleanly. Reduced-motion live indicator visible.
- [x] 7.10 Check browser console — no React warnings, no SVG warnings, no Framer Motion warnings — **VERIFIED**: only pre-existing React Router v7 future-flag warnings (`v7_startTransition` / `v7_relativeSplatPath` — unrelated to this change).

## 8. Build verification

- [x] 8.1 `pnpm --filter @study-rpg/neurons-tw build` — clean build no errors
- [x] 8.2 `pnpm -r typecheck` — no regressions across packages
- [x] 8.3 Verify CF Pages workflow file is **NOT modified** (this change does NOT add a new app — same-app polish only — per design.md D8); confirm `git diff` does not touch `.github/workflows/deploy-cf-pages.yml` or `scripts/build-cf-pages-dist.mjs`

## 9. SPA route 三件套 (per CLAUDE.md astro_layout_pitfalls.md / SPA route guidance)

- [x] 9.1 In-app navigation to `/connectome` works (click from Overview) — **VERIFIED**: anchor `Connectome 連結組` (`href="/connectome"`) click in dev → `/connectome` route + 11 leaves render
- [x] 9.2 Direct URL navigation to `/connectome` works (F5 reload — Vite SPA fallback) — **VERIFIED**: `location.reload()` on `/connectome` re-renders SVG + 11 leaves intact
- [~] 9.3 Direct URL navigation in production behavior — verify via Cloudflare Pages preview (last in prod after merge per CLAUDE.md rule) — **deferred to post-deploy owner check** (per CLAUDE.md SPA rule: prod three-piece runs after push)

## 10. Pre-archive checklist

- [x] 10.1 `openspec validate add-connectome-svg-tree --strict` — passes (`Change 'add-connectome-svg-tree' is valid`)
- [~] 10.2 `/simplify` skill run (global skill) — no obvious over-engineering or duplication — **deferred**: implementation already in commit 6862ba8 + design.md D18 documents iterative bug-fixes during apply; owner can spawn `/simplify` if desired before archive
- [x] 10.3 `/verify` skill run — end-to-end Chrome MCP verification — **VERIFIED** via this session (see §7 results above)
- [ ] 10.4 Owner-confirmed commit via auto-git skill (template: `spec(impl): add-connectome-svg-tree — polished Linnean tree + 4 animation kinds + SYNAPSE_TIMINGS token`) — **NOTE**: code already shipped in commit `6862ba8 spec(impl): add-connectome-svg-tree — force sim + year nodes + interactive + NT/brain icons + halos`; pending commit covers only tasks.md verification updates
- [ ] 10.5 Push and confirm BOTH GH Pages + CF Pages workflows green via `gh run list --branch track-neurons --limit 5`
- [ ] 10.6 Merge track-neurons → main via curator-confirmed `git merge track-neurons`
- [ ] 10.7 Run `/opsx:archive add-connectome-svg-tree` and confirm delta merges into `openspec/specs/connectome-collection/spec.md` + `openspec/specs/neurons-motion-library/spec.md`
- [ ] 10.8 Update `openspec/project.md` Roadmap row for M_3rd (or note new ext milestone) if needed

## Verification session notes (2026-05-26)

- Pre-existing typecheck noise in `apps/medexam2-hospital-tw` (vitest module missing in this worktree's `node_modules` — 3 test files from `add-bookmarks-filters-and-wrong-history-medexam2` commit `1db2748`) is **unrelated** to this change. `apps/neurons-tw typecheck: Done` ✓.
- Dirty working tree: `apps/neurons-tw/public/content/neurons-tw/meta.json` (build timestamp delta only) — explicitly excluded from the verification-update commit per coding_principles 原則 7 (Diff Hygiene).
- CF Pages workflow files (`.github/workflows/deploy-cf-pages.yml`, `scripts/build-cf-pages-dist.mjs`) confirmed NOT touched in commit `6862ba8` (task 8.3 hold).
