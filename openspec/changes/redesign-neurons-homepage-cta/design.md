## Context

The neurons-tw homepage (`OverviewPage.tsx`) renders the daily loop across three disconnected surfaces (standalone connectome status strip at lines 389–425, the ⚔️ 錯題出征 button inside the CTA toolbar at 445–464, and a free-floating `<DmnDrawProgressRing/>` at 487), plus a 🎲 隨機跨 family 答題 entry (432–441) that players rarely use. The causal chain that drives retention — 出征 (clear wrong questions) → 修復連線 (wire the connectome) → DMN 抽卡 (earn draws) — is not legible at a glance.

Design was locked via `/grill-me` (Quick, software-project pack); summary at `~/.claude/scratch/grilled-neurons-homepage-cta-redesign-2026-06-10.md`. This is a presentation-only change: every value shown is already engine-computed; the UI only re-arranges and re-styles. Zero schema/sync/Dexie/R2/Worker change.

## Goals / Non-Goals

**Goals:**
- Make the 出征 → 修復連線 → DMN 抽卡 causal chain readable in one glance via a single themed stat card placed as the homepage's top dashboard above the maze (top-to-bottom: 儀表板 → 迷宮 → 神經元遠征隊 → 收藏 chips → 各科 family grid).
- Remove the unused 🎲 random-quiz entry and its dead code, leaving per-family quiz-mode chips as the sole homepage answering entry.
- Keep the year filter meaningful and discoverable by co-locating it with the family practice grid it now scopes.
- Preserve every existing safeguard: one-way reveal of ⚔️ 出征 for never-wrong players, honest empty states, cap-aware DMN terminal state, reduced-motion behavior.

**Non-Goals:**
- No change to engine reward math, expedition logic, DMN draw economy, or connectome wiring rules.
- No schema/sync/Dexie/R2/Worker change; no new meta keys.
- No change to the maze centerpiece, StudySquadPanel, status chips semantics, or the family grid's per-family quiz/reading entries.
- No new gameplay bonus implied by the card — it only presents engine state (consistent with the existing "UI SHALL NOT itself grant or compute" rule).

## Decisions

### D1 — Horizontal three-stage + arrow card layout, placed as the top dashboard above the maze
The merged card is the homepage's **top dashboard, mounted above the maze centerpiece** (top-to-bottom homepage order: 儀表板 → 迷宮 → 神經元遠征隊 → 收藏 chips → 各科 family grid). This restores the ⚔️ 出征 primary CTA to the first-glance position and makes the requirement title ("compose as a CTA toolbar **over** the interactive tree panel") literally accurate. The card itself reads left-to-right as the causal chain: **頂部全寬 ⚔️ 出征 主 CTA** → below it a three-stage row `今日出征狀態 → 修復連線數據 → DMN 進度` separated by arrow glyphs. Chosen because the arrow explicitly teaches the cause→effect ordering (a dashboard grid or undifferentiated left/right split does not). On narrow viewports (< 768px) the three stages wrap and stack; the arrows degrade to vertical separators or are dropped so stacking stays legible.
- *Alternative considered*: left action column + right DMN ring (no arrows) — rejected, weaker causal signal. Two-stacked (action over data) — rejected as the safe-but-flat fallback; we adopt its stacking only as the mobile reflow of the horizontal design.

### D2 — DMN progress ring → horizontal bar
To fit the horizontal three-stage row, the DMN-draw indicator becomes a horizontal progress bar (fill = `dmnTimeAxisDrawsConsumedToday / DMN_EXPEDITION_DAILY_CAP`, same data source as the ring). The cap-aware terminal state (「今日抽卡已達上限」) is preserved as an explicit end state rather than a misleading countdown. Implemented by adding a `variant="bar"` (or a sibling bar renderer) to `DmnDrawProgressRing.tsx` rather than a parallel component, to keep the cap-aware logic single-sourced.
- *Alternative considered*: keep the circular ring inside the card — rejected, breaks the horizontal rhythm and wastes vertical space on the card's third stage.

