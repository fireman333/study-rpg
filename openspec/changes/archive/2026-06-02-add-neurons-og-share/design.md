# Design — add-neurons-og-share (capability `neurons-character-card`)

## Context

Greenfield social/share layer for neurons-tw. All card data is already client-side; v1 deliberately stays backend-free and schema-free. Built in worktree `study-rpg-neurons-og` on `feat/neurons-og-share`, branched from the neurons track; merged to `main` serially by the owner from the main worktree (NOT by this lane).

## Decisions

### D1 — Native Canvas 2D, no new dependency
Render with the browser `CanvasRenderingContext2D` (`fillRect` / `fillText` / `drawImage`), not `html2canvas` or any new lib. Rationale: project constraint「新 dependency 要 vibe-coding-friendly」+ Simplicity First; pixel-perfect deterministic control; sprites are already plain PNG URLs that `new Image()` + `drawImage` consume directly; avoids html2canvas font/CSS-rendering quirks. `imageSmoothingEnabled = false` so pixel sprites scale crisply at integer factors.

### D2 — Pure data layer, render layer, export layer split
- `pickBranchRepresentatives(variants, representatives, accrual)` → **pure** function (one variant per NT branch), unit-testable with no DOM.
- `buildCharacterCardPayload(userId)` → async aggregator over Dexie reads, returns a plain serialisable `CharacterCardPayload` (numbers + strings + sprite keys).
- `renderCharacterCard(ctx, payload, assets)` → imperative draw, takes preloaded assets (so it is synchronous + the test can pass a mock ctx).
- `exportCharacterCard(canvas)` → `toBlob` → download / Web Share.
This keeps everything DOM-free except the thin render + export, which is what makes it testable and keeps the canvas concerns isolated.

### D3 — Representative selection = one per NT branch (DA / 5HT / GABA / Glu)
The card's "hero row" shows up to 4 representative neurons, one per NT branch, conveying the player's connectome lineage at a glance. Selection per branch: prefer the player's explicitly-chosen representative (from the `meta` representative envelope) among that branch's families; else the highest-rarity collected variant in the branch (tie → highest family AP → most recent `rolledAt`). A branch with zero collected variants renders an empty/silhouette slot. Branch membership comes from `FAMILY_NT_BRANCH` (single exported source in the content pack, reused — no second copy, coding principle §6).
> Alternative considered: "connectome snapshot" mini-map (rasterise the connectome SVG). Deferred — heavier (SVG→canvas), and the 4 branch reps + the strong-synapse stat already convey the connectome shape. Listed in Out of Scope.

### D4 — Card content (🚧 GATE 1 — owner confirms)
Recommended v1 layout, top→bottom on a portrait card:
1. **Header** — nickname (fallback「神經元研究員」when unset) + selected title chip if any; small "neurons" wordmark.
2. **Hero row** — 4 per-branch representative sprites (pixel art), each under its NT-branch colour accent + family label.
3. **Stats panel** (dark EEG-signal styled) — 總 AP / 強連結 synapse 數 / 收集 X/55 變體・X/11 科完成 / 累積唸書 N 小時.
4. **Footer** —「med-study-rpg.com/neurons」+ render date.
- **Dimensions**: portrait **1080×1350** default (Threads/IG/messaging friendly). Adjustable; landscape 1200×630 (true OG ratio) is the alt if the owner prefers link-preview framing.
- 累積唸書 may read 0 until the reading-timer is wired in neurons-tw (`readTotalStudyMinutes` exists but study-category triggers are placeholdered) — shown regardless; not blocking.

### D5 — Share entry point (GATE 1 → owner chose `/collection`)
**Decided**: a「分享角色卡」button on the `/collection` (variant dex) page that opens `ShareCardModal`. Sits next to the variants being shown off — thematically coherent, and keeps the header uncluttered on mobile.
- (Rejected alts: header top-right control; `/leaderboard` page button.)
One entry point in v1.

### D6 — Privacy / opt-in (🚧 GATE 1 — owner confirms)
**Recommended**: no separate privacy gate. The card is generated locally and only published by the player's explicit download/share tap → inherently opt-in. No email / user_id / account id is ever drawn; nickname is optional with neutral fallback. The leaderboard opt-in is unrelated and NOT required to make a card.
- **Alt**: require a nickname to be set first (or reuse the leaderboard opt-in modal) before allowing share. Heavier; only if the owner wants the card gated behind an identity step.

### D7 — OG meta (static generic only; per-player dynamic is Out of Scope)
A real per-player `og:image` that social crawlers fetch needs a server to render the image at a crawlable URL — crawlers do not run the player's client JS. That requires a backend → **Out of Scope for v1**. v1's deliverable is the **downloadable/shareable PNG**. Optionally (secondary task) add a single **static, generic** branding `og:image` to `index.html` for the app's link preview — a cheap win, shippable independently, and not blocking the card.

### D8 — Graceful degradation (never a broken card)
Preload every needed sprite Image + the Cubic 11 FontFace (`document.fonts.load`) before draw; `Promise.allSettled` so a failed sprite just yields an empty slot and a missing font falls back to `'Noto Sans TC', sans-serif`. Empty collection → card still renders (zeros + silhouette slots), never blank or thrown. No Silent Errors: export failures (toBlob null / share rejected) surface a user-visible message in the modal, not a swallowed catch.

### D9 — Zero schema / sync footprint (lane-isolation guarantee)
No Dexie `.version()` bump (so no `dexie-fixture-lint` trigger), no R2 bundle `SCHEMA_VERSION` bump, no new adapter, no new synced state. This is the explicit constraint that keeps `feat/neurons-og-share` from racing version numbers with the parallel collection-rework lane.

## Risks / Open Questions

- **Tainted canvas**: variant sprites are same-origin app assets (Vite-bundled URLs) → `toBlob` will not taint. Verify in smoke; if any sprite is cross-origin, set `img.crossOrigin = 'anonymous'`.
- **Font timing**: Cubic 11 may not be in `apps/neurons-tw/public/fonts/` yet (build-step dependent). Card must not block on it — fallback font is acceptable; a task verifies the font path and adds it if trivial.
- **Web Share file support** varies; download is the always-available baseline.
- jsdom has no real canvas — render test uses a mock 2D context asserting the draw calls fire without throwing; pixel-correctness is covered by the Chrome MCP visual smoke, not unit tests.
