> ## ⚠️ PIVOT (2026-06-04, owner — during live verify) — companions live in the EXPEDITION BAND, not the brain-map
>
> The owner rejected the brain-map overlay on sight: **"夥伴不放 brain-map，出征動畫才顯示"**. The
> companion render moved from a `CompanionLayer` overlay on `MazeBrainMap` to **marchers appended to
> the `MazeExpedition` squad parade** (capability `neurons-maze-expedition`). They now appear **only**
> in the expedition animation (homepage band + compact QuizModal 出征 band), never on the brain-map.
>
> **Superseded** (mount/layout specifics only): Decision 2 (`CompanionLayer` overlay on the brain-map),
> Decision 3 (soft float / `pointer-events:none` / decoupled-from-walker), Decision 5 (clutter cap),
> Decision 6 (its own reduced-motion gate) — companions now **inherit the band's** `exp-bob` /
> depth-stagger / paused-hidden / reduced-motion treatment, and there is no separate component, no
> brain-map mount, no float keyframe, no cap. **Still standing**: Decision 1 (catalog `companion` flag),
> Decision 4 (placeholder-first `companion:<id>` → `equipment:<id>` sprite), Decision 8 (zero-schema).
> Modified capability is `neurons-maze-expedition`, not `neurons-brain-maze` / `neurons-homepage`.

## Context

`add-neurons-acceleration-system` introduced an `equipment` Dexie table holding owned permanent items (12-item P1–P5 catalog, 2 lanes: speed/myelin + energy/metabolic). Each owned item contributes an additive passive into the energy/speed acceleration pools and shows as a card in `EquipmentDexPanel`. Design Decision 3 of that change framed them as "independent following sprites (companion / pet / aura), never body-worn" — but only the dex + passive shipped; **nothing follows the player on screen**.

Architectural fact that shapes this change: per `neurons-homepage` + `neurons-brain-maze` ("Maze is the homepage route", shipped via `promote-maze-to-home`), the **maze brain-map IS the homepage centerpiece** (`MazeBrainMap.tsx` mounted on `/` inside a fixed-height panel, with `OverviewPage.tsx` owning the single `useMaze`). So "the maze explorer view" and "the homepage" are largely the *same* surface. A companion overlay composited over the brain-map therefore appears on the homepage by construction.