### D3 — Core-4/5 default + expandable 「詳細」 disclosure
Default-visible core signals: 今日出征 ✓/✗・🔥 連續 N 天・穩定連線數・DMN 今日抽/上限. A 「詳細」 toggle expands to reveal the remaining three (最強 pair・本週 X/7・⚡ 今日連線額外能量). Chosen so the card stays "一眼看懂" while no signal is lost. The disclosure is local UI state (no persistence needed; cosmetic).
- *Alternative considered*: show all six always — rejected, density defeats the glanceability goal. Drop the extra three entirely — rejected, they are useful to engaged players.

### D4 — ⚔️ 出征 button as full-width top primary CTA, preserving one-way reveal
The ⚔️ 錯題出征 button is the card's prominent primary CTA (full-width, high-contrast top band), satisfying the existing spec "⚔️ 錯題出征 = prominent primary CTA". The `neurons-onboarding` one-way reveal is preserved: a never-wrong new player sees **guidance text in the primary-CTA slot**, not a dead disabled button; once they have ever answered wrong the button is revealed and persistent (and MAY still render its existing disabled「無錯題」state when currently zero wrong). The card otherwise renders an honest empty state (zeroed signals + 「答錯題開始修復連線」 guidance) for a fresh account.

### D5 — YearFilterBar is a render-location move, not a state change
`<YearFilterBar/>` reads/writes global meta `quiz.yearFilter` via `useYearFilter`/`setYearFilter`; the per-family quiz pool already year-scopes via `filterPoolByYear(byFamily, yearSet)` ([OverviewPage.tsx:176](apps/neurons-tw/src/routes/OverviewPage.tsx:176)). Moving the bar to the top of the FamilyPicker section is therefore pure render relocation — no prop drilling, no state lift. It is hosted inside `FamilyPicker.tsx` at the top of its grouped grid so it visually belongs to "選 family 直接練習".

### D6 — 🎲 removal scope
Remove the 🎲 button (432–441) and prune its now-dead dependencies after a repo-wide grep: `openRandomQuiz` handler, the random branch of the `quizEntry`/`quizPool` memo (171–172), `totalPoolSize` if no longer referenced (195–198), the random count badge, and `randomQuizButtonStyle`. The 🎲 entry was the toolbar's only remaining content besides the hint text and YearFilter; after removal the toolbar keeps only its hint line.

## Risks / Trade-offs

- [🎲 removal leaves orphaned references in tests / other components] → grep `openRandomQuiz`, `randomQuizButtonStyle`, `totalPoolSize`, and `🎲` across the repo before deleting; update any test asserting the 🎲 entry's presence.
- [Spec keyword "ring" appears in a requirement title + scenarios; missing one leaves spec drift] → the spec delta MODIFIES the full requirement block (title + all scenarios) replacing "ring" with "bar"; `openspec validate` after archive confirms coherence.
- [Merged card could read as implying a gameplay bonus] → card text stays descriptive of engine state only; reuse existing narrative-indicator wording, no new "bonus" phrasing (honors the existing "UI SHALL NOT grant/compute" requirement).
- [Mobile reflow of the horizontal layout could overflow] → the three-stage row uses `flex-wrap`; verified < 768px has no horizontal overflow during /verify Chrome MCP RWD probe.
- [DMN bar variant could diverge from ring's cap logic] → bar is a variant of the same `DmnDrawProgressRing` component sharing the cap-aware computation, not a fork.

## Migration Plan

Presentation-only; no data migration, no rollback risk to saves. Ship path follows repo pipeline: `/opsx:apply` → `/simplify` → `/opsx:verify` → `/verify` (Chrome MCP: `/` render + RWD reflow + F5 + console clean; assert 🎲 absent, merged card present as top dashboard above the maze, order 儀表板→迷宮→遠征隊→chips→family grid, YearFilter at top of FamilyPicker, DMN bar) → `/opsx:archive` → commit → merge `track-neurons` → main → `pnpm deploy:cf` → prod bundle-verify. Rollback = revert the single presentation commit; no save-state implications.

## Open Questions

(none — all design facets resolved in the grill; year-filter consumption verified in code before propose.)
