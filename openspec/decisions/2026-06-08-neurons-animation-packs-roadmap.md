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

### Pack 2 — `polish-neurons-juice-animations` ⏳ NOT STARTED (do next)
Pure code, zero asset, expected zero schema. Scope:
NumberTickUp wiring (reputation/energy/score) · C DMN 消耗品啟用爆發 ·
D leaderboard rank-up tween · E route transition (神經訊號 wipe — **must re-run SPA
三件套 incl. F5**) · F 答錯 synapse decay cue (reuse `SYNAPSE_TIMINGS.decay`) ·
G 夥伴 idle reaction (blink/pulse on correct) · walker easing tween (replace raw
transform) · evolve sheet → DmnDrawModal.
**Next action**: `/opsx:propose polish-neurons-juice-animations`.

### Pack 3 — `generate-neurons-animation-sheets` ⏳ NOT STARTED (independent, deploy last)
Image-gen (Gemini-first → codex fallback): companion march sheets ×2
(oligodendrocyte + astrocyte) + slot-5 手繪 showpiece ×5 (科 TBD). Slow / quota-gated /
**prod-coherent only** — merge last, don't deploy half-done sheets.

## Pending decision (resume here)

**Pack 1 is on `track-neurons`, committed + archived, but NOT merged to main / NOT deployed.**
merge→main = deploy to `med-study-rpg.com/neurons/` (CF Pages, outward-facing → confirm first).
Options offered, user undecided at handoff:
1. **Hold deploy, batch with pack 2** (my recommendation — one CF deploy covers 1+2).
2. Deploy pack 1 solo now (merge + watch CF run + prod SPA three-piece + A/B spot-check = task 4.5).
3. Hold entirely.

Whichever: if deploying, also do **task 4.5** (prod SPA in-app nav + direct URL + F5 + A/B spot-check).
