## Context

`add-neurons-connector-neuron-family` shipped the 55-card connector collection rendering procedural split-color placeholders, with the theme registry already wired to accept real per-key sprites (`packages/theme-pixel-neurons/src/sprites.ts` glob `../sprites/connectors/*.png` → `connector:<a|b>`, present-files-only). This change produces and drops in the 55 PNG assets — no code, schema, or sync touched.

## Goals / Non-Goals

**Goals:**
- Ship 55 transparent 384×384 connector sprites so every card upgrades from procedural placeholder to a rendered sprite.
- Keep the procedural split-color card as the fallback (missing sprite → never a broken image).
- Zero code / Dexie / R2 / Worker / D1 / owner-dashboard change.

**Non-Goals:**
- Per-pair-themed unique art (intentionally generic; the frame carries subject identity).
- Any change to connector unlock mechanics, the brain-map, or the connectome wire state.

## Decisions

- **D1 — codex `gpt-image-2`, not Gemini.** The Gemini MCP path is a confirmed dead-end (`account_status=UNAUTHENTICATED` despite fresh cookies + valid web session + latest `gemini-webapi`; full diagnosis in `~/.claude/scratch/neurons-connector-sprites-deferred-2026-06-08.md`). codex `gpt-image-2` works, is on-model, and is fully automated (no manual send). Recipe: `cd /tmp && codex exec -m gpt-5.5 --sandbox workspace-write --skip-git-repo-check "<prompt> Save to <path>. $imagegen" < /dev/null`.
- **D2 — 14 generic variants distributed across 55, not 55 unique.** The original (Gemini-grid) plan assumed cheap per-pair-distinct art. With Gemini dead, codex per-call costs ~29K reasoning tokens and its daily image quota blew at 53/55 in a prior batch — 55 individual calls is quota-risky. Since the card's split-color frame already carries the two-subject identity, the sprite is pure 造型 charm; 14 distinct variants cyclically distributed (13×4 + 1×3) gives ample variety with zero quota risk. Owner-approved.
- **D3 — post-process recipe.** Each raw codex output (~1 MB, ~1400² off-white RGB) → `magick` chroma-key the off-white corner, fit within 384 preserving aspect, pad to 384² transparent, quantize 16 colors → ~12–25 KB PNG32. Validated against the prior validated sample.
- **D4 — filename → key mapping.** File `<familyA>__<familyB>.png`; the registry splits on `__`, sorts, and `|`-joins → `connector:<a|b>` (matches the canonical pairKey). All 55 manifest filenames round-trip to the canonical pairkeys (verified, 0 mismatch). Variant→pairkey assignment is cyclic over the sorted pairkey list.

## Risks / Trade-offs

- **Repeated sprites (~4× each).** A given variant appears on ~4 cards. Acceptable: cards are already frame-differentiated by subject color, and players unlock connectors non-sequentially.
- **Tiny spark-core transparency hole.** fuzz-14 chroma-key on the near-white spark core can punch a single transparent pixel on intense-spark variants — negligible at card render size, and fuzz-14 is the owner-validated value (lower fuzz leaves off-white halos).
- **gpt-image-2 burst ServerError.** Concurrency-4 generation triggered ServerError on a few calls (dud/missing); regenerating the shortfall serially (concurrency 1) recovered to 14 distinct. Documented for future asset batches.
