## Context

Two cosmetic squad concepts exist independently (see proposal Why). The active squad already has full selection + persistence + cross-device sync (`neurons-study-squad`: `activeSquad` synced meta envelope, `MAX_SQUAD_SIZE`, stale-member pruning) and already drives `SquadCelebration`. The maze band (`neurons-maze-expedition`) is a pure CSS-parallax cosmetic with its own `useExpeditionSquad` auto-pick + a default-hidden opt-in toggle. neurons-tw also has a working reading timer (`reading-timer.ts` exposing `status: 'idle'|'reading'|'paused'` + `onReadingTimerStateChange` + `useReadingTimer` hook). This change unifies the squad source and re-wires the band's trigger; it is entirely presentational.

## Goals / Non-Goals

**Goals:**
- One player-chosen squad「神經元遠征隊」visible consistently across maze band + answering band + celebration.
- Auto-trigger the band on reading-active and during quiz sessions, replacing the manual opt-in, with a persisted opt-out hide toggle.
- Zero schema / sync / gameplay change — purely cosmetic re-wiring + rename.

**Non-Goals:**
- No gameplay bonus from squad membership (Phase 3 acceleration/equipment lane — out of scope).
- No change to the active-squad selection mechanics, persistence, or sync (reused verbatim).
- No change to the 出征 wrong-question drill or its DMN draw entitlement (separate concept; not renamed).
- No new Dexie table / `.version()` bump / R2 `SCHEMA_VERSION` bump / worker change.

## Decisions

### D1 — The active squad is the single source; `useExpeditionSquad` becomes a fallback helper

`MazeExpedition` reads `useActiveSquad()`. When the result is empty, it falls back to the existing rarest-5 derivation (the current `useExpeditionSquad` body, kept as a named fallback helper), and to growth-cone marchers when the collection is empty. **Why:** preserves the「never an empty band」guarantee while making the chosen party authoritative. Alternative (delete the auto-pick entirely, show growth cones when no squad) rejected — a brand-new player with collected-but-unassigned variants would see generic cones instead of their rarest neurons, a worse first impression.

### D2 — Two render sites for one band component via a `compact` variant

The same `MazeExpedition` component renders in two places: the maze homepage (full size) and the QuizModal upper background (compact + semi-transparent). A `compact?: boolean` (or `variant: 'home' | 'quiz'`) prop scales height + opacity + particle density. **Why:** one component, one squad source, one animation vocabulary — avoids a divergent second implementation. The compact band is `pointer-events: none` + low opacity so it never competes with the answer UI. Alternative (separate lightweight quiz band component) rejected — duplicates the parallax/squad logic.

### D3 — Trigger model: reading-active (home) + quiz-session (modal), both opt-out

- **Home band**: subscribes to `useReadingTimer`; plays when `status === 'reading'`, static otherwise. Replaces the manual「🚀 顯示遠征動畫」button.
- **Quiz band**: mounted inside `QuizModal`, plays for the duration the modal is open (a quiz session is inherently active study).
- **Hide toggle**: a single persisted「關閉動畫」preference (localStorage, mirroring the existing band visibility persistence) suppresses the band in BOTH contexts. Default = shown. `prefers-reduced-motion: reduce` freezes to a static scene (unchanged).

**Why:** the band should reward active study moments without manual fiddling, but a player who finds it distracting / wants to save battery can switch it off once and have it stick. The answering band is compact + translucent specifically because the answer UI is primary.

### D4 — Cosmetic-only is preserved; reads player state, not maze state

The band now reads two new inputs — `reading-timer` status and the active-squad selection — both of which are **player/session state, not maze game state**. The `neurons-maze-expedition`「MUST NOT read from or mutate any maze game state」invariant is intact (no growth-signal / settle / region-count read or write). **Why:** keeps the band firmly in the cosmetic lane and out of the parked Phase-3 gameplay lane.

### D5 — Rename is UI-label-only; 出征 untouched

「神經元遠征隊」replaces the squad's display labels (panel header / 「編輯隊伍」 / band title). The squad's meta key (`activeSquad`), `VariantKey` shape, and all mechanics keep their identifiers — rename is presentational, so no migration. The 出征 (all-subject wrong-question drill) is a separate action and keeps its name. **Why:** avoids touching synced data; per `coding_principles` minimal-surface — a label change shouldn't ripple into storage.

### D6 — Name is「神經元遠征隊」, not「DMN遠征隊」

Owner chose「神經元遠征隊」over「DMN遠征隊」to avoid collision with the DMN fate-card system. The DMN↔divergent-thinking↔offline-replay link the owner intuited is genuinely OE-grounded (Shofty 2022 Mol Psychiatry `10.1038/s41380-021-01403-8` causal DMN↔creativity; Kaefer 2022 Nat Rev Neurosci `10.1038/s41583-022-00620-6` replay/DMN/consolidation; Menon 2023 Neuron `10.1016/j.neuron.2023.04.023` review — full list in the grill doc), and is retained as **future flavor/copy material** rather than a system name. **Why:** one「DMN」brand in the app avoids player confusion while keeping the scientifically-sound narrative available.

## Risks / Trade-offs

- **QuizModal already-busy header / overlapping content** → Mitigation: the quiz band is `position: absolute` upper-background, low opacity, `pointer-events: none`, behind the stem/options; verified via Chrome MCP that it doesn't obscure text or intercept clicks.
- **Reading-active band flicker on rapid start/pause** → Mitigation: drive visibility off the debounced `useReadingTimer` status; CSS opacity transition smooths show/hide; no per-frame work (CSS-only per the existing reduced-motion/perf requirement).
- **Players who liked the old auto-rarest band** → the empty-squad fallback (D1) preserves exactly that experience until they assemble a squad; no regression for non-squad players.
- **Shared multi-session worktree** (parallel `add-neurons-acceleration-system`, uncommitted) → Mitigation: explicit per-file `git add` + `git diff --cached --name-status` gate at commit (per `multi_agent_git_safety`); this change's files (MazeExpedition / QuizModal / OverviewPage / StudySquadPanel / labels / hide-pref helper + the openspec change dir) are disjoint from the acceleration change.

## Migration Plan

1. No data migration (rename is label-only; no schema/sync change).
2. Existing players: the band simply starts auto-playing during reading / quiz (default shown); their existing active squad now also drives the band; if they never assembled a squad, the fallback shows the same rarest-5 they saw before.
3. Rollback: revert the component edits; the `activeSquad` meta + reading-timer are untouched, so no state cleanup needed.

## Open Questions

- Exact compact-band dimensions / opacity in QuizModal (tuned at apply time via Chrome MCP against the answer UI).
- Whether the hide toggle lives as a small chip on the maze homepage only, or is also reachable from within QuizModal (default: homepage chip controls the single shared preference; the quiz band honors it without its own control to keep the answer UI clean).
