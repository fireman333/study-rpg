## Why

neurons-tw currently carries **two parallel "squad" concepts** that confuse players and duplicate intent: (a) the maze expedition animation band (`MazeExpedition.tsx` `useExpeditionSquad`) auto-derives the five rarest collected variants and only shows on a manual「🚀 顯示遠征動畫」opt-in; (b) the player-picked **active squad** (`study-squad.ts` `useActiveSquad`) drives the QuizModal correct-answer celebration. A player who carefully assembles their squad sees it celebrate on answers but NOT in the marching animation — the animation shows a different, auto-picked set. Merging them into one player-chosen squad「神經元遠征隊」, shown consistently across the maze band + the answering screen + the celebration, makes the chosen party feel real everywhere. (Owner grill 2026-06-04: `~/.claude/scratch/grilled-neurons-隊伍改名合併-2026-06-04.md`.)

## What Changes

- **Merge two squads into one.** The maze expedition animation band SHALL render the player's **active squad** (`useActiveSquad`) instead of an auto-rarest-5 set. The active squad becomes the single source feeding all three surfaces: the maze homepage band, the QuizModal answering band (new), and the correct-answer celebration.
- **Empty-squad fallback.** When the active squad is empty, the band SHALL fall back to the existing「five rarest collected variants」logic (the current `useExpeditionSquad` rule, demoted to a fallback helper — not deleted), and to growth-cone marchers when the collection itself is empty.
- **Rename → 神經元遠征隊.** The player-picked squad's UI labels (squad panel / 「編輯隊伍」 / band title) SHALL read「神經元遠征隊」. (Deliberately NOT「DMN遠征隊」 — avoids collision with the DMN fate-card system; the DMN↔divergent-thinking neuroscience link is OE-grounded and kept as future copy material, see design.) The 出征 wrong-question drill action is a **separate concept** and is NOT renamed.
- **Auto-trigger replaces the manual opt-in.** On the maze homepage, the band SHALL auto-play while **reading is active** (`reading-timer.ts` `status === 'reading'` via `useReadingTimer`) instead of requiring the manual「🚀 顯示遠征動畫」button. During a quiz session, a **compact, semi-transparent** band SHALL render in the upper background of `QuizModal` (smaller than the homepage band).
- **Opt-out hide toggle.** A persisted「關閉動畫」preference (default shown) SHALL let the player hide the band in both contexts; `prefers-reduced-motion` SHALL freeze it as today. (Flips the existing opt-in default-hidden semantics to auto-show + opt-out.)
- **Cosmetic-only, zero schema/sync change.** Squad membership grants **no gameplay bonus** (selecting who marches only affects visuals). NO Dexie `.version()` bump, NO R2 `SCHEMA_VERSION` bump, NO worker/migration change — the active squad already persists in the existing `activeSquad` synced meta. Gameplay bonuses for squad members are explicitly **out of scope** (roadmap Phase 3 acceleration/equipment lane).

## Capabilities

### New Capabilities
<!-- None. This is a rework of two existing capabilities. -->

### Modified Capabilities
- `neurons-maze-expedition`: the animation band's foreground squad source changes from auto-rarest-5 to the player's active squad (with rarest-5 → growth-cone fallbacks); the band gains a compact semi-transparent variant rendered in the QuizModal answering screen; the show/hide model flips from default-hidden opt-in to reading-active / quiz-session auto-play with a persisted opt-out hide toggle; band title renamed 神經元遠征隊. Cosmetic-only constraint (no read/mutate of maze state) is retained.
- `neurons-study-squad`: the active squad is renamed 神經元遠征隊 and is established as the single source of truth feeding both the homepage party/celebration AND the maze expedition animation band (previously the band used its own independent auto-pick).

## Impact

- **Code**: `apps/neurons-tw/src/components/MazeExpedition.tsx` (read `useActiveSquad` + fallback; add a `compact` variant; subscribe to `useReadingTimer` + the hide preference) · `apps/neurons-tw/src/components/QuizModal.tsx` (mount the compact translucent band in the upper background) · `apps/neurons-tw/src/routes/OverviewPage.tsx` (maze homepage: replace manual show button with auto-trigger + keep a hide toggle) · `apps/neurons-tw/src/components/StudySquadPanel.tsx` + squad picker labels (rename → 神經元遠征隊) · a small persisted hide-preference helper (localStorage, mirrors the existing band visibility persistence).
- **Reused as-is**: `study-squad.ts` `useActiveSquad` selection/persistence (unchanged mechanics) · `reading-timer.ts` reading-active signal · `SquadCelebration` (already reads the active squad).
- **No schema / sync / backend**: no Dexie bump, no R2 `SCHEMA_VERSION` bump, no worker/migration/D1. Zero overlap with the parallel `add-neurons-acceleration-system` change.
- **Cosmetic-only**: squad membership has no gameplay effect; `neurons-maze-expedition`'s「MUST NOT read/mutate maze state」invariant is preserved (the band reads reading-timer state + squad selection — both player state, not maze state).
- **Open design detail resolved at clarify**: the QuizModal band plays during the whole quiz session (compact + translucent, upper background); the homepage band plays during reading-active; both honor the opt-out toggle + reduced-motion.