OE anchors are inherited from the acceleration design (oligodendrocyte + astrocyte are the catalog's two *living cells*; glia physically ensheath/associate with neurons — the in-universe justification for "they follow you"). No new neuroscience claim is introduced.

## Goals / Non-Goals

**Goals:**
- Owned **living-cell glial companions** render as floating/following animated sprites over the maze brain-map (= homepage centerpiece).
- The "is a following companion" set is **declared in the catalog** (single source of truth), not hardcoded in the view.
- A single shared presentational component serves every surface that hosts the brain-map.
- Zero schema/sync change; identical companions derive on every device from the already-synced owned set.
- Respect `prefers-reduced-motion` and survive SPA direct-URL + F5 (homepage NFR).

**Non-Goals:**
- No change to the acceleration passive math, DMN draw path, backpack/inventory, or equipment dex.
- No new Dexie/R2 schema, adapter, or synced meta key.
- No body-worn / rig-anchored sprite (avoids the medexam sprite-alignment landmine).
- No real animated-frame art in this change (placeholder-first; deferred follow-up).
- No new glial companion catalog items (would require fresh `/oe`).

## Decisions

### Decision 1 — Companion subset is a catalog flag `companion: true` (not a hardcoded id list, not lane-derived)

Add an optional `companion?: boolean` to `EquipmentDef` (`equipment-types.ts`) and set `companion: true` on the two glia entries (`eq-oligodendrocyte-companion-p3`, `eq-astrocyte-glycogen-p3`). A pure helper `livingCompanionDefs()` / `livingCompanions(ownedIds)` filters the catalog.

- **Why over a hardcoded id list in the view**: catalog stays the single source of truth; adding a future glial companion item is a one-field catalog edit, no view change.
- **Why over lane-derived** (e.g. "all speed-lane items follow"): lane ≠ aliveness. Myelin wraps / nodes of Ranvier are speed-lane but are *structures*, not cells — they should not follow. The owner decision is explicitly "only living cells".
- **Additive / non-breaking**: existing consumers ignore the new optional field; the build-time equipment validator is unchanged (companion is orthogonal to lane/rarity/bonus).

### Decision 2 — One overlay component, mounted over the brain-map (which is the homepage)

New `apps/neurons-tw/src/components/CompanionLayer.tsx`: a `position:absolute` floating layer that subscribes owned `equipment` via `useLiveQuery`, maps to `livingCompanions`, and renders ≤ `N` floating sprites. It mounts **inside the maze brain-map container** (`MazeBrainMap.tsx`). Because the brain-map is the homepage centerpiece, this single mount satisfies "both surfaces".

- **Why one mount, not two**: maze == homepage; a second mount on non-maze homepage chrome would double-render the same companions. If a *separate* surface ever shows the brain-map (e.g. a future dedicated route), the layer rides along automatically since it lives inside `MazeBrainMap`.
- The `neurons-homepage` delta records that the homepage *surfaces* the layer (via its maze centerpiece); `neurons-brain-maze` delta records that the brain-map *composes* the layer.

### Decision 3 — Soft ambient float, decoupled from the walker transform (not rigidly pinned)

Companions drift gently within the brain-map viewport (a slow CSS float/bob/orbit), **not** hard-pinned to the exploration walker sprite's exact per-frame transform.

- **Why decoupled**: pinning to the walker means tracking an rAF-driven transform — fragile under the known Chrome-MCP rAF-throttle behavior and prone to 1px alignment drift. A soft ambient float reads as "companions accompanying you through the brain" without coupling to the walker's animation loop. (Also dodges the body-worn alignment landmine entirely.)
- Sprites are `pointer-events: none` so they never intercept maze interaction (frontier clicks, branch chips).

### Decision 4 — Animation is placeholder-first; real frames are a flagged follow-up

This change ships the render + motion *system* driven by the **existing static `equipment:<id>` sprite** with CSS `@keyframes` float/bob (and reduced-motion → static). The real multi-frame idle sheet is generated in a separate follow-up **`generate-companion-animation-frames`** (Gemini/codex batch, mirroring `generate-acceleration-sprites`), which swaps the asset with no code change (same `artworkId`, or a new `companionArtworkId` resolved with `?? equipment:<id>` fallback).

- **Why split**: gameplay + the render contract ship now without blocking on a sprite batch; the static-with-CSS-float placeholder is presentable.

### Decision 5 — Clutter cap `N`, rarest-first

Render all owned companions up to `COMPANION_RENDER_CAP` (default **3**; only 2 are possible today, so the cap is headroom for future glia). Sort rarest-first so the highest-tier companion is always shown if the cap bites.

### Decision 6 — Reduced-motion + SPA robustness

Under `prefers-reduced-motion: reduce`, companions render static (sprite shown, no float animation) — satisfying the homepage reduced-motion NFR. The layer is pure client-derived state (liveQuery), so it reconstructs correctly on direct-URL load and F5.

## Risks / Trade-offs

- **maze == homepage double-mount** → Decision 2: mount once inside `MazeBrainMap`; no separate homepage-chrome mount.
- **Pinning to rAF walker transform is fragile** → Decision 3: soft ambient float, decoupled.
- **Static placeholder floating may read as "flat"** → acceptable interim; `generate-companion-animation-frames` follow-up replaces with real idle frames.
- **On-screen clutter as catalog grows** → Decision 5 cap `N` rarest-first.
- **Sprite intercepts maze clicks** → `pointer-events: none` on the layer.
- **Owner expected companions over the *whole* homepage, not just the maze panel** → see Open Questions; default is over the brain-map panel (its natural habitat). Cheap to widen at apply if owner wants.

## Migration Plan

1. Catalog: add `companion?: boolean` to `EquipmentDef` + `companion: true` on the 2 glia entries + `livingCompanions` helper (additive).
2. `CompanionLayer.tsx` + CSS float keyframes; mount inside `MazeBrainMap.tsx`.
3. Tests: companion-subset predicate + render assertion (owned glia → sprite mounts; owned non-glia → none; cap honored; reduced-motion → static).
4. Ship static-sprite placeholder; queue `generate-companion-animation-frames` follow-up.
- **Rollback**: purely additive presentational layer — remove the mount (or the component) to revert; no schema/data to unwind.

## Open Questions

- **Float habitat** — RESOLVED (owner, live verify): NOT the brain-map. Companions march in the **expedition band** (`MazeExpedition`) squad parade, appearing in every context the band renders (homepage reading band + compact QuizModal 出征 band).
- **Asset handle** — RESOLVED: the band resolves `companion:<id>` first → falls back to the static `equipment:<id>`, so the `generate-companion-animation-frames` follow-up swaps in animated sheets with zero code change.
- **Band-context scope** (non-blocking): companions currently show in BOTH band contexts (homepage band + QuizModal compact band). If the owner later wants them in the 出征 QuizModal band only, gate the append on `compact` / a context prop — trivial follow-up.
