# Neurons game-animation packs — roadmap state (handoff 2026-06-08)

> Cross-change context for `/spec resume`. Source plan: the grill summary
> `~/.claude/scratch/grilled-neurons-game-animations-2026-06-07.md` (full 3-pack
> decomposition + the user's 4 grill decisions: 全部接 / 3 packs / 願意排生圖 but
> 獨立第三包 / 整體 juice 升級 / 先核心 loop).

## Where we are

Decided to add the parked game-animation work as **3 OpenSpec changes**, in order:

### Pack 1 — `add-neurons-loop-celebration-animations` ✅ DONE (committed, archived; NOT deployed)
- **A 二回目全腦點亮完成慶祝**: per-family live completion (`target` non-null→null)
  → one-shot CelebrationHalo+ParticleBurst overlay + 「{科}・全腦點亮！」 banner on the
  homepage maze band; **synced one-shot** marker (per-family `mazeSecondLapCelebrated:<fam>`
  meta key in `SYNCED_META_KEYS`, no replay cross-session/device, no upgrade backfill);
  reduced-motion → overlay null. Detection lives in `OverviewPage` (prev/next `target`
  ref-diff on the single `useMaze`).
- **B 連答 streak 升階**: `QuizModal` reads post-answer streak → scales the spike-train
  burst intensity continuously (`streakFeedbackIntensity` = `1 + streak·0.12`, cap 2.2;
  `lib/motion/streakIntensity.ts`); stroke/glow only, timing tokens unchanged, zero persistence.
- **Sync**: R2 neurons bundle `SCHEMA_VERSION` **18→19** (additive marker meta keys,
  reader-tolerant). **No Dexie `.version()` bump.**
- **Commits on `track-neurons`**: `aff03a3` (feat, verify-passed) + `a3df71c` (spec archive).
  Archived at `openspec/changes/archive/2026-06-08-add-neurons-loop-celebration-animations/`.
  Specs synced: `neurons-maze-second-lap` (+2 reqs) + `neurons-motion-library` (+1 req).
- **Verified**: 405 tests / typecheck / dexie-lint / simplify (3 cleanups) / Chrome MCP dev
  smoke (A end-to-end live fire + synced marker + no-replay on reload; B via /motion-demo
  spike stroke 1.5 @ i=1 + unit test). reduced-motion = code-verified (not OS-toggled).
  Live-quiz spike screenshot not deterministically caught (harness friction, not a defect).

### Pack 2 — `polish-neurons-juice-animations` ✅ DONE (committed, archived; NOT deployed)
Pure code, zero asset, zero schema. Shipped **6** animations (orphan audit cut 3 of the
original grill list that hit deleted/absent mechanics — see below):
- DMN 消耗品啟用爆發 (`BackpackPanel` `ParticleBurst`)
- Leaderboard rank-up: rank number `NumberTickUp` tween + improve `CelebrationHalo` (per-filter ref, no false-fire on tab switch)
- Route 轉場「神經訊號 wipe」(`App.tsx` `AnimatedRoutes` + framer `AnimatePresence`; **SPA 三件套 re-verified incl. F5**)
- 答錯 **出征 band** synapse-decay dim (re-targeted from the deleted connectome tree → `MazeExpedition`; reuses `SYNAPSE_TIMINGS.decay`)
- 夥伴答對 pulse glow (`MazeExpedition`)
- Walker easing (`MazeGrid` maze-space exponential smoothing; camera transform untouched)
- New in-memory `lib/maze/answer-feedback.ts` emitter (mirror `maze-focus.ts`); `connectome` emits on correct/wrong. All reduced-motion gated.

**Orphan audit — 3 grill items CUT** (打到已刪/不存在機制):
1. NumberTickUp ↔ reputation/score — neurons has neither (reputation = 二階 carry-over comment; `score` 0 hits). The one real use (rank count-up) folded into the leaderboard item.
2. 答錯 connectome 樹 decay — `ConnectomeTreeSvg` 已刪 (maze promote-to-home 取代); re-targeted to the band.
3. evolve sheet → `DmnDrawModal` — DMN draw yields consumable/equipment, never a neuron variant; evolve belongs in `VariantUnlockModal`.

**Commits on `track-neurons`**: `5ae8f10` (feat, verify-passed) + `ecf59f6` (spec archive).
Archived at `openspec/changes/archive/2026-06-08-polish-neurons-juice-animations/`. New capability spec
`openspec/specs/neurons-juice-animations/` (7 reqs) synced.
**Verified**: typecheck / 408 vitest (+3 answer-feedback) / dexie-fixture lint OK (0 schema) /
`/simplify` 4-agent all clean / Chrome MCP (SPA 三件套 in-app+direct+F5, 答題流程, 答錯 band decay fires,
console clean). Companion pulse / walker easing / rank tween = code + unit verified (companion rare,
rAF bg-throttle, localhost R2 push fails → no rank data).

### Pack 3 — `generate-neurons-animation-sheets` ⏳ NOT STARTED (independent, deploy last)
Image-gen (Gemini-first → codex fallback): companion march sheets ×2
(oligodendrocyte + astrocyte) + slot-5 手繪 showpiece ×5 (科 TBD). Slow / quota-gated /
**prod-coherent only** — merge last, don't deploy half-done sheets.

## Pending decision (resume here)

**Pack 1 + Pack 2 are BOTH on `track-neurons`, committed + archived, but NOT merged to main / NOT
deployed** (`track-neurons` 6 commits ahead of main as of 2026-06-08). User chose to batch-deploy
1+2 together (one CF Pages deploy).

**Next action when ready to ship**: merge `track-neurons` → `main` (= deploy to
`med-study-rpg.com/neurons/`, CF Pages, outward-facing → confirm first). Then **prod verify**:
- SPA 三件套 on prod (in-app nav + direct URL + F5) — Pack 2's route-transition change makes this mandatory.
- A/B spot-check: Pack 1 二回目慶祝 + streak 升階; Pack 2 答錯 band decay + DMN 啟用爆發 + route wipe.
- Watch both `deploy-cf-pages.yml` + (if touched) `deploy-worker.yml` go green (`gh run list`).

**Pack 3** (`generate-neurons-animation-sheets`, image-gen) still NOT STARTED — independent, deploy
last (prod-coherent only). Can run its gen batch anytime in parallel; merge after 1+2.
