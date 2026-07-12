## Context

`add-neurons-exam-prep-hub` (shipped 2026-07-12) put a rescue **status strip** at the top of the 考前中心 hub (`/cram`): it renders one chip per active plan (D-countdown + RescueScore + 今日佇列) and mounts `RescueScene` in place, driving the same global `useRescuePlans` store. Independently, the homepage `FamilyPicker` header「考前救急」entry still opens the RescueScene multi-plan `'list'` phase — a plan-list overlay that is now a near-duplicate of that strip. The owner wants the standalone list gone and its function folded into the hub strip.

Key current-code facts that shape this design (read from source):

- `RescueScene` `Phase = 'list' | 'setup' | 'overview' | 'blitz' | 'session' | 'quickscan'`. The phase initializer resolves entry: `initialFamilyId` present → `blitz`/`overview`/`setup`; else `getActivePlans().length > 0 ? 'list' : 'setup'`.
- Three load-bearing paths must not regress (`neurons-exam-prep-hub-shipped` invariants): (a) **vanish-fallback** — a viewed plan abandoned mid-scene drops to `'list'` (or `setup`), NOT closing the whole scene; (b) **new-plan-lands-on-new-subject** — `setupFamily` defaults to the first subject without an active plan; (c) **untouched-setup redirect** — a fresh device that cold-booted to `setup` with `setupTouched === false`, once cloud plans land, is redirected to `'list'` so a tap can't mint a clobbering run.
- Because of (c), the naive way to make the hub「＋」land on setup (pass a no-plan `initialFamilyId`) does NOT work when other plans exist: the phase inits to `setup` but `setupTouched` is `false`, so the redirect bounces it to `'list'`.
- The homepage `FamilyPicker` header entry calls `onOpenRescue()` (undefined) → `RescueScene` `'list'`. The per-card chip calls `onOpenRescue(familyId)`; the handout `?rescue=<familyId>` return-loop calls the same `openRescue(familyId)` on `OverviewPage`. Both open a family scene directly.

## Goals / Non-Goals

**Goals:**

- The hub rescue strip is the single homepage-reachable place to see and add rescue plans.
- The homepage header「考前救急」entry routes to that hub instead of a duplicate overlay.
- Adding a plan from the hub is one tap → setup (add-new-plan), matching owner intent「進 setup」.
- Zero schema / zero sync: no Dexie bump, R2 `SCHEMA_VERSION` stays 28, no `SYNCED_META_KEYS` diff.

**Non-Goals:**

