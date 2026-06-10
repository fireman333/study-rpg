## Context

① (`add-neurons-exam-set-mock-mode`) shipped the 模擬考試 full-paper closed-book runner. Its submit handler (`MockExamRunner.tsx`, ~L112–120) already: computes `wrongOrUnansweredIndexes`, dispatches `submit`, and `Promise.all`-writes wrong/unanswered (送分 excluded) to the 錯題本 via `recordQuestionResult`, feeding the ⚔️出征 pool. This change appends a **gacha roll** to that same submit flow and persists collected mock variants in a new synced table.

The neurons maze collection (`neuronVariants`, PK `[familyId+slotIndex]`, P0–P5, soft-pity via slot floor, content-agnostic core `rollGachaWithFloor`) is the reference pattern — but the mock line is a **distinct pool** with its own catalog and no maze-slot semantics. Current footprint baselines: Dexie **v19**, R2 `SCHEMA_VERSION` **20**.

## Goals / Non-Goals

**Goals:**
- A self-contained mock-exam variant collection line: submit → score-tier-weighted roll → persist → reveal → collection view.
- Cross-device sync via a new R2 adapter; idempotent re-apply.
- Reuse the content-agnostic core gacha floor/pity helper; keep `packages/core` free of `P1..P5` / content literals.
- Ship MVP catalog + placeholder sprites; defer real art to a follow-up.

**Non-Goals:**
- No change to the maze `neuronVariants` pool, its collection view, or the "迷宮=唯一收集管道" invariant.
- No DMN / energy / maze-economy interaction.
- No leaderboard / D1 / sync Worker / Supabase change (mock collection is off the public board).
- No real sprite art (follow-up `generate-mock-variant-sprites`).
- No core lift (the relocated app-local `exam-set` engine and legacy `mock-exam.ts` stay untouched).

## Decisions

**D1 — Dedicated `mockExamVariants` table, NOT reuse `neuronVariants`.** `neuronVariants` PK `[familyId+slotIndex]` encodes a maze taxonomy slot; mock variants have no slot. Reusing it would mis-fit the PK, pollute the maze collection view, and contaminate the leaderboard variant count. New table PK = catalog `variantId` (string). Row: `{ variantId, rarity: 'P0'|'P1'|'P2'|'P3'|'P4'|'P5', displayName, spriteKey, copies, firstRolledAt, lastRolledAt }`. Alternative (reuse + `source` field) rejected for the PK-semantics reasons above.

**D2 — Sync model: per-row LWW + monotonic ownership; idempotent re-apply.** New `mockExamVariantsAdapter` mirrors `neuronVariantsAdapter` snapshot/apply. Merge policy: a row never un-creates (ownership monotonic); on conflict, `copies` merges **monotonic-max** and display fields LWW by `lastRolledAt`. Re-applying the SAME bundle is a pure replace-by-PK → idempotent. **Accepted trade-off**: two devices each rolling a dupe of the same variant between syncs may under-count `copies` (max, not sum) — acceptable for a single-user app where ownership, not exact dupe count, is the player-facing value. R2 `SCHEMA_VERSION` 20→21; reader-tolerance already drops unknown keys for old clients.

**D3 — Independent gacha: core floor/pity helper + app-side score-tier weights.** Reuse core `rollGachaWithFloor` (content-agnostic) for the floor/pity mechanic. The **score-tier → rarity weight table** is app/content-pack data, NOT in core. Default tiers (tunable, stated as defaults in spec): score bands `<60 / 60–79 / 80–89 / 90–100`, each a P5→P0 weight vector that shifts mass toward rarer at higher bands. Soft-pity: guarantee ≥P2 after N dry submits (mirror `variant-gacha.ts` silent soft-pity; N tunable). All numbers are dogfood-tunable game-design, not load-bearing requirements.

**D4 — Roll trigger placement.** New service `mock-variant-gacha.ts` exposes `rollMockVariant(score, stats, rng?)` (pure) + a persistence wrapper. `MockExamRunner` submit handler calls it AFTER the existing 錯題本 batch write, gated by the daily cap (D5). The roll result drives a reveal (`CelebrationHalo`/`ParticleBurst`) shown after the score screen.

**D5 — Per-paper daily cap (防刷).** A given `paperKey` grants a roll at most once per local day. Marker stored in synced `meta` as `mockVariantRollDates: Record<paperKey, isoDate>` (LWW via `metaAdapter`), so it roughly carries across devices; primary enforcement is local (anti-farm is soft — clearing local storage to reset is not a realistic single-user threat). 錯題本 write from ① is **unaffected** — only the roll is capped.

**D6 — MVP catalog + placeholder sprites.** Catalog lives in `packages/content-neurons-tw/` as a typed array of `{ variantId, rarity, displayName, spriteKey, neuroAnchorTODO }`. MVP size ~12–16 across P0–P5. Sprite render falls back to a glyph until `generate-mock-variant-sprites` lands. **Neuro-fact guardrail**: any NT-branch / anatomy / mechanism claim per catalog entry is flagged `neuroAnchorTODO` and MUST be OE-anchored (PMID) before identities are finalized; persona visual/story may be freer.

**D7 — Collection view.** A mock-variant collection section (own count only, e.g. `🧬 X` pure-count chip like the maze cards, no denominator, no leaderboard). Reachable from the 題庫/模考 area. Renders owned variants grouped by rarity with placeholder sprites.

## Risks / Trade-offs

- **[Concurrent multi-device dupe under-counts `copies`]** → monotonic-max merge (D2); accepted, ownership preserved, single-user scope.
- **[Dexie v20 upgrade breaks old clients]** → additive no-callback upgrade + mandatory v19→v20 sibling fixture (`docs/DEXIE_UPGRADE_FIXTURE_RULE.md`); `lint:dexie-fixtures` gate.
- **[Daily-cap reset via local clear]** → soft 防刷 by design; the cap is anti-farm convenience, not a security boundary.
- **[Catalog neuro-facts wrong → medical-student users notice]** → `neuroAnchorTODO` gate; OE-anchor before finalizing (project rule).
- **[Scope creep into maze pool]** → hard guardrail: zero edits to `neuronVariants` / its adapter / its collection view; enforced by grep + review.

## Migration Plan

Additive only. Dexie v19→v20 (new table, no data transform); R2 `SCHEMA_VERSION` 20→21 (new adapter key, old clients drop it harmlessly). No backfill: pre-existing players simply start with an empty mock collection. Rollback = `git revert` (table/adapter unused by older code; a v20 client that downgrades keeps the orphan table, harmless). Follow-up `generate-mock-variant-sprites` swaps placeholder glyphs for real PNGs with no schema change (spriteKey stable).

## Open Questions

- Exact MVP catalog size + per-entry neuro-identity (resolved during apply with `/oe` anchoring; placeholder-safe to scaffold first).
- Final score-band cutoffs + weight vectors + pity N + reveal copy — locked by dogfood after ship (tunable, zero-schema to retune).
