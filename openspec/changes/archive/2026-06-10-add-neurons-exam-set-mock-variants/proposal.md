## Why

Change ① (`add-neurons-exam-set-mock-mode`, shipped) added the 模擬考試 (full-paper closed-book) mode but gives no progression reward beyond batch-writing 錯題 into the ⚔️出征 pool. Per the 2026-06-10 grill (Facet 4/5), submitting a mock exam should grant a reward burst — and the owner chose a **brand-new, mock-exam-exclusive collectible neuron-variant line**, deliberately kept separate from the maze taxonomy collection. This carves out a fifth collection track that does NOT touch the four locked progression lanes (energy / mastery / equipment-companion / DMN-supplies, per `openspec/decisions/2026-06-04-neurons-progression-systems-roadmap.md`), the "迷宮 = 唯一收集管道" invariant, the DMN fate-card axis, or the maze energy economy. Higher exam score → higher chance of a rarer variant.

## What Changes

- **New gacha collection line**: on mock-exam 全部送出 (submit), in the same flow that already batch-writes 錯題本 and credits 出征, roll one mock-exam variant from an **independent** pool weighted by score tier (higher score → rarer). Pity guarantees a rare after a dry streak; a per-paper daily cap prevents farming re-submits.
- **New Dexie table `mockExamVariants`** (Dexie v19→**v20**, additive no-callback upgrade + sibling v19→v20 upgrade fixture per `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`), holding collected mock variants. **NOT** reusing `neuronVariants` (whose PK `[familyId+slotIndex]` is bound to the maze taxonomy slot grid and is meaningless for mock variants).
- **Cross-device sync**: R2 `SCHEMA_VERSION` 20→**21** with a NEW `TableAdapter` mirroring `neuronVariantsAdapter`'s LWW pattern; roll-result dedup so re-applying a bundle is idempotent. Reader-tolerance (forward-compat) already exists.
- **MVP catalog + placeholder sprites** in this change; **real 立繪 deferred** to a follow-up `generate-mock-variant-sprites` (codex gpt-image-2), mirroring how `add-neurons-acceleration-system` shipped placeholder + `generate-acceleration-sprites`.
- **Collection view**: a section/view showing the player's collected mock variants + own count; a roll/reveal moment on submit (reuse `CelebrationHalo` / `ParticleBurst` where sensible).
- **No leaderboard change**: mock variants are NOT counted toward the public leaderboard variant count (which stays = maze 220-taxonomy progress). Zero D1 / sync Worker / leaderboard spec changes.

## Capabilities

### New Capabilities
- `neurons-mock-variant-gacha`: the MVP catalog shape, score-tier→rarity roll, pity, per-paper daily cap, the `mockExamVariants` Dexie table + R2 adapter (schema/sync + idempotent dedup), and the collection-view requirements.

### Modified Capabilities
- `neurons-exam-set-expedition`: the mock-exam submit flow ADDS the variant-roll trigger after the existing 錯題本 / 出征 credit (additive — existing submit behavior unchanged).

## Impact

- **Code (neurons-tw only)**: new `mockExamVariants` table in `apps/neurons-tw/src/lib/db.ts` (v20) + upgrade fixture; new R2 adapter in `apps/neurons-tw/src/lib/sync/tables.ts` + `SCHEMA_VERSION` bump in `sync/r2/bundles.ts`; new gacha service (mirror `variant-gacha.ts` rarity/pity, INDEPENDENT pool); roll-trigger hook in `MockExamRunner.tsx` submit handler; new collection view component; MVP catalog + placeholder sprite map in `packages/content-neurons-tw/`.
- **Schema/sync footprint**: Dexie v20 (additive), R2 `SCHEMA_VERSION` 21, one new synced adapter + one new `SYNCED`-tracked table. No `mock-exam.ts` / relocated `exam-set` engine touch.
- **No backend**: no D1, no Worker, no leaderboard, no Supabase change.
- **Neuroscience-fact guardrail** (per project `CLAUDE.md` / `project.md` M_3rd rule): any neuroanatomy / neurophysiology claim in the variant catalog (NT branch / anatomical location / mechanism / persona neuro-fact) MUST be OE-anchored (`/oe` / `/oe-triangulate`, PubMed PMID) before catalog identities are locked. The MVP placeholder catalog scaffolds the structure; variant neuro-identities are flagged for OE anchoring before finalizing (persona visual / story hooks may be freer).
- **Product guardrail**: rolls are triggered ONLY by mock-exam submit gameplay — no IAP / real-money / ad-reward path.
