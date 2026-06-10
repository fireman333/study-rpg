## Context

Two MVP deferrals from `add-neurons-exam-set-mock-variants`: catalog neuro-facts were textbook-canonical placeholders (`neuroAnchorTODO`), and the 13 entries rendered a 🧬 glyph. This change closes both.

## Goals / Non-Goals

**Goals:** every catalog entry OE-anchored; every entry has a real sprite; zero schema/sync change.

**Non-Goals:** no gacha-number retune (separate, dogfood); no new catalog entries; no maze/leaderboard touch.

## Decisions

**D1 — OE anchoring via grouped queries.** 13 neuro-identities were anchored with 6 grouped OpenEvidence queries (monoamine sources / hippocampal memory / cortical E-I / attention+WM / cerebellum+thalamus / concept cells), each returning crossref-validated landmark papers. One representative DOI is stored per entry. The `pmids?` field is renamed `refs?` because OE returns crossref-validated DOIs (PMID-equivalent evidence); the project rule's intent (evidence-anchored, not from memory) is satisfied. `neuroAnchorTODO` derives from `refs.length === 0`, so it auto-stays-true for any future unanchored entry.

**D2 — Sprites via present-only glob (mirror connectors).** Generated PNGs land in `sprites/mock-variants/<variantId>.png`; a Vite `import.meta.glob` keys present files as `mock-variant:<id>` and spreads them into `SPRITE_MAP`. Missing files leave the key unresolved → the consumer's 🧬 fallback fires. So a partial sprite set degrades gracefully (any failed gen just keeps its glyph).

**D3 — Sprite generation.** codex `gpt-image-2` (Gemini auth dead), 384×384, per the repo `SPRITE_GENERATION.md` recipe + each neuron's morphology/persona. Output is smoother (~50–100 KB, more colors) than the crunchier 16-color maze sprites — acceptable, the mock line is visually distinct. Each output is size-verified (>40 KB real vs ~8 KB fake-ImageMagick) before wiring.

## Risks / Trade-offs

- **[codex rate-limits / fakes success]** → per-file size check; missing/fake sprites just keep the glyph fallback (no broken images). Smoke confirmed the backend is live.
- **[Style mismatch with maze sprites]** → accepted; the mock collection is a separate line with its own visual identity.

## Migration Plan

Additive content + assets only. No data migration. `spriteKey` strings unchanged, so existing collections render the new art automatically.