- **NOT** deleting the RescueScene `'list'` phase (it stays as fallback-only — vanish-safety + in-scene 切科 exit).
- **NOT** doing the `exitToHost` polish (the handoff's optional「hub 開單科時 backFromPlan → onClose」refinement) — deferred to a separate change.
- **NOT** touching the per-card rescue chip, the `?rescue=` return-loop, the four unit-correspondence deep-links, or any rescue sync/persistence semantics.
- **NOT** changing rescue setup, blitz, scoring, or the plan cap logic.

## Decisions

### D1. Add a narrow `startInSetup?: boolean` prop to RescueScene (the single conscious boundary crossing)

The hub「＋」must open setup directly (add-new-plan). Because path (c) — the untouched-setup cross-device-takeover redirect — is one of the three protected paths, forcing setup via a no-plan `initialFamilyId` would be bounced back to `'list'`. So a dedicated flag is the clean way that leaves those paths intact:

- When `startInSetup === true` **and** `initialFamilyId` is absent:
  - the phase initializer returns `'setup'`;
  - `setupTouched` initializes to `true` (a deliberate add — so the untouched-setup redirect effect, which only fires while `!setupTouched`, does not bounce it to `'list'`);
  - `setupFamily` keeps its existing default (first subject without an active plan).
- For every existing entry (`undefined`, or a `familyId`), `startInSetup` is falsy and behaviour is byte-identical — the three load-bearing paths are untouched.

**Alternative considered — reuse `initialFamilyId` with a no-plan subject:** rejected because it collides with path (c); the redirect would need to be weakened, which is exactly the protected behaviour we must not touch.

**Alternative considered — hub「＋」opens the `'list'` phase (zero RescueScene change), user taps ＋新增計畫 there:** rejected because it re-surfaces the very list this change is removing and adds a second tap; it also contradicts the owner's「＋ → 直接進 setup」. `startInSetup` is ~5 additive lines in the two `useState` initializers and is explicitly documented as the one boundary crossing (it replaces the handoff's deferred `exitToHost` polish as this change's conscious crossing).

### D2. Hub strip「＋ 新增計畫」affordance, gated `0 < activeCount < 5`

`CramPage` already renders per-plan chips when `rescuePlans.length > 0`. Add a low-key「＋」chip at the strip tail, rendered only when `0 < rescuePlans.length < 5`, wired to a new `openRescueSetup()` that mounts `RescueScene` with `startInSetup` (no `initialFamilyId`). At the 5-plan cap the「＋」is simply not rendered — the cap is enforced by absence, aligning with `neurons-single-subject-rescue`'s hard-cap-at-five (open/edit/abandon still available via the per-plan chips). The empty state (`rescuePlans.length === 0`) keeps its existing「建立考前救急」CTA. Reuse the existing rescue-strip palette (`#fdf2e0 / #d4a04d / #8a5a1f`) + `<EmojiIcon>`.

### D3. Homepage header entry → navigate('/cram'); keep RescueScene mounted for the two direct-family paths

`FamilyPicker` gains an `onOpenExamHub?: () => void` prop; the header「考前救急」button calls it instead of `onOpenRescue()`. `OverviewPage` passes `onOpenExamHub={() => navigate('/cram')}`. The per-card chip keeps `onOpenRescue(s.id)`, and `OverviewPage` still mounts `RescueScene` (for the per-card chip and the `?rescue=` return-loop, both of which open a family scene directly). The button label stays「考前救急」— navigating to the hub lands on its top rescue strip (= the plan list), so the label reads coherently.

### D4. RescueScene `'list'` phase retained as fallback-only

The `'list'` phase code stays. Add a comment marking it fallback-only (vanish-safety + in-scene 切科 exit), NOT a homepage entry destination. Deleting it would degrade the cross-device abandon UX (`neurons-multi-subject-rescue`: abandoning family A drops to the list showing family B, rather than closing the scene).

### D5. Zero schema / zero sync

No Dexie `.version()`, R2 `SCHEMA_VERSION` stays 28, no `SYNCED_META_KEYS` diff, no new deep-link URL format. `startInSetup` is ephemeral React prop state; the hub「＋」and the header nav are pure navigation.

## Risks / Trade-offs

- **`startInSetup` crosses the「don't touch RescueScene internals」boundary** → Mitigation: kept to two additive `useState` initializer branches, guarded by an explicit prop; the three load-bearing paths are verified unchanged for existing entries; documented here + in code as the single conscious crossing (replacing the deferred `exitToHost`).
- **`neurons-homepage` was MODIFIED very recently and is MODIFIED again** → Mitigation: this delta is tiny and touches only the header-entry requirement (behaviour/wording: open overlay → navigate to hub); no other homepage requirement changes.
- **Feel: the homepage entry becomes a cross-page navigation instead of an in-place overlay** (one extra transition) → accepted per owner; the hub's top-of-page rescue strip makes the rescue surface immediately visible on landing.
- **The `'list'` phase becomes「homepage-unreachable but still present」** → Mitigation: retained + commented as fallback-only; do NOT treat it as dead code / delete it (a dead-code audit must skip it).

## Migration Plan

Pure client UI/IA change, no data migration. Deploy = merge to `main` (triggers CF Pages). Rollback = revert the change (no persisted state touched; R2 `SCHEMA_VERSION` unchanged, so no downgrade fence interaction). Existing users see the homepage header entry route to `/cram` and the hub strip gain a「＋」on next load — no re-login, no cloud-save impact.

## Open Questions

- None blocking. Optional future polish: the deferred `exitToHost` refinement (hub-opened single-plan scene closes back to the hub strip rather than the `'list'` phase) — out of scope here.
