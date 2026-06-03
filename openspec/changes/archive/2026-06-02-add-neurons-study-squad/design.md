## Context

`apps/neurons-tw` already has: a collected-variant store (`neuronVariants`, Dexie v9), a per-family
representative selection (`representatives.ts` — stored as a synced `meta` envelope, LWW via an
`onPullComplete` backfill), a `QuizModal` with an existing hero-variant "correct flourish" hook, a
`questionHistory` store (`lastResult` + monotonic `everWrong`) backing the `/bookmarks` 錯題 tabs, a
`quiz-pool.ts` pool-filter helper, and an R2 bundle at `SCHEMA_VERSION = 7` with a forward-compat
reader (unknown keys dropped, `schema_version > local` tolerated).

This change is Phase 1 of the "Collection 2.0" mini-milestone. It is intentionally the smallest,
lowest-risk slice — no collection-mechanic change, no rewards. It establishes the squad/expedition
surface that Phase 4 rewards plug into.

## Goals / Non-Goals

**Goals:**
- A player-assembled active squad, persisted + synced, reusing collected-variant data + `VariantSprite`.
- The squad rendered as a party on the connectome homepage (no graph crowding, responsive, reduced-motion).
- A correct-answer celebration in `QuizModal` at the moment the affect lands.
- An all-subject wrong-question 出征 that reuses `QuizModal` + `questionHistory`.
- A clean no-op reward seam for Phase 4.

**Non-Goals:**
- No gacha flip, pull currency, P0 tier, dupe fusion, or permanent-passive multipliers (Phases 2–6).
- No change to the "no 優劣" philosophy or P1–P5 rarity.
- No new Dexie table / schema migration (squad rides the `meta` envelope).
- No per-family 出征 (deferred; v1 is all-subject only).
- No veteran-flair / expeditionCount visuals (Phase 5, merged into the 特色 layer).

## Decisions

### D1 — Persistence = synced `meta` envelope, NOT a Dexie table
The active squad is a small structured value (`{ members: VariantKey[], updatedAt }`). The
`representatives.ts` precedent stores nearly-identical per-family selection data as a `meta` key
envelope with LWW via an `onPullComplete` backfill (the bare `meta` adapter is first-write-wins). We
mirror it exactly: new key `activeSquad`, new `lib/services/study-squad.ts` with `read/set/remove` +
`pickActiveSquadLWW` + `filterStaleSquadMembers`. **Consequence: no Dexie `.version()` bump → no
`dexie-fixture-lint` trigger, no upgrade fixture.** (This is a deliberate simplification of the
original Phase-1 sketch, which assumed a new table.)

### D2 — Squad cap `MAX_SQUAD_SIZE`
A "party" wants a small, legible cap. **Confirmed: 5** (owner sign-off 2026-06-02). Exposed as a single
constant so it remains trivially tunable from dogfood telemetry.

### D3 — Celebration renders inside `QuizModal` at the correct-answer moment
The grill flagged where the affect lands. Answering happens in `QuizModal`, which already plays a hero
flourish on `isCorrect`. The squad celebration renders there (a party row that bounces in sync on the
correct reveal), not on the homepage after returning. Reuses the existing `isCorrect` branch + the
`.neuron-sprite--alive` reduced-motion pattern. Empty squad → no-op.

### D4 — 出征 pool = cross-subject `lastResult === 'wrong'`
Two candidate pools exist: `lastResult === 'wrong'` ("目前未答對") and `everWrong === true` ("歷史曾錯").
For a drill, the actionable set is what you currently get wrong, so 出征 targets `lastResult === 'wrong'`
across **all** subjects (no family filter). `everWrong` (which includes already-re-mastered questions)
is the archival view and is left to `/bookmarks`. New `lib/services/expedition.ts` builds the pool by
intersecting `pack.questions` with the wrong `questionHistory` rows; the homepage 出征 action opens
`<QuizModal pool={wrongPool} />`. Empty pool → empty-state, no modal.

### D5 — Reward seam = single no-op `onExpeditionComplete`
`expedition.ts` exposes `onExpeditionComplete(session)` invoked when an expedition session ends; in this
phase it is a documented no-op (returns nothing, grants nothing). Phase 4 (`add-neurons-expedition-rewards`)
replaces the body with probabilistic supplement dispatch. Keeping it a single named seam avoids Phase 4
having to rework the QuizModal/homepage wiring.

### D6 — Sync = meta allowlist + LWW backfill + R2 bump 7→8
Add `'activeSquad'` to `SYNCED_META_KEYS` in `lib/sync/tables.ts`. Add `backfillActiveSquadLWW` to the
`onPullComplete` hook (mirror `backfillRepresentativesLWW`). Bump `SCHEMA_VERSION` 7 → 8 in
`lib/sync/r2/bundles.ts` + extend the history comment. The existing forward-compat reader already
tolerates both directions (v7 client drops `activeSquad`; v8 client reading a v7 bundle preserves local).

### D7 — Empty / partial collection
Squad selection only offers collected variants; a player with zero collected variants sees the
assemble-squad placeholder and an empty celebration no-op. 出征 is independent of squad state (it drills
wrong questions regardless of who is in the party), so a player can 出征 with an empty squad — they just
get no celebration company.

## Risks / Trade-offs

- **Homepage real estate**: the party row must coexist with the connectome SVG + existing quiz entry +
  year filter. Mitigation: place it as a distinct row/panel, verify no overlap at mobile width via the
  CSS-class RWD probe (resize_window is unreliable — see `chrome_mcp_rwd_probe.md`).
- **Meta-adapter first-write-wins footgun**: forgetting the LWW backfill would make squad edits not
  propagate correctly. Mitigation: unit-test `pickActiveSquadLWW`; mirror the representatives backfill
  exactly; inline doc the "bare meta adapter is NOT LWW" caveat.
- **Hollow-without-rewards**: Phase 1 has no reward, so the 出征 loop is intrinsically (not extrinsically)
  motivating until Phase 4. Accepted per the roadmap; the celebration + party ambient affect carry it.
- **`prefers-reduced-motion`**: a new animation surface that must honor the setting; covered by a
  scenario + mirrors the existing alive-sprite handling.
- **Chrome-MCP animation verification**: rAF-driven celebration may appear "frozen" in a backgrounded
  MCP tab — assert terminal state / `document.visibilityState`, don't wait for the bounce (see
  `chrome_mcp_raf_throttle.md`).
