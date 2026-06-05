## Context

The weave-grid maze (`redesign-neurons-maze-rotjs-grid`) commits `grid-graph.json` with `synapses: [{ cell, families:[A,B], over, under }]` (~135 crossings). Each family's 10 variant-slot `nodeCells` sit at crossings (`synapse: true`), padded with route cells when a family has < 10 crossings. The variant row (`NeuronVariantRow`) already carries `familyId` + `slotIndex`. A provenance/caption layer exists: `variantBirthCaption(row)` is the single caption helper, used by `VariantUnlockModal` (mint reveal) + `CollectionPage` (individual view); `variant-decor.ts` is the precedent for **pure-derived** display data (context-art from provenance, zero new state).

Owner-requested 2026-06-05 (handoff item 3). The OE research is done: `~/.claude/scratch/neurons-circuit-location-candidates-2026-06-05.md` — 105 OE-grounded names (27 tracts / 44 nuclei / 24 circuits / 22 named synapses) with 中文 + function + PMID.

## Goals / Non-Goals

**Goals:**
- Name every crossing-synapse with a real, OE-grounded neuroanatomical structure (build-time, deterministic, routes untouched).
- A collected variant at a named crossing reads 「在 <location> 尋獲」 — surfaced via the existing single caption helper.
- Zero schema/sync change (pure-derived from `(familyId, slotIndex)` + committed graph), mirroring `variant-decor`.

**Non-Goals:**
- Per-rarity location flavoring (lyrical names → rare variants) — deferred.
- A maze hover/label UI or a named-circuit legend — deferred follow-up.
- Re-running the full `build-grid-maze.mjs` generator (route-change risk) — the assigner mutates only `synapses[].location`.
- Any economy / gacha / route / Dexie / R2 change.

## Decisions

### D1 — Assigner mutates the committed graph in place; does NOT re-run the generator
A standalone `scripts/assign-circuit-locations.mjs` reads the committed `grid-graph.json`, assigns `location` to each `synapses[]` entry from the content pool, and writes the file back. It does NOT regenerate routes/nodes/weave (re-running `build-grid-maze.mjs` risks a different layout if rot.js/params drift). Guarantees the maze is byte-identical except the added `location` keys. Verified by diffing the non-synapse fields.
- *Alternative rejected*: fold assignment into `build-grid-maze.mjs` — couples naming to full regeneration; route-change risk.

### D2 — Name pool lives in content; assignment is deterministic
`packages/content-neurons-tw/src/circuit-locations.ts` exports `CIRCUIT_LOCATIONS` (the ~105 names: `{ zh, en, type }`). The assigner sorts synapses by cell `(y,x)` (stable) and assigns pool entries round-robin (135 synapses > 105 names → ~30 deterministic repeats; acceptable — two nearby crossings can share a region name). Content ownership keeps the names maintainable + lets the caption show 中文.
- *Alternative rejected*: store names only in the script — harder to maintain / reuse.

### D3 — Store the resolved display string on the synapse; derive at display time
`grid-graph.json synapses[].location` stores the 中文 display string directly (e.g., `"弓狀束"`). The runtime helper `synapseLocationFor(familyId, slotIndex)` finds the family's node by `slotIndex`; if `node.synapse`, finds the `GRID_SYNAPSES` entry at `node.cell` and returns its `location` (else `null`). `GridSynapse.location?: string` added to the type. This is a pure lookup — no variant state.
- *Alternative considered*: store an index into the pool — needs the pool at runtime for display; storing the string is simplest and self-contained.

### D4 — Surface via the single caption helper (one edit → all sites)
`variant-caption.ts` gains the location clause: when `synapseLocationFor(row.familyId, row.slotIndex)` is non-null, the caption weaves 「在 <location> 尋獲」 into the line. Because `variantBirthCaption` is the only caption helper (used by the mint modal + collection detail + instance tooltips), one edit covers every display site. Exact wording (prefix vs suffix, 元老 rows) locked at the verify visual pass.
- 元老 (no-provenance) rows: still get a location if their slot node is at a named crossing (location is independent of provenance).

### D5 — Neuroscience grounding (project rule)
Names come only from the OE-grounded pool (`circuit-locations.ts`), each carrying its 中文/English + type; the scratch file retains the PMIDs. The ⚠-flagged rows (Claustrum function debated; squid giant synapse invertebrate) are included as *locations* only — the caption asserts no function, so this is safe.

## Risks / Trade-offs

- **Re-assignment churn** → `grid-graph.json` diff is additive (`location` keys only); CI/tests unaffected; verify the route fields are unchanged after running the assigner.
- **Name repeats (135 > 105)** → acceptable (region names can recur); could curate to 135 later if it reads oddly.
- **Padded non-synapse nodes have no location** → caption falls back gracefully (existing behavior).
- **Bundle size** → +135 short strings in `grid-graph.json` (~a few KB); negligible.

## Migration Plan

- **Deploy**: client-only data + caption change; ships with the maze redesign on the next `track-neurons` → `main` merge (`deploy-cf-pages.yml`). No Worker/migration step.
- **Rollback**: revert the change → `synapses[].location` keys ignored (helper returns null → caption falls back); no data touched.

## Open Questions

1. **Caption wording** — 「在弓狀束尋獲」 as a prefix vs suffix vs separate 稱號 line; lock at the verify visual pass.
2. **Curate pool to exactly 135** (eliminate repeats) vs accept ~30 repeats — first cut accepts repeats; revisit if it reads oddly.
3. **Show English alongside 中文** in the caption (med-student value) vs 中文-only (cleaner) — first cut 中文-only.
