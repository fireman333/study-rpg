# Design

## Issue 1 — on-band hide control + live visibility

### Decision 1: Carve out one interactive control on the otherwise non-interactive compact band

The compact QuizModal band is `pointer-events: none` by spec (so it can never intercept the answer UI). Rather than make the whole band interactive, the single on-band `×` control gets `pointer-events: auto` while the band wrapper keeps `pointer-events: none`. Because the band is already an **in-flow strip** between the title bar and the question body (not an overlay), a clickable `×` in its top-right corner cannot overlap the stem/options on any viewport — the existing "compact band stays out of the way" guarantee is preserved.

**A11y:** a focusable button inside an `aria-hidden` subtree is an anti-pattern. Today the compact wrapper carries `aria-hidden={compact ? true : undefined}`. The fix keeps the decorative parallax layers hidden from assistive tech but renders the `×` control so it is reachable — the simplest implementation drops `aria-hidden` from the wrapper (it already has `aria-label="神經元遠征隊動畫"`) and the decorative inner layers stay individually `aria-hidden`. The control carries its own `aria-label="隱藏遠征動畫"`.

### Decision 2: Glyph is a minimize `−` (collapse), not a close `×`, on both bands

The control's job is to **collapse** the decorative band (restorable any time via the Help menu), not to permanently close it. A minimize `−` communicates "you can bring this back" far better than a close `×`, which reads as a dismiss. The owner explicitly prefers the collapse semantic as more flexible. So both bands render `−`, and the spec + Help copy are aligned to describe a 收合 (collapse) affordance. (The original spec wrote the glyph as `×` while calling it a "minimize control" — an internal inconsistency this change fixes by standardizing on `−`.) The `aria-label`/`title` are 收合遠征動畫. Pure copy/visual change.

### Decision 3: Reactive visibility via a tiny subscribe/notify in `expedition-visibility.ts`

Today `getExpeditionHidden()` is read once into `useState` by each consumer, so a write in one surface (Help-menu pill, maze `×`) never reaches an already-mounted other surface. Add a minimal pub-sub to the single-source-of-truth module:

```
const listeners = new Set<() => void>()
export function subscribeExpeditionHidden(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn) }
// setExpeditionHiddenPref(...) now notifies listeners after writing localStorage
```

Consumers (MazeGrid, QuizModal) read via a small `useExpeditionHidden()` hook that `useState(getExpeditionHidden)` + `useEffect(subscribe → re-read)`. HelpMenu's pill already calls `setExpeditionHiddenPref`, so its restore now live-shows the band in any open quiz/homepage. No new dependency, no event-bus framework — a Set of callbacks is enough for same-tab cross-component sync. (Cross-**tab** sync is out of scope; a `window 'storage'` listener could be added later but is not needed for the reported bug.)

**Why not lift state to a context/store?** Overkill for one boolean read by two components; the module-level Set keeps the existing `expedition-visibility.ts` single-source-of-truth contract and is the smallest change that fixes the live-update gap.

### Decision 4: Collapse leaves an in-place `＋ 展開` restore handle (minimize/restore pair)

The owner's key requirement: after collapsing, the restore control must be **visible on-screen**, not buried in the Help menu. So collapsing does NOT remove the band's slot entirely — it replaces the band with a **slim in-place restore handle** (`ExpeditionRestoreStub`, a small `＋ 展開遠征動畫` pill) rendered where the band was, in BOTH contexts. Clicking it re-shows the band live (via the reactive store). The `＋` mirrors the on-band `−`, so the pair reads as the familiar minimize ⇄ restore idiom.

This intentionally supersedes the original spec's "no persistent show toggle; restore only via Help menu" model: there is still no always-visible toggle *while the band is shown* (the band auto-plays; only the `−` collapse is offered), but once collapsed the `＋` handle is the on-screen restore. The Help-menu restore pill stays as a redundant convenience (and a global entry point). The stub is deliberately minimal (a thin cream pill) so collapsing still meaningfully reduces visual noise.

## Issue 2 — HelpMenu category grouping

### Decision 5: A presentational category layer over the existing `SECTIONS` array

Keep `SECTIONS` (id + icon + title + body) untouched. Add a `CATEGORIES` list mapping each category (label + emoji) to an ordered list of section `id`s. Render: for each category, a **static, non-collapsible** header label, then that category's `<details>` sections nested beneath. The single-expand-one-section behavior (`expandedId: string | null`) is unchanged — it already keys on section `id`, which is globally unique across categories, so opening a section in one group still collapses the open section in any other group.

**Why static headers, not collapsible groups?** The owner wants the menu more scannable, not a second layer of click-to-open. Static labels add scanability with zero extra interaction depth and the least churn to the accordion logic + its scenarios.

**Membership ordering** follows Codex's「使用者旅程」principle: 先學會用 → 找題與複習 → 核心 loop → 收集 → 長期成長/社交 → 支援/危險操作; `account-reset` stays last with its existing danger styling. Section titles are kept as-is (conservative — Codex's rename suggestions are recorded in the proposal Out of Scope).

### Verification approach

- **Vitest / typecheck:** `pnpm --filter @study-rpg/neurons-tw test` + `pnpm -r typecheck` stay green (no logic/economy change).
- **Chrome MCP live smoke** (per project imports):
  - Desktop: open a quiz → confirm the compact band shows a top-right `×` → click it → band hides; reopen quiz → band stays hidden; open Help → 出征模式 →「顯示遠征動畫」→ band reappears in the open quiz live.
  - Mobile RWD: use the forced-width class-override probe (NOT `resize_window`) to confirm the `×` is reachable and the band still never overlaps the stem at < 600px.
  - HelpMenu: confirm 6 category headers render with sections nested, single-expand still works across categories.
